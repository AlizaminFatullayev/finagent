import createClient from 'openapi-fetch';
import { API_BASE, authFetch } from '../auth/session';
import { toApiError } from './errors';
import type { paths } from './schema';

/** Typed client generated from docs/openapi.json; every call carries the in-memory access token. */
export const api = createClient<paths>({ baseUrl: API_BASE, fetch: authFetch });

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Returns the whole success body (`{ data, meta }`) or throws an ApiError built from the error envelope. */
export async function unwrapBody<T>(call: Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok || data === undefined) throw toApiError(response, error ?? null);
  return data;
}

/** Returns `data` of the success envelope, or throws an ApiError. */
export async function unwrap<T extends { data: unknown }>(call: Promise<Result<T>>): Promise<T['data']> {
  return (await unwrapBody(call)).data;
}
