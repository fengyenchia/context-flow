# Neon 與持久化

## 資料結構

Drizzle schema 位於 `backend/src/db/schema.ts`；migration 與 snapshots 位於 `backend/drizzle/`，Neon HTTP client 位於 `backend/src/db/client.ts`。使用者、工作區、成員、專案、檔案紀錄、session、AI credential、token 與畫布均寫入正規化資料表，不再讀寫 `app_state`。

寫入只保存請求變更，在 Neon batch 交易中完成；畫布使用 revision／鎖檢查，失敗回報 503 或 409。

## 正式庫安全邊界

> [!IMPORTANT]
> 正式資料庫重新部署時不需重跑已套用的 migration。執行遷移前先確認連線目標、備份與 ledger。

各環境已套用的版本以 ledger 為準。執行前比對 migration hash 與 schema；若已套用版本的 hash 與 repository 不同，先釐清遷移來源，不覆寫 ledger 或重跑已套用的 migration。新增結構變更應建立新的 migration。

0003 在尚未套用的環境會將舊表改名 `app_state_legacy_backup`；0004 新增 `email_verification_tokens`。應保留 migration 與 snapshots，供新環境建置及遷移比對使用。

0005 新增單一專案邀請連結及授權資料表。新程式在 `PROJECT_INVITES_ENABLED` 未啟用時不讀新表；先完成備份、套用新增 migration，再開啟功能，見 [專案邀請部署](18-project-invitations.md)。

原始檔清理不新增資料表或 migration，寬限期標記保存在原上傳 R2 bucket。若要還原整個 Neon 分支，先關閉 `R2_PROJECT_CLEANUP_ENABLED` 並等執行中的清理結束，完成資料與檔案核對後再啟用，避免把還原期間的暫時狀態當成已刪除專案。已被清除的原始檔不會因還原 Neon 自動出現，需要仍保留中的畫布附件備份或另存原檔。

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

詳細範圍見 [測試指南](10-e2e-testing.md)。

`/api/health` 的 `neon: true` 只表示有設定連線，不等於已成功讀寫資料庫。不要將 SQL 查詢結果、帳號資料或連線字串貼進公開文件。
