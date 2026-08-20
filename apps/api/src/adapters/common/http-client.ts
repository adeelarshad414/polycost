import { AdapterApiError } from './adapter-errors';
import { ProviderId } from './cloud-provider-adapter';

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
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

function positiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export const defaultFetch: FetchLike = async (input, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    positiveIntEnv('PROVIDER_HTTP_TIMEOUT_MS', DEFAULT_HTTP_TIMEOUT_MS),
  );

  try {
    return await fetch(input, {
      ...(init as RequestInit | undefined),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export async function parseJsonResponse<T>(
  providerId: ProviderId,
  response: HttpResponseLike,
): Promise<T> {
  const maxBytes = positiveIntEnv(
    'PROVIDER_HTTP_MAX_RESPONSE_BYTES',
    DEFAULT_HTTP_MAX_RESPONSE_BYTES,
  );
  const declaredLength = Number(response.headers?.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new AdapterApiError(
      providerId,
      response.status,
      response.statusText,
      `provider pricing response is too large to buffer safely: ${declaredLength} bytes exceeds the ${maxBytes} byte cap. Use a filtered/streaming pricing endpoint instead of the full bulk export (raise PROVIDER_HTTP_MAX_RESPONSE_BYTES only if the host can parse it).`,
    );
  }

  const body = await response.text();

  if (!response.ok) {
    throw new AdapterApiError(providerId, response.status, response.statusText, body);
  }

  return JSON.parse(body) as T;
}
