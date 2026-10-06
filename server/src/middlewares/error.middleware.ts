import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // Handle unexpected or database errors
  const isProd = process.env.NODE_ENV === 'production';
  const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';

  console.error('[Unhandled Error]:', err);

  res.status(500).json({
    success: false,
    message: isProd ? 'An unexpected server error occurred.' : errorMessage,
    ...(isProd ? {} : { stack: err instanceof Error ? err.stack : undefined }),
  });
}
