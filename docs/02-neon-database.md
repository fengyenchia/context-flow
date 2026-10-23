# Neon 與持久化

## 目前狀態

Drizzle schema 位於 `backend/src/db/schema.ts`；migration 與 snapshots 位於 `backend/drizzle/`，Neon HTTP client 位於 `backend/src/db/client.ts`。使用者、工作區、成員、專案、檔案紀錄、session、AI credential、token 與畫布均寫入正規化資料表，不再讀寫 `app_state`。

寫入只保存請求變更，在 Neon batch 交易中完成；畫布使用 revision／鎖檢查，失敗回報 503 或 409，不顯示假成功。

## 正式庫安全邊界

> [!IMPORTANT]
> 目前 production 已於 2026-10-23 套用到 0004。保持原本 `DATABASE_URL`，不要切成備份／測試分支，不要為重新部署重跑歷史 migration。

既有 production 的 0003 ledger hash 與本機封存版不同；當時舊 `app_state` 及封存表已不存在。這是既有歷史狀態，不改 ledger、不重跑 0003，也不宣稱本機 SQL 能還原已刪除資料。

目前版本的 0003 在尚未套用的環境會將舊表改名 `app_state_legacy_backup`；0004 新增 `email_verification_tokens`。應用程式不使用封存表，不應為清理文件而刪除 migration 或 snapshots。

## 全新環境

只有新環境才依序完成以下操作：

1. 建立 Neon project／用途明確的 branch，備妥備份與還原方式。
2. 將該環境連線安全設定於 backend；不放 frontend、不以 `NEXT_PUBLIC_` 命名。
3. 確認連線目標後，從根目錄執行 `pnpm --filter @context-flow/backend db:migrate`。
4. 檢查 schema 與 ledger，再啟動 API 驗證保存／重載。不要把新環境步驟套用到已完成 migration 的正式庫。

如要改 schema，執行 `pnpm --filter @context-flow/backend db:generate`，先 review 新 SQL，備份後才規劃遷移。不要修改已套用 migration 來代替新增 migration。

## 專用測試分支

在 `backend/.env.test.local` 只設定 `TEST_DATABASE_URL`；原本 production `DATABASE_URL` 不變。測試分支必須獨立、可丟棄：

```sh
pnpm check:test-db
pnpm test:db
```

前者只做離線隔離檢查；後者只在測試子程序把測試連線作為 DB，會遷移測試 schema 並測跨程序還原、過期寫入拒絕與原子回滾。入口拒絕相同目標、已知 pooled／非 pooled 別名及危險參數，但仍須人工確認 branch 用途。

使用者已提供測試通過結果。詳細範圍見 [測試指南](10-e2e-testing.md) 與 [驗收報告](12-acceptance-report.md)。

`/api/health` 的 `neon: true` 只表示有設定連線，不等於已成功讀寫資料庫。不要將 SQL 查詢結果、帳號資料或連線字串貼進公開文件。
