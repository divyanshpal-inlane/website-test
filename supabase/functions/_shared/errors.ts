// Centralized error handling for the booking edge functions.
// Pure — no Deno imports so it is importable from the Node test harness.

import { jsonResponse } from "./cors.ts";

export class BookingError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "BookingError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isBookingError(e: unknown): e is BookingError {
  return e instanceof BookingError;
}

export function errorBody(e: unknown): unknown {
  if (isBookingError(e)) {
    return {
      error: {
        code: e.code,
        message: e.message,
        ...(e.details !== undefined ? { details: e.details } : {}),
      },
    };
  }
  return { error: { code: "internal", message: "Unexpected error" } };
}

export function errorStatus(e: unknown): number {
  if (isBookingError(e)) return e.status;
  return 500;
}

export function errorResponse(e: unknown): Response {
  const status = errorStatus(e);
  return jsonResponse(errorBody(e), status);
}