/**
 * Applies db/schema.sql using the admin connection. The script is idempotent,
 * so running it against an existing database is safe.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../src/config.js';

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  const client = new pg.Client({ connectionString: config.adminDatabaseUrl });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Schema applied.');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
