import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { HttpError } from './errors.js';

type Source = 'body' | 'query' | 'params';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Values parsed by the `validate` middleware. */
      valid: Partial<Record<Source, unknown>>;
    }
  }
}

/**
 * Validates one request section against a schema and stores the parsed result
 * on `req.valid`, so route handlers only ever read typed, bounded values.
 */
export function validate<S extends ZodTypeAny>(source: Source, schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      next(new HttpError(400, 'Invalid request', details));
      return;
    }
    req.valid = { ...req.valid, [source]: result.data };
    next();
  };
}

/** Reads a value parsed by `validate` on the same request. */
export function parsed<S extends ZodTypeAny>(req: Request, source: Source, _schema: S): z.infer<S> {
  const value = req.valid?.[source];
  if (value === undefined) {
    throw new Error(`No validated ${source} for this request`);
  }
  return value as z.infer<S>;
}
