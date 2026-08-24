import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

/** Guards routes meant only for the Python ML service to call, never a browser client. */
export function requireInternalSecret(req: Request, _res: Response, next: NextFunction) {
  const secret = req.headers['x-internal-secret'];
  if (secret !== env.internalServiceSecret) {
    throw ApiError.unauthorized('Invalid internal service secret');
  }
  next();
}
