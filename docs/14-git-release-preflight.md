# Git 與部署前檢查

日期：2026-10-24。本輪只做本機整理與提交，不 push、不建立 Vercel Project、不修改 production 環境設定、不執行 migration。

## 檢查範圍與結果

- `git fetch origin` 成功；整理前 `HEAD...origin/main` 為 `0 0`，本機與遠端一致。本機可見的 12 個既有提交已納入歷史掃描，包含已刪除的行。
- 使用 `scripts/check-secrets.mjs` 檢查待提交內容／暫存區：比對本機環境檔的敏感值、常見 Google/GitHub/AWS/Resend token、PostgreSQL 憑證、私鑰與歷史環境檔。只列出位置與風險類型，不印出值。本輪未發現符合規則的風險。
- 這是啟發式掃描與已知本機值比對，不是所有密鑰格式的完整保證；不包含無法由本機 refs 取得的遠端隱藏歷史或未提交到本機的外部檔案。
- 環境檔（含 `backend/.env.test.local`）、日誌、套件、測試輸出與私鑰保持忽略；空白 `.env.example` 範本保留追蹤。
- 核對 166 個前後端本機 import 與品牌圖片，沒有缺少待提交檔。Next 自動產生的型別路徑不當成遺漏原始碼，完成 build 後還原成本機預設路徑。
- 新增的 migration 0003/0004、Drizzle journal/snapshot、檔案／持久化／安全腳本、E2E、UI 元件、品牌素材、workspace lockfile 與文件一併納入提交。未重建或重跑舊 migration，也未修改其歷史套用紀錄。

## 本輪實際驗證

- 密鑰掃描器 6 項隔離測試通過：空範本、本機敏感值、暫存區／工作目錄差異、已刪除 token、歷史環境檔、忽略規則；失敗測試確認輸出不含測試秘密值。
- backend 18、frontend 17 項單元測試通過；1 項需專用 DB 的 smoke test 依設定跳過，本輪未連線測試庫或正式庫。
- pnpm 11.19.0 離線 `install --frozen-lockfile --lockfile-only --ignore-scripts --offline` 通過，三個 workspace 的相依設定相符，沒有重新下載或執行套件安裝腳本。
- 前後端 `next build --webpack` 正式建置通過；使用獨立 `.next-build-check` 目錄，子程序停用 DB、寄信、R2 與管理員初始化。沒有更動 `.env`。
- 本輪未重跑瀏覽器／Neon integration；先前結果見 [驗收報告](12-acceptance-report.md)，不把先前結果當作這輪重跑。

## 後續提交可重跑

```sh
pnpm test:secrets
pnpm check:secrets -- --staged --history
git diff --cached --check
git status --short
```

提交後預期工作目錄乾淨；還未 push 時 Vercel 不會拿到這次本機提交。先核對平台現有設定，再由你選擇推送時機；既有 Git 整合可能在 push 後立即觸發部署。

下一步依 [Vercel 部署指南](08-vercel-deployment.md) 操作，兩個 Project 使用不同 Root Directory、同站 HTTPS 自訂網域，正式密鑰只放 Backend Production，不沿用到 Preview。不要在對話或 Git 貼出連線字串。
