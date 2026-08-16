import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-csrf-token';

/** Issues the token for the current session. Called once, just after login. */
export function issueCsrfToken(req: Request): string {
  const token = randomBytes(32).toString('hex');
  req.session.csrfToken = token;
  return token;
}

export function csrfToken(req: Request): string {
  return req.session.csrfToken ?? '';
}

/**
 * Double-submit check on state-changing requests: the caller has to echo the
 * session's token in a header, which a cross-site page cannot read. The cookie
 * is already `sameSite: 'lax'`; this is the second line of defence so relaxing
 * the cookie or CORS settings later cannot silently open the API up.
 */
export function requireCsrfToken(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const expected = req.session.csrfToken;
  const provided = req.get(CSRF_HEADER);
  if (!expected || !provided || !equals(expected, provided)) {
    next(new HttpError(403, 'Missing or invalid CSRF token'));
    return;
  }
  next();
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
