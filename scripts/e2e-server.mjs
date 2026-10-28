import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";

const app = process.argv[2];
if (!["frontend", "backend"].includes(app))
  throw new Error("Expected frontend or backend");
const cwd = resolve(app);
const require = createRequire(resolve(cwd, "package.json"));
mkdirSync(".e2e", { recursive: true });
const log = createWriteStream(`.e2e/${app}.log`, { flags: "w" });
// Defined empty environment values override Next's local .env files. Never use
// the developer's Neon database, R2 bucket, email provider, or initial admin.
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    app === "frontend" ? "3100" : "3101",
  ],
  {
    cwd,
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: "",
      DATA_MODE: "memory",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      R2_ACCOUNT_ID: "",
      R2_BUCKET_NAME: "",
      R2_ACCESS_KEY_ID: "",
      R2_SECRET_ACCESS_KEY: "",
      INITIAL_ADMIN_USERNAME: "",
      INITIAL_ADMIN_PASSWORD_HASH: "",
      COLLABORATION_ENABLED: "false",
      COLLABORATION_E2E: "true",
      LIVEBLOCKS_SECRET_KEY: "",
      LIVEBLOCKS_WEBHOOK_SECRET: "",
      CANVAS_BACKUP_ENABLED: "false",
      CANVAS_BACKUP_BUCKET_NAME: "",
      PROJECT_INVITES_ENABLED: "false",
      FRONTEND_URL: "http://127.0.0.1:3100",
      PUBLIC_APP_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3101/api",
      JWT_ACCESS_SECRET: "e2e-only-access-secret",
      JWT_REFRESH_SECRET: "e2e-only-refresh-secret",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
child.stdout.on("data", (data) => {
  log.write(data);
  process.stdout.write(data);
});
child.stderr.on("data", (data) => {
  log.write(data);
  process.stderr.write(data);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill());
child.on("exit", (code) => {
  log.end();
  process.exitCode = code ?? 1;
});
