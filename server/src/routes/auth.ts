import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { clientIp } from '../http.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { parsed, validate } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.js';
import { loginSchema } from '../validators.js';
import type { Role } from '../types.js';

export const authRouter = Router();

authRouter.post('/login', validate('body', loginSchema), async (req, res, next) => {
  try {
    const { email, password } = parsed(req, 'body', loginSchema);
    const result = await query<{
      id: number;
      email: string;
      name: string;
      role: Role;
      password_hash: string;
    }>('SELECT id, email, name, role, password_hash FROM users WHERE email = $1', [email]);

    const user = result.rows[0];
    // Compare against a dummy hash when the user is unknown so that a missing
    // account and a wrong password take a similar amount of time.
    const hash = user?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) {
      throw new HttpError(401, 'Invalid email or password');
    }

    req.session.regenerate((error) => {
      if (error) {
        next(error);
        return;
      }
      req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
      recordAudit({ actorUserId: user.id, action: 'auth.login', ip: clientIp(req) }).then(
        () => res.json({ user: req.session.user }),
        next,
      );
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const user = currentUser(req);
    await recordAudit({ actorUserId: user.id, action: 'auth.logout', ip: clientIp(req) });
    req.session.destroy((error) => {
      if (error) {
        next(error);
        return;
      }
      res.clearCookie('refunds.sid');
      res.status(204).end();
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: currentUser(req) });
});
