export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "REFRESH_INVALID"
  | "FORBIDDEN_ROLE"
  | "CSRF_REQUIRED"
  | "NOT_FOUND"
  | "EMAIL_IN_USE"
  | "INVITE_INVALID"
  | "RATE_LIMITED"
  | "AGENT_TIMEOUT"
  | "LLM_UNAVAILABLE"
  | "EXECUTION_FAILED"
  | "CONFLICT"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  REFRESH_INVALID: 401,
  FORBIDDEN_ROLE: 403,
  CSRF_REQUIRED: 403,
  NOT_FOUND: 404,
  EMAIL_IN_USE: 409,
  INVITE_INVALID: 400,
  RATE_LIMITED: 429,
  AGENT_TIMEOUT: 504,
  LLM_UNAVAILABLE: 503,
  EXECUTION_FAILED: 502,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

// Business logic throws these; one errorHandler middleware maps them to status
// codes. No controller ever writes res.status(500) (rule R5).
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`);
export const unauthenticated = (m = "Authentication required") =>
  new AppError("UNAUTHENTICATED", m);
export const forbidden = (m = "Insufficient permissions") => new AppError("FORBIDDEN_ROLE", m);
export const conflict = (m: string) => new AppError("CONFLICT", m);
