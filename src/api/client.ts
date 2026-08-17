import PocketBase, { ClientResponseError } from "pocketbase";

// Strip trailing slashes so the SDK's own concatenation never produces a
// double slash, regardless of whether the deployed env var ends in "/".
// A bare "/" survives the strip: that is the same-origin build (the frontend
// served by PocketBase itself), and an empty base would make the SDK resolve
// requests against the current route instead of the site root.
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8090").replace(/\/+$/, "") || "/";

export const pb = new PocketBase(API_BASE_URL);

// The SDK cancels an in-flight request when an identical one is issued, which
// is exactly what React Query does on refetch/remount - leaving the caller with
// a spurious "autocancelled" rejection instead of data.
pb.autoCancellation(false);

/** Mirrors the axios response shape the service layer used to hand back, so
 * the query and mutation hooks stay unchanged. */
export interface ApiResponse<T> {
  data: T;
  status: number;
}

/** Errors are re-thrown in the shape the UI already reads
 * (`error.response.data.detail`), rather than PocketBase's ClientResponseError. */
export class ApiError<T = unknown> extends Error {
  readonly status: number;
  readonly response?: { data: T; status: number };

  constructor(message: string, status: number, data?: T) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (data !== undefined) {
      this.response = { data, status };
    }
  }
}

function logout() {
  pb.authStore.clear();
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

let refreshPromise: Promise<boolean> | null = null;

/** PocketBase has no separate refresh token: a still-valid auth token is
 * swapped for a fresh one. Shared across concurrent 401s so a burst of
 * requests only triggers a single refresh. */
function refreshAuth(): Promise<boolean> {
  refreshPromise ??= pb
    .collection("users")
    .authRefresh()
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  /** Resolve instead of throwing on 4xx, for the endpoints that communicate
   * game state ("Game not started yet.", "Wrong answer") in an error body. */
  acceptErrorBody?: boolean;
}

/** Calls one of the backend's custom game routes and normalizes the result.
 * PocketBase's own collection/auth endpoints are called through `pb` directly. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const { method = "GET", body, query, acceptErrorBody = false } = options;

  const send = () =>
    pb.send<T>(path, {
      method,
      body,
      query,
      // Without this the SDK caches by URL and cancels the previous call.
      requestKey: null,
    });

  try {
    return { data: await send(), status: 200 };
  } catch (error) {
    if (!(error instanceof ClientResponseError)) throw error;

    // Refresh is attempted for any stored token, not just an unexpired one:
    // a token PocketBase has already rejected is exactly the case where the
    // session needs to be either renewed or ended.
    if (error.status === 401 && pb.authStore.token) {
      if (await refreshAuth()) {
        try {
          return { data: await send(), status: 200 };
        } catch (retryError) {
          if (!(retryError instanceof ClientResponseError)) throw retryError;
          return handleFailure<T>(retryError, acceptErrorBody);
        }
      }
      logout();
    }

    return handleFailure<T>(error, acceptErrorBody);
  }
}

function handleFailure<T>(error: ClientResponseError, acceptErrorBody: boolean): ApiResponse<T> {
  if (acceptErrorBody && error.status >= 400 && error.status < 500) {
    return { data: error.response as T, status: error.status };
  }
  throw toApiError(error);
}

/** Unwraps a PocketBase error into the `{ detail }` body the UI expects.
 * Custom routes already answer with `detail`; PocketBase's own endpoints use
 * `message`, so that gets mapped across. */
export function toApiError<T = unknown>(
  error: unknown,
  mapBody?: (body: Record<string, unknown>, message: string) => T,
): ApiError<T> {
  if (!(error instanceof ClientResponseError)) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return new ApiError<T>(message, 0);
  }

  const body = (error.response ?? {}) as Record<string, unknown>;
  const message = (body.detail as string) ?? error.response?.message ?? error.message;
  const data = mapBody ? mapBody(body, message) : ({ detail: message, ...body } as T);

  return new ApiError<T>(message, error.status, data);
}
