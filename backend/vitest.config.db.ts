import { defineConfig } from 'vitest/config';
import { assertTestDatabaseTarget } from '../scripts/test-db-guard.mjs';

if (!process.env.TEST_DATABASE_URL)
  throw new Error('請先設定專用 Neon 測試分支的 TEST_DATABASE_URL');
assertTestDatabaseTarget(
  process.env.TEST_DATABASE_URL,
  process.env.CONTEXT_FLOW_DB_TEST_PRODUCTION_TARGET,
);
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['server/**/*.db-spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL },
  },
});
