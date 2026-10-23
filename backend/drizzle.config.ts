import { defineConfig } from 'drizzle-kit';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

for (const file of ['.env.local', '.env'])
  if (existsSync(file)) loadEnvFile(file);

if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required to run Drizzle commands');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
