/**
 * The single place that knows how this API speaks.
 *
 * Four concerns live here so no screen repeats them: cookies, the CSRF header,
 * envelope unwrapping, and the silent refresh retry. Everything above this
 * file deals in plain data and typed errors.
 */

const BASE = "/api";

export interface ApiErrorDetails {
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
  violations?: { rule: string; detail: string }[];
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: ApiErrorDetails,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field level messages, ready to be applied back onto a form input. */
  get fieldErrors(): Record<string, string[] | undefined> {
    return this.details?.fieldErrors ?? {};
  }
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  pagination?: OffsetPagination | CursorPagination;
}

interface FailureEnvelope {
  success: false;
  error: { code: string; message: string; details?: ApiErrorDetails };
}

export interface OffsetPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface CursorPagination {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Paged<T> {
  items: T[];
  pagination: OffsetPagination & CursorPagination;
}

/**
 * A refresh in flight is shared. Without this, five queries failing with 401
 * at the same moment would fire five refreshes, and because refresh tokens
 * rotate on use, four of them would present an already-rotated token. The
 * server reads that as theft and revokes the whole chain, logging the user out
 * for the crime of having a busy screen.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Pricewise-Client": "web" },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers all observe the same
      // outcome before a fresh attempt becomes possible.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Internal. Guards against an infinite refresh loop. */
  isRetry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, isRetry = false } = options;

  const response = await fetch(`${BASE}${path}`, {
    method,
    // Cookies are httpOnly, so JavaScript never sees the token. They travel
    // automatically, which is the whole point of the design.
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      // A cross-site HTML form cannot set a custom header, so requiring one
      // rejects forged submissions before they reach a handler.
      "X-Pricewise-Client": "web",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });

  // A 401 on an ordinary call means the 15 minute access token expired. Try
  // one refresh and replay. The isRetry guard matters: without it a genuinely
  // expired session becomes an infinite loop of refresh and retry.
  if (response.status === 401 && !isRetry && !path.startsWith("/auth/")) {
    if (await attemptRefresh()) {
      return request<T>(path, { ...options, isRetry: true });
    }
  }

  // 204 carries no body and no envelope, so there is nothing to unwrap.
  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | SuccessEnvelope<T>
    | FailureEnvelope
    | null;

  if (!response.ok || !payload || payload.success === false) {
    const error = payload && payload.success === false ? payload.error : null;
    throw new ApiError(
      error?.code ?? "NETWORK_ERROR",
      error?.message ?? "Something went wrong. Please try again.",
      response.status,
      error?.details,
    );
  }

  return payload.data;
}

/** Same as request, but keeps the pagination block the envelope carries. */
async function requestPaged<T>(path: string, signal?: AbortSignal): Promise<Paged<T>> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Pricewise-Client": "web" },
    ...(signal ? { signal } : {}),
  });

  if (response.status === 401) {
    if (await attemptRefresh()) return requestPaged<T>(path, signal);
  }

  const payload = (await response.json().catch(() => null)) as
    | SuccessEnvelope<T[]>
    | FailureEnvelope
    | null;

  if (!response.ok || !payload || payload.success === false) {
    const error = payload && payload.success === false ? payload.error : null;
    throw new ApiError(
      error?.code ?? "NETWORK_ERROR",
      error?.message ?? "Something went wrong. Please try again.",
      response.status,
      error?.details,
    );
  }

  const pagination = payload.pagination ?? {};
  return {
    items: payload.data,
    pagination: {
      page: 1,
      pageSize: payload.data.length,
      totalCount: payload.data.length,
      totalPages: 1,
      nextCursor: null,
      hasMore: false,
      ...pagination,
    },
  };
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { ...(signal ? { signal } : {}) }),
  paged: requestPaged,
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Builds a query string, dropping keys that are absent or empty. */
export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}
