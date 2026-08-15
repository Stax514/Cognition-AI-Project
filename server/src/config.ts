import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// The .env file lives at the repository root and is shared by the API,
// migrations and the seed script.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(repoRoot, '.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required('DATABASE_URL'),
  adminDatabaseUrl: required('ADMIN_DATABASE_URL'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  sessionSecret: required('SESSION_SECRET', 'dev-only-insecure-session-secret'),
  seedPassword: process.env.SEED_PASSWORD ?? 'Password123!',
};

export const isProduction = config.nodeEnv === 'production';
