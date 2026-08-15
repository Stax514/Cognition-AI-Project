import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { config, isProduction } from './config.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { requireAuth } from './middleware/auth.js';
import { requireCsrfToken } from './middleware/csrf.js';
import { authRouter } from './routes/auth.js';
import { refundsRouter } from './routes/refunds.js';
import './types.js';

export function createApp() {
  const app = express();

  // Only trust X-Forwarded-For when a reverse proxy really is in front,
  // otherwise a client could choose the IP written to the audit log.
  if (config.trustProxy) {
    app.set('trust proxy', config.trustProxy);
  }
  app.use(express.json({ limit: '100kb' }));
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(
    session({
      name: 'refunds.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRouter);

  // Everything below this line requires a session; each router additionally
  // declares the role it needs, so a new route is never accidentally public.
  app.use('/api', requireAuth);
  app.use('/api', requireCsrfToken);
  app.use('/api/refunds', refundsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
