import type { AppError } from "./errors";

// Rule R4: no endpoint returns a bare array or string. The frontend has exactly
// one unwrapping function, so a new endpoint needs no new client-side plumbing.

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

export function ok<T>(data: T) {
  return { success: true as const, data };
}

export function okPaged<T>(data: T, pagination: OffsetPagination | CursorPagination) {
  return { success: true as const, data, pagination };
}

export function errorEnvelope(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
}

export function fromAppError(err: AppError) {
  return errorEnvelope(err.code, err.message, err.details);
}

export function offsetPagination(page: number, pageSize: number, totalCount: number) {
  return {
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}
