import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { clientIp } from '../http.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { csrfToken, issueCsrfToken, requireCsrfToken } from '../middleware/csrf.js';
import { HttpError } from '../middleware/errors.js';
import { parsed, validate } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.js';
import { loginSchema } from '../validators.js';
import type { Role } from '../types.js';

export const authRouter = Router();

// Unknown emails are compared against this real hash so that they cost the same
// bcrypt work as a known account. bcrypt rejects anything that is not a valid
// 60 character hash immediately, which would leak the difference in timing.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomUUID(), 10);

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
    const hash = user?.password_hash ?? DUMMY_PASSWORD_HASH;
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
      const token = issueCsrfToken(req);
      recordAudit({ actorUserId: user.id, action: 'auth.login', ip: clientIp(req) }).then(
        () => res.json({ user: req.session.user, csrfToken: token }),
        next,
      );
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', requireAuth, requireCsrfToken, async (req, res, next) => {
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

// Returns the CSRF token too, so a page reload can restore it without the
// frontend ever having to store it outside memory.
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: currentUser(req), csrfToken: csrfToken(req) });
});
