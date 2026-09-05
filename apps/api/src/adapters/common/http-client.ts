import { AdapterApiError, AdapterError } from './adapter-errors.js';
import { ProviderId } from './cloud-provider-adapter.js';

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
  // The response body stream, when available (real fetch exposes a web
  // ReadableStream; tests may inject a Node Readable). Used to stream-parse very
  // large provider bulk feeds instead of buffering them into memory.
  body?: unknown;
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
  },
) => Promise<HttpResponseLike>;

const DEFAULT_HTTP_TIMEOUT_MS = 60_000;
// Cap the response body we are willing to buffer + JSON.parse. Some provider
// bulk endpoints (e.g. the AWS EC2 Price List region index) are ~480 MB, which
// OOMs a whole-buffer JSON.parse. Fail fast with a clear diagnostic instead of
// hanging and exhausting memory.
const DEFAULT_HTTP_MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

export interface ProviderHttpDefaults {
  timeoutMs: number;
  bodyTimeoutMs: number;
  maxResponseBytes: number;
}

// Deployment-level limits. Seeded with safe fallbacks and overwritten once at
// bootstrap from the validated config schema. Kept as module state because the
// HTTP helpers are plain functions shared by six call sites, several of which
// are not Nest providers and cannot inject ConfigService.
let providerHttpDefaults: ProviderHttpDefaults = {
  timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
  bodyTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
  maxResponseBytes: DEFAULT_HTTP_MAX_RESPONSE_BYTES,
};

export function setProviderHttpDefaults(defaults: Partial<ProviderHttpDefaults>): void {
  providerHttpDefaults = { ...providerHttpDefaults, ...defaults };
}

export function getProviderHttpDefaults(): ProviderHttpDefaults {
  return providerHttpDefaults;
}

export const defaultFetch: FetchLike = async (input, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerHttpDefaults.timeoutMs);

  try {
    return await fetch(input, {
      ...(init as RequestInit | undefined),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

function tooLargeError(
  providerId: ProviderId,
  response: HttpResponseLike,
  observedBytes: number,
  maxBytes: number,
): AdapterApiError {
  return new AdapterApiError(
    providerId,
    response.status,
    response.statusText,
    `provider pricing response is too large to buffer safely: ${observedBytes} bytes exceeds the ${maxBytes} byte cap. Use a filtered/streaming pricing endpoint instead of the full bulk export (raise PROVIDER_HTTP_MAX_RESPONSE_BYTES only if the host can parse it).`,
  );
}

// Returns a per-chunk async iterator over a response body, supporting both the
// web ReadableStream that real fetch exposes (getReader) and a Node Readable /
// async-iterable that tests may inject. Returns undefined when no stream body is
// available (e.g. a test double that only implements text()).
function streamChunks(body: unknown): AsyncIterable<Uint8Array> | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  const maybeReader = body as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> };
  if (typeof maybeReader.getReader === 'function') {
    return {
      async *[Symbol.asyncIterator]() {
        const reader = maybeReader.getReader!();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              return;
            }
            if (value) {
              yield value as Uint8Array;
            }
          }
        } finally {
          reader.releaseLock?.();
        }
      },
    };
  }

  if (typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function') {
    return body as AsyncIterable<Uint8Array>;
  }

  return undefined;
}

// Reads the response body to a string while enforcing an overall byte cap and an
// overall wall-clock deadline. The cap is enforced *during* reading (H-B1: a
// chunked body with no Content-Length cannot silently buffer past the limit),
// and the deadline covers the whole body download (H-B2: fetch's own timeout
// only guards the headers, so a slow-loris body would otherwise hang untimed).
async function readBodyText(
  providerId: ProviderId,
  response: HttpResponseLike,
  maxBytes: number,
  timeoutMs: number,
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new AdapterApiError(
          providerId,
          response.status,
          response.statusText,
          `provider pricing response body did not complete within ${timeoutMs} ms`,
        ),
      );
    }, timeoutMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });

  const read = (async () => {
    const chunks = streamChunks(response.body);
    if (!chunks) {
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        throw tooLargeError(providerId, response, Buffer.byteLength(body, 'utf8'), maxBytes);
      }
      return body;
    }

    const collected: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of chunks) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        throw tooLargeError(providerId, response, total, maxBytes);
      }
      collected.push(chunk);
    }
    return Buffer.concat(collected.map((chunk) => Buffer.from(chunk))).toString('utf8');
  })();

  try {
    return await Promise.race([read, deadline]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

// Guard a follow-on pagination link (taken from a provider response body) before
// fetching it. Provider "next page" URLs are attacker-influenceable data: a
// compromised or spoofed feed could point them at an internal host to exfiltrate
// credentials or reach the metadata service (SSRF). Only follow links that share
// the exact scheme and host of the pinned pricing endpoint.
export function assertSameProviderOrigin(
  providerId: ProviderId,
  candidateUrl: string,
  pinnedUrl: string,
): void {
  let candidate: URL;
  try {
    candidate = new URL(candidateUrl);
  } catch {
    throw new AdapterError(
      providerId,
      `pagination link is not a valid absolute URL: ${candidateUrl}`,
    );
  }

  const pinned = new URL(pinnedUrl);
  if (candidate.protocol !== pinned.protocol || candidate.host !== pinned.host) {
    throw new AdapterError(
      providerId,
      `refusing to follow pagination link to ${candidate.protocol}//${candidate.host}: it does not match the pinned pricing host ${pinned.protocol}//${pinned.host} (possible SSRF)`,
    );
  }
}

export interface ParseJsonResponseLimits {
  /** Max bytes buffered before the response is rejected as too large. */
  maxBytes?: number;
  /** Overall wall-clock budget for reading the body. */
  bodyTimeoutMs?: number;
}

export async function parseJsonResponse<T>(
  providerId: ProviderId,
  response: HttpResponseLike,
  limits: ParseJsonResponseLimits = {},
): Promise<T> {
  // Limits are injectable per call; otherwise the deployment defaults apply.
  const maxBytes = limits.maxBytes ?? providerHttpDefaults.maxResponseBytes;
  const bodyTimeoutMs = limits.bodyTimeoutMs ?? providerHttpDefaults.bodyTimeoutMs;
  const declaredLength = Number(response.headers?.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw tooLargeError(providerId, response, declaredLength, maxBytes);
  }

  const body = await readBodyText(providerId, response, maxBytes, bodyTimeoutMs);

  if (!response.ok) {
    throw new AdapterApiError(providerId, response.status, response.statusText, body);
  }

  return JSON.parse(body) as T;
}
