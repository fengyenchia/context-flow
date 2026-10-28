import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  assertTestDatabaseIsIsolated,
  databaseTarget,
} from "./test-db-guard.mjs";

const fileEnv = (path) =>
  existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
const original = {
  ...fileEnv("backend/.env"),
  ...fileEnv("backend/.env.local"),
  ...process.env,
};
const testUrl =
  process.env.TEST_DATABASE_URL ||
  fileEnv("backend/.env.test.local").TEST_DATABASE_URL ||
  original.TEST_DATABASE_URL;
try {
  assertTestDatabaseIsIsolated(testUrl, original.DATABASE_URL);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
if (process.argv.includes("--check-only")) {
  console.log(
    "[OK] 測試資料庫目標已通過離線隔離檢查；未連線、未遷移、未執行測試。請另確認它確實是可丟棄的 branch。",
  );
  process.exit(0);
}
const env = {
  ...original,
  DATABASE_URL: testUrl,
  TEST_DATABASE_URL: testUrl,
  CONTEXT_FLOW_DB_TEST_PRODUCTION_TARGET: databaseTarget(original.DATABASE_URL),
  INITIAL_ADMIN_USERNAME: "",
  INITIAL_ADMIN_PASSWORD_HASH: "",
  COLLABORATION_ENABLED: "false",
  LIVEBLOCKS_SECRET_KEY: "",
  LIVEBLOCKS_WEBHOOK_SECRET: "",
  CANVAS_BACKUP_ENABLED: "false",
  CANVAS_BACKUP_BUCKET_NAME: "",
  DB_RESTART_PROBE: "",
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  R2_ACCOUNT_ID: "",
  R2_BUCKET_NAME: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
};
const commands = process.argv.includes('--collaboration-only') ? [
  ['node_modules/vitest/vitest.mjs', 'run', 'server/collaboration-lock.db-spec.ts', '--config', 'vitest.config.db.ts'],
] : [
  [
    "node_modules/drizzle-kit/bin.cjs",
    "migrate",
    "--config",
    "drizzle.config.ts",
  ],
  ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.config.db.ts"],
];
for (const args of commands) {
  const result = spawnSync(
    process.execPath,
    [resolve("backend", args[0]), ...args.slice(1)],
    { cwd: resolve("backend"), env, stdio: "inherit", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
