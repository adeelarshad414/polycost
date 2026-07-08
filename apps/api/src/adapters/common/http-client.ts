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

export const defaultFetch: FetchLike = async (input, init) =>
  fetch(input, init as RequestInit | undefined);

export async function parseJsonResponse<T>(
  providerId: ProviderId,
  response: HttpResponseLike,
): Promise<T> {
  const body = await response.text();

  if (!response.ok) {
    throw new AdapterApiError(providerId, response.status, response.statusText, body);
  }

  return JSON.parse(body) as T;
}
