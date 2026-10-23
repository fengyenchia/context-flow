// Read-only production migration preflight. Never prints connection strings or rows.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('../backend/', import.meta.url));
for (const file of ['.env.local', '.env']) {
  const path = `${backend}/${file}`;
  if (existsSync(path)) loadEnvFile(path);
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
try {
  const tables = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
  const counts = {};
  for (const { table_name: name } of tables) {
    const [row] = await sql.query(`SELECT count(*)::text AS count FROM public."${name.replaceAll('"', '""')}"`);
    counts[name] = row.count;
  }
  const [ledger] = await sql.query("SELECT to_regclass('drizzle.__drizzle_migrations')::text AS name");
  const applied = ledger.name ? await sql.query('SELECT id, hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at') : [];
  const journal = JSON.parse(readFileSync(`${backend}/drizzle/meta/_journal.json`, 'utf8'));
  const migrations = journal.entries.map((entry) => {
    const hash = createHash('sha256').update(readFileSync(`${backend}/drizzle/${entry.tag}.sql`)).digest('hex');
    const match = applied.find((row) => Number(row.created_at) === entry.when);
    return { tag: entry.tag, timestamp: entry.when, applied: Boolean(match), hashMatches: match ? match.hash === hash : null };
  });
  const columns = await sql.query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_verification_tokens' ORDER BY ordinal_position");
  const constraints = await sql.query("SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'email_verification_tokens' ORDER BY constraint_name");
  console.log(JSON.stringify({ connectionFingerprint: createHash('sha256').update(process.env.DATABASE_URL).digest('hex').slice(0, 16), counts, applied, migrations, emailVerification: { columns, constraints } }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error.name, code: error.code || null, message: String(error.message).replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]') }));
  process.exitCode = 1;
}
