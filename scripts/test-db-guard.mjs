/** Return a credential-free target identity; never connect to the database. */
export function databaseTarget(value, label = "DATABASE_URL") {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} 必須是有效的 PostgreSQL 連線網址`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname)
    throw new Error(`${label} 必須是有效的 PostgreSQL 連線網址`);
  for (const key of url.searchParams.keys()) {
    if (
      [
        "host",
        "hostaddr",
        "port",
        "dbname",
        "database",
        "service",
        "options",
        "connectionstring",
        "endpoint",
      ].includes(key.toLowerCase())
    )
      throw new Error(
        `${label} 不得透過查詢參數覆寫資料庫目標，請使用測試分支的直接連線網址`,
      );
  }
  let host;
  try {
    host = decodeURIComponent(url.hostname).toLowerCase().replace(/\.$/, "");
  } catch {
    throw new Error(`${label} 的主機名稱格式無效`);
  }
  if (/[\s,%/?#@]/.test(host))
    throw new Error(`${label} 不支援多主機或間接主機名稱`);
  if (host.endsWith(".neon.tech")) {
    const [endpoint, ...domain] = host.split(".");
    if (!endpoint.startsWith("ep-"))
      throw new Error(`${label} 請使用 Neon endpoint 的完整連線網址`);
    // Pooled and direct connections (even using different users/databases) are
    // not a disposable branch when they point to the same Neon endpoint.
    return `neon:${endpoint.replace(/-pooler$/, "")}.${domain.join(".")}`;
  }
  let database;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error(`${label} 的資料庫名稱格式無效`);
  }
  if (!database) throw new Error(`${label} 必須指定資料庫名稱`);
  return `postgres:${host}:${url.port || "5432"}/${database}`;
}

export function assertTestDatabaseTarget(testUrl, productionTarget) {
  if (!productionTarget)
    throw new Error("缺少 production 目標比對，請從根目錄執行 pnpm test:db");
  const target = databaseTarget(testUrl, "TEST_DATABASE_URL");
  if (target === productionTarget)
    throw new Error(
      "TEST_DATABASE_URL 與 production 指向相同目標（含 pooled／非 pooled 別名），拒絕執行 migration 或測試",
    );
  return target;
}

export function assertTestDatabaseIsIsolated(testUrl, productionUrl) {
  if (!testUrl)
    throw new Error(
      "請在 backend/.env.test.local 設定可丟棄 Neon 分支的 TEST_DATABASE_URL",
    );
  if (!productionUrl)
    throw new Error(
      "缺少原本 DATABASE_URL，無法確認測試分支是否隔離；拒絕執行",
    );
  return assertTestDatabaseTarget(testUrl, databaseTarget(productionUrl));
}
