import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './errors.js';
import type { Role, SessionUser } from '../types.js';

/**
 * Authorisation is enforced here, on the server, for every route. The frontend
 * hides actions a user cannot perform, but that is cosmetic only.
 */

// Higher rank implies every permission of the lower ranks.
const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  agent: 2,
  approver: 3,
};

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session.user) {
    next(new HttpError(401, 'Authentication required'));
    return;
  }
  next();
}

/** Requires the session user to hold `role` or a higher-ranked role. */
export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.session.user;
    if (!user) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }
    if (ROLE_RANK[user.role] < ROLE_RANK[role]) {
      next(new HttpError(403, `Requires ${role} role`));
      return;
    }
    next();
  };
}

export function currentUser(req: Request): SessionUser {
  const user = req.session.user;
  if (!user) {
    throw new HttpError(401, 'Authentication required');
  }
  return user;
}
