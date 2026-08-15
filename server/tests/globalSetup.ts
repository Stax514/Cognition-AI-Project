import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tests run against the local database and rewrite its contents, so the schema
// and seed data are reapplied once before the suite.
export default function setup(): void {
  const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  execFileSync('npm', ['run', 'migrate'], { cwd: serverDir, stdio: 'inherit' });
  execFileSync('npm', ['run', 'seed'], { cwd: serverDir, stdio: 'inherit' });
}
