import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
export const notFound: RequestHandler = (_req, res) => { res.status(404).json({ error: 'NOT_FOUND', message: 'The requested endpoint does not exist.' }); };
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const customStatus = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  const status = error instanceof ZodError ? 400 : customStatus ?? 500;
  const message = error instanceof ZodError ? 'Request validation failed.' : error instanceof Error ? error.message : 'Unexpected server error';
  const clientMessage = status >= 500 && process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : message;
  console.error(JSON.stringify({ level: 'error', event: 'request_failed', status, message: status >= 500 ? (process.env.NODE_ENV === 'production' ? 'Internal server error' : message) : 'Request rejected' }));
  res.status(status).json({ error: status === 500 ? 'INTERNAL_ERROR' : status === 503 ? 'SERVICE_UNAVAILABLE' : status === 429 ? 'RATE_LIMITED' : status === 400 ? 'VALIDATION_ERROR' : 'REQUEST_FAILED', message: clientMessage });
};
