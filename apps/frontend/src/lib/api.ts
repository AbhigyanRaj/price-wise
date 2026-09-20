/**
 * The single place that knows how this API speaks.
 *
 * Four concerns live here so no screen repeats them: cookies, the CSRF header,
 * envelope unwrapping, and the silent refresh retry. Everything above this
 * file deals in plain data and typed errors.
 */

/**
 * The one place the API origin is decided.
 *
 * Development: VITE_API_URL is unset, so this is "/api". The Vite dev proxy
 * forwards that to localhost:4000 and strips the prefix, which keeps the
 * browser on a single origin and the auth cookies first-party.
 *
 * Production: VITE_API_URL is the Render origin, with no trailing slash and no
 * path, because the API mounts "/auth" and "/products" at the root. Both cases
 * therefore produce a correct URL from the same `${BASE}${path}` template.
 *
 * Exported because the SSE stream has to resolve against the same origin. Two
 * independent copies of this constant is how the "/api" prefix came to be
 * hardcoded in two files.
 */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? "/api";

const BASE = API_BASE;

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

/**
 * Turns "the server sent something that is not our envelope" into a message
 * that names the actual cause.
 *
 * There is one deployment mistake this catches, and it is the easy one to
 * make: shipping to Vercel without setting VITE_API_URL. API_BASE then falls
 * back to the relative "/api", the SPA rewrite answers it with index.html, and
 * every call in the app quietly receives a web page. Without this the analyst
 * sees "Something went wrong. Please try again." on every screen, which points
 * nowhere.
 */
function envelopeFailure(response: Response, body: string | null): ApiError {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/html")) {
    return new ApiError(
      "NETWORK_ERROR",
      `The API returned HTML instead of JSON for ${response.url}. ` +
        (API_BASE.startsWith("/")
          ? "VITE_API_URL is not set, so requests are hitting the frontend's own origin and the SPA rewrite is answering them."
          : "Check that VITE_API_URL points at the API and not at the frontend."),
      response.status,
    );
  }

  return new ApiError(
    "NETWORK_ERROR",
    body && body.length < 200
      ? `Unexpected response from the API: ${body}`
      : "Something went wrong. Please try again.",
    response.status,
  );
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

  const raw = await response.text();
  const payload = (() => {
    try {
      return JSON.parse(raw) as SuccessEnvelope<T> | FailureEnvelope;
    } catch {
      return null;
    }
  })();

  if (!payload) throw envelopeFailure(response, raw);

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : null;
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
async function requestPaged<T>(
  path: string,
  signal?: AbortSignal,
  isRetry = false,
): Promise<Paged<T>> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Pricewise-Client": "web" },
    ...(signal ? { signal } : {}),
  });

  // The isRetry guard matters here for the same reason it does in request():
  // without it, a 401 that survives a successful refresh recurses forever.
  if (response.status === 401 && !isRetry) {
    if (await attemptRefresh()) return requestPaged<T>(path, signal, true);
  }

  const raw = await response.text();
  const payload = (() => {
    try {
      return JSON.parse(raw) as SuccessEnvelope<T[]> | FailureEnvelope;
    } catch {
      return null;
    }
  })();

  if (!payload) throw envelopeFailure(response, raw);

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : null;
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
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
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
