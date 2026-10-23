import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { assertTestDatabaseIsIsolated } from "./test-db-guard.mjs";

function environment(folder) {
  const values = {};
  for (const file of [folder + "/.env", folder + "/.env.local"])
    if (existsSync(file))
      Object.assign(values, parseEnv(readFileSync(file, "utf8")));
  return { ...values, ...process.env };
}
const backend = environment("backend");
const frontend = environment("frontend");
const production = process.argv.includes("--production");
const testFile = "backend/.env.test.local";
const testUrl =
  process.env.TEST_DATABASE_URL ||
  (existsSync(testFile)
    ? parseEnv(readFileSync(testFile, "utf8")).TEST_DATABASE_URL
    : undefined) ||
  backend.TEST_DATABASE_URL;
let failures = 0;
function check(label, valid, required = true) {
  console.log(
    `${valid ? "[OK]" : required ? "[待設定]" : "[選用，尚未設定]"} ${label}`,
  );
  if (!valid && required) failures++;
}
function validURL(value, protocols) {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
check(
  "backend DATABASE_URL（此檢查不會連線資料庫）",
  validURL(backend.DATABASE_URL, ["postgres:", "postgresql:"]),
);
for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"])
  check(`backend ${key}（至少 32 字元）`, (backend[key] || "").length >= 32);
check(
  "backend USER_API_KEY_ENCRYPTION_KEY（base64 32 bytes）",
  Buffer.from(backend.USER_API_KEY_ENCRYPTION_KEY || "", "base64").length ===
    32,
);
check(
  "backend RESEND_API_KEY / EMAIL_FROM",
  Boolean(backend.RESEND_API_KEY && backend.EMAIL_FROM),
);
const r2 = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];
check(
  "backend R2 檔案保存設定（bucket 的 CORS 仍需平台驗證）",
  r2.every((key) => Boolean(backend[key])),
);
for (const key of ["FRONTEND_URL", "PUBLIC_APP_URL"])
  check(
    `backend ${key}`,
    validURL(backend[key], production ? ["https:"] : ["http:", "https:"]),
  );
check(
  "frontend NEXT_PUBLIC_API_BASE_URL（結尾必須為 /api）",
  validURL(
    frontend.NEXT_PUBLIC_API_BASE_URL,
    production ? ["https:"] : ["http:", "https:"],
  ) && /\/api\/?$/.test(frontend.NEXT_PUBLIC_API_BASE_URL || ""),
);
console.log(
  "不輸出密鑰；不檢查 Vercel 上的環境變數；RAG、Liveblocks、Inngest 不列為本版本必要設定。",
);
check(
  "TEST_DATABASE_URL（選用；未設定就無法驗收 Neon 重啟）",
  Boolean(testUrl),
  false,
);
if (testUrl) {
  let isolated = false;
  try {
    assertTestDatabaseIsIsolated(testUrl, backend.DATABASE_URL);
    isolated = true;
  } catch {
    /* Report only the check name, never connection values. */
  }
  check(
    "測試資料庫隔離（排除 production 與 pooled／非 pooled 別名；未連線）",
    isolated,
  );
}
process.exitCode = failures ? 1 : 0;
