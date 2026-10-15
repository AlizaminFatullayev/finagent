import createClient from 'openapi-fetch';
import { API_BASE, authFetch } from '../auth/session';
import { toApiError } from './errors';
import type { paths } from './schema';

/** Typed client generated from docs/openapi.json; every call carries the in-memory access token. */
export const api = createClient<paths>({ baseUrl: API_BASE, fetch: authFetch });

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Returns the success body or throws an ApiError built from the error envelope. */
export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok || data === undefined) throw toApiError(response, error ?? null);
  return data;
}
