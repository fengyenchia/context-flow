# ContextFlow 產品規格與技術實作規格書 (Draft v0.3)

---

## 1. 專案核心資訊

- **專案名稱**：**ContextFlow**
- **產品定位**：Notion 風格、以 Gemini 為核心的「人機協同思考與專案工作流編排畫布」。
- **核心價值**：支援多專案隔離、文字/圖片/影片多模態節點、自由切換「左右/上下」流轉佈局，並具備「對話發散 $\rightarrow$ 節點落盤 $\rightarrow$ 收斂整理」的工作流；RAG 延後到收斂階段有明確來源追溯需求時再加入。

### 1.1 可行性結論

**整體可行，而且產品流程有明確差異化；目前先不做完整 RAG，優先驗證發散到收斂的核心流程。**

ContextFlow 的核心並不是另一個通用白板，而是把「對話、資料依據、發散結果與收斂產物」保留在同一張可追溯的思考圖上。最值得先驗證的假設是：使用者是否真的會反覆使用「對話轉節點 → 節點延伸 → 選取內容收斂」這條主流程。

第一版應先限定為：

1. 帳號登入與每位使用者的多專案隔離。
2. 文字／Markdown 節點、手動連線、LR/TB 自動排版與多人即時共編。
3. PDF、純文字與 Markdown 檔案先做儲存與預覽；RAG 延後，未來優先接在收斂流程。
4. Chatbot 串流回覆、回覆轉節點、選取節點延伸。
5. 使用者「勾選」要收斂的節點後再產生結果，避免整張畫布無限制送入模型。

YouTube、Vimeo、MP4 解析、PNG/SVG 高品質匯出、專案複製、留言／通知與全自動收斂可放在後續版本。

---

## 2. 完整技術棧與架構選型 (Tech Stack) - 前後端分離

```
[前端 Presentation Layer]
  ├── Framework: Next.js 16 (App Router, TypeScript；Node.js 20.9+)
  ├── Styling & UI: Tailwind CSS + shadcn/ui (Notion 極簡風格)
  ├── Icons: @tabler/icons-react
  ├── Canvas Engine: @xyflow/react (React Flow v12)
  ├── Layout Engine: dagre (處理節點在左右 LR / 上下 TB 方向的自動排版)
  ├── Realtime Collaboration: Liveblocks + @liveblocks/react-flow（每個 Project 對應一個 Room）
  ├── Rich Content: react-markdown + remark-gfm (解析 Markdown、表格、代碼區塊)
  ├── User Onboarding: react-joyride (新手 step-by-step 導覽)
  ├── HTTP Client: 原生 fetch + generated typed client（只有需要攔截器等特殊需求時才加入 axios）
  └── State Store: zustand (管理當前專案、畫布節點/連線、全域資料池與 Chatbot)

[後端與推理層 Backend & API Layer]
  ├── API Engine: Next.js 16 Route Handlers（獨立 backend 專案，開發 port 3001）
  ├── API Contract: frontend/lib/api/types.ts + 各功能 API functions
  ├── AI Inference: Google Gemini 3.6 Flash (@google/genai SDK, Structured Outputs)
  ├── Embedding: 延後至收斂專用 RAG 階段再導入
  ├── Database: Neon Serverless PostgreSQL (啟用 pgvector 擴充)
  ├── ORM / Migration: Drizzle ORM + drizzle-kit
  ├── Object Storage: Cloudflare R2（Private Bucket + Presigned URL）
  ├── Authentication: Next.js backend 自建 Username/Password + JWT（jose）
  ├── Password Hashing: Node.js scrypt
  ├── Authorization: Route Handler JWT middleware + RBAC（user / admin）
  └── Async Jobs: Inngest（未來處理文件切片、Embedding、畫布快照與大型匯出）

[Repository]
  ├── Monorepo: pnpm workspace + Turborepo
  ├── frontend: Next.js UI；lib/api 內含 client、統一 types 與各分頁 API functions
  └── backend: Next.js Route Handlers REST/SSE API、Drizzle、AI 與非同步 Worker

```

> **版本原則**：模型 ID、Embedding 維度、檔案大小限制與 AI 費率都屬於可變設定，不應散落或寫死在程式碼中。統一由環境變數與 server-only config 管理。預設使用 Gemini 3.6 Flash；RAG 尚未啟用，未來導入時再決定 Embedding 模型與維度。

> **前後端分離邊界**：`frontend` 不直接連 Neon、Gemini 或 Object Storage secret；所有資料與 AI 操作均經 `backend` 的 Next.js Route Handlers。前端只透過 `frontend/src/lib/api` 呼叫 `http://localhost:3001/api`，不引用任何 server code。

> **兩種 Key 不可混用**：JWT signing key 是 ContextFlow 用來驗證登入身分的系統 secret；使用者新增的 Gemini API Key 是代替自己呼叫 AI 的 BYOK credential。前者只存在部署環境，後者需逐筆加密後儲存，兩者不得傳到瀏覽器或寫入 log。

### 2.1 已確定的基礎設施決策

1. 帳號驗證：Next.js backend 自建 JWT。
2. 檔案儲存：Cloudflare R2。
3. 背景工作：Inngest。
4. 多人共編：Workspace Membership + Liveblocks Project Room。
5. 部署：Vercel；`frontend` 與 `backend` 分成兩個 Vercel Project，共用同一個 monorepo。

Vercel Functions 不支援作為 WebSocket Server，因此 Next.js backend 不自行維持共編 socket。Liveblocks 負責 Presence、游標、節點／連線即時同步與衝突處理；Next.js backend 在簽發 Liveblocks room token 前，必須先用 JWT 與 Workspace Membership 驗證使用者是否有該 Project 權限。

---

## 3. 多專案管理架構與工作區流程 (Multi-Project Workspace)

每位使用者都有自己的個人 Workspace，可管理多個 Project；Shared Workspace 則透過 Membership 讓多位使用者共同管理與編輯其中的 Project。每個 Project 仍是獨立沙盒，擁有專屬的**畫布圖（Graph）、知識庫檔案池（Knowledge Pool）、Liveblocks Room 與 Chatbot 對話紀錄**。

```
┌─────────────────────────┬──────────────────────────────────────────────────────────────────┐
│   側邊欄 (Sidebar)      │                  ContextFlow 專案主畫布視窗                      │
├─────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ 📂 我的工作區 (Personal)│ [專案: 2026 互動畢製 ▾]   [佈局: 左右 ⇄ 上下]   [⚡ 一鍵收斂]       │
│   • 2026 互動畢製       │──────────────────────────────────────────────────────────────────│
│   • 品牌官網重構        │                                                                  │
│ 📂 畢製團隊 (Shared)    │  ┌───────────────┬───────────────────┬───────────────────────┐   │
│   • 提案共編 (Active)   │  │ 1. 資料架構區 │ 2. 發散思考區     │ 3. 收斂總結區 (AI)    │   │
│ 👥 成員與權限           │  │   (Data Zone) │   (Ideate Zone)   │   (Synthesis Zone)    │   │
│ ➕ 新增工作區／專案     │  └───────────────┴───────────────────┴───────────────────────┘   │
│ ⚙️ 帳號／AI Key 設定   │                                                                  │
└─────────────────────────┴──────────────────────────────────────────────────────────────────┘

```

### 3.1 專案生命週期（CRUD）邏輯

1. **建立專案 (`Create Project`)**：

- 點擊側邊欄 `[➕ 新增專案]`，跳出 shadcn `Dialog` 彈窗。
- 輸入專案名稱、描述，選擇預設流轉方向（`LR: 左右` 或 `TB: 上下`）。
- 使用者先選擇有建立權限的 personal/shared Workspace；後端建立 `projects` 紀錄與 Liveblocks Room，並初始化三大分區背景。

2. **切換專案 (`Switch Project`)**：

- 點擊側邊欄任一專案，更新 URL 路由（`/workspaces/[workspaceId]/projects/[projectId]`）。
- 前端拉取 Project metadata、檔案列表與對話記錄，通過 collaboration auth 後加入對應 Liveblocks Room；Nodes、Edges 與 Presence 由 Liveblocks 載入。

3. **專案複製/匯出 (`Duplicate / Export`)**：

- 支援將專案畫布一鍵匯出為 JSON、PNG/SVG 或結構化 Markdown 文件。

4. **專案刪除 (`Delete Project`)**：

- 資料庫採用 `ON DELETE CASCADE` 清除關聯資料，並由 Inngest cleanup job 刪除 Liveblocks Room 與 Cloudflare R2 物件；刪除工作需可重試且具 idempotency。

### 3.2 帳號、登入與權限流程

#### 一般使用者

1. 使用者直接設定唯一 `username` 與 Password 註冊，不要求 Email 或信箱驗證；註冊成功後在同一個 transaction 建立個人 Workspace 與 owner membership。
   - Username 採不分大小寫唯一，比對前先 trim + lowercase，限制 3–50 個安全字元。
   - 不做 Email 驗證不代表略過輸入安全：密碼仍需長度與常見弱密碼檢查，註冊 endpoint 需 rate limit。
2. 登入成功後簽發短效 Access JWT；後續 API 以 `Authorization: Bearer <token>` 驗證。
3. Refresh JWT 只放在 `HttpOnly + Secure` Cookie，採 rotation；每次 refresh 都撤銷舊 session，資料庫只保存 refresh token／JTI 的雜湊與裝置資訊。
4. 帳號設定可修改顯示名稱、變更密碼、登出其他裝置，以及新增／替換／刪除自己的 Gemini API Key。
5. 變更密碼透過註冊 Email 驗證連結；成功後增加 `token_version` 並撤銷其他 refresh sessions，要求其他裝置重新登入。
6. 忘記密碼時輸入註冊 Email，系統寄出短效、一次性的重設連結；使用者自行設定新密碼。

#### 使用者 AI API Key（BYOK）

* API Key 由前端透過 TLS 傳到後端，後端驗證可用後以 AES-256-GCM 或雲端 KMS envelope encryption 儲存；加密主金鑰不得與資料庫放在一起。
* 儲存完成後 API 只回傳 provider、狀態與遮罩提示（例如 `...A1B2`），永遠不再回傳完整明文。
* 提供「測試連線、替換、刪除」功能；不得把明文 Key 寫入 request log、錯誤追蹤、AI 執行紀錄或管理員頁面。
* 執行 AI 時優先使用當前使用者的有效 Key。若未設定，第一版直接提示前往設定；未來若要提供平台公用額度，再另加 quota 與計費規則。

#### 管理員

* `admin` 可搜尋與查看所有帳號、角色、狀態、建立日期、最近登入與專案數量。
* 可停用／啟用帳號、變更 `user/admin` 角色與撤銷所有登入 session；密碼重設由使用者 Email 流程處理。
* 管理員**不能**查看使用者密碼、password hash 或完整 AI API Key，也不應直接替使用者指定新密碼。
* 所有管理操作寫入不可由一般使用者修改的 `admin_audit_logs`，保存 actor、target、action、時間、IP 與變更摘要。
* 後端每個 `/admin/*` endpoint 同時套用 JWT Guard 與 Role Guard；敏感操作重新查詢資料庫中的最新 role/status，不能只相信可能尚未過期的 JWT claim。

### 3.3 Workspace、Membership 與多人共編

* `personal` Workspace：註冊時自動建立，每位使用者至少一個，預設只有本人；可建立與管理多個 Project。
* `shared` Workspace：由使用者建立，透過 username 邀請既有帳號加入；同一個 Workspace 可包含多個共用 Project。
* Workspace role：`owner` 可刪除 Workspace 與管理 owner；`admin` 可管理成員與 Project；`editor` 可建立／編輯內容；`viewer` 僅能查看。
* Global role（`user/admin`）與 Workspace role 是兩套不同權限。系統管理員可以管理帳號與停權，但預設不能查看使用者專案內容，除非本身是該 Workspace member。
* 每個 Project 對應一個 Liveblocks Room，room ID 使用不可猜測的 project UUID。Next.js backend 的 Liveblocks auth endpoint 先確認 Workspace Membership，再簽發對應的 room permission。
* `owner/admin/editor` 可修改 React Flow nodes/edges；`viewer` 只能接收同步與 Presence，不能提交 mutation。AI 建立節點同樣受 Workspace role 限制。
* 邀請、移除成員、角色變更與 Workspace 刪除需寫入 workspace audit log；禁止移除最後一位 active owner。
* 第一版以 Workspace 為分享邊界：加入 Shared Workspace 後可存取其中所有 Project。若未來需要「只分享某一個 Project」，再新增 `project_members`，不要用前端隱藏功能代替後端授權。

---

## 4. 畫布三大分區與多模態節點規格

### 4.1 佈局模式切換（Dagre.js 計算）

- **左右佈局 (LR)**：
- `Data Zone (X: 0~500)` $\rightarrow$ `Ideate Zone (X: 600~1400)` $\rightarrow$ `Synthesis Zone (X: 1500~2300)`

- **上下佈局 (TB)**：
- `Data Zone (Y: 0~400)` $\rightarrow$ `Ideate Zone (Y: 500~1100)` $\rightarrow$ `Synthesis Zone (Y: 1200~1800)`

### 4.2 React Flow 多模態卡片節點結構（Custom Node）

節點使用統一的 Notion 卡片外觀，依據 `nodeType` 呈現不同內容：

```typescript
export type CanvasZone = "data" | "ideate" | "synthesis";
export type MediaType = "text" | "image" | "video" | "code" | "file";

export interface GroundingSource {
  fileName: string;
  fileType: "pdf" | "code" | "image" | "link" | "text";
  snippet: string;
  pageOrLine?: string;
}

export interface ThinkNodeData {
  id: string;
  projectId: string;
  zone: CanvasZone;
  mediaType: MediaType;
  title: string;
  content: string; // 支援 Markdown 解析 (react-markdown + remark-gfm)
  mediaUrl?: string; // 圖片 URL / 影片嵌入連結
  tags?: string[];
  groundingSource?: GroundingSource | null; // RAG 溯源標籤
  createdAt: number;
}
```

- **文字/Markdown 節點**：渲染 GFM 表格、核取清單、格式化標題。
- **圖片節點**：支援拖曳圖片上傳，卡片內顯示縮圖，點擊展開 Lightbox。
- **影片節點**：支援 YouTube / Vimeo 或直連 MP4 播放器。
- **代碼節點**：語法高亮展示，附帶一鍵複製按鈕。
- **RAG 溯源標籤 (Source Badge)**：若節點由 RAG 產生，右上角顯示灰底小標籤（如 `📄 Spec.pdf p.4`），點擊可滑出原始片段。

---

## 5. 核心功能工作流 (Core Workflows)

### 工作流 A：Chatbot 對話與「📌 一鍵落盤」

1. 使用者在左側 Chatbot 與 Gemini 3.6 Flash 討論想法。
2. 每則 AI 回覆卡片右上方設有 **`[📌 轉為節點]`** 按鈕。
3. 點擊後，由 Gemini 將該段文字整理為 `{ title, content, tags }`，自動放置於當前專案的「發散思考區 (Ideate Zone)」。

### 工作流 B：發散思考與節點延伸（目前版本）

1. 使用者在畫布選中發散節點，透過專屬對話延伸。
2. 發散對話使用一般 LLM，依節點脈絡探索多方向、創意且可行的方案，不查詢資料池。
3. AI 回覆可預覽後轉成節點，並由排版邏輯加入畫布。

未來若收斂結果需要可驗證依據，再將資料池與發散節點交給收斂專用 RAG 流程；不把 RAG 強制套用到發散階段。

### 工作流 C：收斂總結區（人機協同）

- **AI 一鍵收斂**：點擊頂部 `[⚡ 一鍵收斂]`，Gemini 整合「資料架構區」+「發散思考區」的節點，在「收斂總結區」生成。現階段先使用專案內已有內容；未來再視來源追溯需求加入收斂專用 RAG。

1. _MVP 核心功能規格書節點_
2. _前後端任務相依清單節點_
3. _邊界情境 (Edge Cases) 防禦清單節點_

- **手動新增與編修**：使用者隨時可以雙擊收斂區新增節點，或拖曳連線微調優先級。

---

## 6. 資料庫模型 (Neon PostgreSQL Schema)

```sql
-- 啟用向量支援
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. 帳號；username 寫入前由後端 trim + lowercase
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(100),
  role VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin')),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  token_version INTEGER NOT NULL DEFAULT 1,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_users_username_lower ON users (LOWER(username));

-- 2. Refresh JWT session；只保存 JTI/token 的單向雜湊
CREATE TABLE refresh_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address INET,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 使用者發起的 Email 密碼重設；原始 token 不落庫
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 使用者自己的 AI Key；ciphertext 以 AES-256-GCM 或 KMS 加密
CREATE TABLE user_ai_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL CHECK (provider IN ('gemini')),
  encrypted_api_key BYTEA NOT NULL,
  encryption_iv BYTEA NOT NULL,
  auth_tag BYTEA NOT NULL,
  encryption_key_version INTEGER NOT NULL DEFAULT 1,
  key_hint VARCHAR(12) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invalid')),
  last_validated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

-- 5. 個人／共享工作區
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('personal', 'shared')),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_one_personal_workspace_per_user
  ON workspaces(created_by_user_id) WHERE kind = 'personal';

-- 6. Workspace 成員與 Workspace 內權限
CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- 7. 以既有 username 邀請加入 Shared Workspace
CREATE TABLE workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX idx_one_pending_workspace_invitation
  ON workspace_invitations(workspace_id, target_user_id)
  WHERE status = 'pending';

-- 8. 專案主表；Liveblocks room ID 固定由 project UUID 推導為 project:{id}
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  layout_direction VARCHAR(10) NOT NULL DEFAULT 'LR'
    CHECK (layout_direction IN ('LR', 'TB')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. 畫布節點表
CREATE TABLE canvas_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  zone VARCHAR(20) NOT NULL CHECK (zone IN ('data', 'ideate', 'synthesis')),
  media_type VARCHAR(30) NOT NULL
    CHECK (media_type IN ('text', 'image', 'video', 'code', 'file')),
  title VARCHAR(255),
  content TEXT,
  media_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  position_x FLOAT NOT NULL,
  position_y FLOAT NOT NULL,
  grounding_source JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. 畫布連線表
CREATE TABLE canvas_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  label VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (source_node_id <> target_node_id),
  UNIQUE (project_id, source_node_id, target_node_id)
);

-- 11. 原始檔案紀錄；檔案內容實際放在 Cloudflare R2
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  size_bytes BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. 專案專屬知識庫切片；768 必須與 outputDimensionality 一致
CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content_chunk TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

-- 13. Chatbot 對話紀錄
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. AI 執行紀錄；追蹤 shared project 中由誰的 Key 觸發，不保存 Key
CREATE TABLE ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  operation VARCHAR(30) NOT NULL
    CHECK (operation IN ('chat', 'expand', 'synthesize', 'embedding')),
  model_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  usage_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 15. 系統管理員稽核紀錄；不記錄密碼、token、Key 或其他 secret
CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  change_summary JSONB,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. Workspace 成員與權限異動紀錄
CREATE TABLE workspace_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  change_summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 建立專案與向量檢索索引。持續新增資料的早期產品優先採 HNSW。
CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_refresh_sessions_user ON refresh_sessions(user_id);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_workspace_invitations_target ON workspace_invitations(target_user_id, status);
CREATE INDEX idx_workspace_audit_created ON workspace_audit_logs(workspace_id, created_at);
CREATE INDEX idx_admin_audit_actor_created ON admin_audit_logs(actor_user_id, created_at);
CREATE INDEX idx_nodes_project ON canvas_nodes(project_id);
CREATE INDEX idx_edges_project ON canvas_edges(project_id);
CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_embeddings_project ON document_embeddings(project_id);
CREATE INDEX idx_messages_project_created ON chat_messages(project_id, created_at);
CREATE INDEX idx_ai_runs_actor_created ON ai_runs(actor_user_id, created_at);
CREATE INDEX idx_embeddings_vector ON document_embeddings
  USING hnsw (embedding vector_cosine_ops);

```

### 6.1 資料一致性與隔離規則

- 所有 Project API 都必須以 JWT `sub` 查詢 `projects.workspace_id → workspace_members`，不能只相信前端傳入的 `workspaceId`、`projectId` 或 role。
- 建立 Project 時後端從已驗證的 Workspace Membership 寫入 `workspace_id`，不能接受前端任意指定其他 Workspace。
- Workspace 刪除、成員移除與 role 更新使用 transaction，並在 commit 前鎖定相關 membership，確保永遠至少有一位 active owner。
- 建立 Edge 時，後端必須確認 source、target 與 Edge 都屬於同一個專案；單靠外鍵無法保證這件事。
- 若採用支援 RLS 的連線方式，可再加 PostgreSQL Row-Level Security；否則權限檢查必須集中在 repository/service 層。
- `updated_at` 應由共用更新函式或資料庫 trigger 維護，不要依賴每個 API 各自記得更新。
- `canvas_nodes.version` 只用於 PostgreSQL 快照／AI server-side mutation 的 optimistic concurrency control；瀏覽器多人共編衝突由 Liveblocks 處理，不再用舊 request 覆蓋整張畫布。

### 6.2 JWT 與密碼安全規則

* 密碼使用 Node.js scrypt + 每筆獨立 salt；絕不明文儲存、可逆加密或使用 SHA-256 等快速 hash。
* Access JWT 建議 10–15 分鐘；payload 僅包含 `sub`、`role`、`tokenVersion`、`iat`、`exp`、`iss`、`aud`、`jti`，禁止放 username、API Key 或其他非必要資料。
* Refresh JWT 建議 7–30 天、每次使用即 rotation；登出、改密碼、停權與管理員撤銷 session 後必須失效。
* JWT 驗證固定允許的 algorithm、issuer、audience，拒絕 `alg=none` 或演算法切換；signing key 由 Secret Manager／部署環境提供並支援輪替。
* 註冊、登入、refresh、變更密碼、Email 重設、API Key 測試與管理端點都要 rate limit；登入錯誤訊息統一，不洩漏 username 是否存在。
* Frontend 僅將 Access JWT 保存在記憶體狀態，不放 `localStorage`；頁面重整後透過 HttpOnly refresh Cookie 取得新 Access JWT。
* 初始管理員由一次性 seed 建立，只接收預先產生的 Node.js scrypt password hash；seed 完成後立即移除相關環境設定，且禁止提供公開 API 讓使用者自行升級 admin。

---

## 7. REST API 規格清單

- **帳號與驗證模組 (Auth / Account)**：
- `POST /api/auth/register`：以唯一 username + password 建立帳號，並建立 personal Workspace 與 owner membership。
- `POST /api/auth/login`：驗證 Username/Password，回傳 Access JWT 並設定 Refresh Cookie。
- `POST /api/auth/refresh`：rotation Refresh JWT，回傳新的 Access JWT 與 Refresh Cookie。
- `POST /api/auth/logout`：撤銷目前 refresh session 並清除 Cookie。
- `POST /api/auth/logout-all`：撤銷該帳號所有 refresh sessions。
- `POST /api/auth/forgot-password`：以 Email 發出短效重設連結；`POST /api/auth/reset-password` 使用連結 token 設定新密碼，使用後立即失效。
- `GET /api/account`：取得自己的基本資料與角色。
- `PATCH /api/account/profile`：修改顯示名稱等非敏感資料。
- `POST /api/auth/forgot-password`：寄出 Email 重設連結；`POST /api/auth/reset-password` 驗證連結後變更密碼並撤銷其他 sessions。
- `PUT /api/account/ai-credentials/gemini`：驗證並新增／替換自己的 Gemini API Key。
- `GET /api/account/ai-credentials`：只回傳 provider、狀態、遮罩提示與驗證時間。
- `POST /api/account/ai-credentials/gemini/test`：測試已儲存 Key 是否可用。
- `DELETE /api/account/ai-credentials/gemini`：刪除自己的 Key。

- **管理員模組 (Admin)**：
- `GET /api/admin/users`：分頁搜尋所有帳號與摘要資料。
- `GET /api/admin/users/{userId}`：取得帳號狀態、專案數與登入摘要；不含 secrets。
- `PATCH /api/admin/users/{userId}/status`：停用／啟用帳號。
- `PATCH /api/admin/users/{userId}/role`：變更 `user/admin` 角色，禁止移除系統最後一位 active admin。
- `POST /api/admin/users/{userId}/revoke-sessions`：撤銷該帳號全部 refresh sessions。
- 管理員不提供密碼重設 endpoint；由使用者自行以 Email 發起重設。
- `GET /api/admin/audit-logs`：查詢管理操作紀錄。

- **Workspace 與共編模組 (Workspace / Collaboration)**：
- `GET /api/workspaces`：取得登入者可存取的 personal/shared Workspaces 與角色。
- `POST /api/workspaces`：建立 Shared Workspace，建立者成為 owner。
- `GET /api/workspaces/{workspaceId}`：取得 Workspace 與成員摘要。
- `PATCH /api/workspaces/{workspaceId}`：owner/admin 修改名稱等設定。
- `DELETE /api/workspaces/{workspaceId}`：僅 owner 可刪除；personal Workspace 不可單獨刪除。
- `GET /api/workspaces/{workspaceId}/members`：取得成員清單。
- `POST /api/workspaces/{workspaceId}/invitations`：用 username 邀請既有帳號並指定 role。
- `POST /api/workspace-invitations/{invitationId}/accept`：受邀者接受邀請並建立 membership。
- `POST /api/workspace-invitations/{invitationId}/decline`：受邀者拒絕邀請。
- `PATCH /api/workspaces/{workspaceId}/members/{userId}`：owner/admin 修改成員 role。
- `DELETE /api/workspaces/{workspaceId}/members/{userId}`：移除／退出 Workspace，禁止移除最後一位 owner。
- `POST /api/projects/{projectId}/collaboration/auth`：驗證 JWT + Membership 後簽發 Liveblocks Room token 與權限。

- **專案管理模組 (Project Management)**：
- `GET /api/workspaces/{workspaceId}/projects`：取得該 Workspace 的專案清單。
- `POST /api/workspaces/{workspaceId}/projects`：在有權限的 Workspace 建立新專案與 Liveblocks Room。
- `GET /api/projects/{projectId}`：取得特定專案詳情。
- `PATCH /api/projects/{projectId}`：更新專案名稱、描述或排版方向（LR/TB）。
- `DELETE /api/projects/{projectId}`：刪除專案及其所有關聯資料。

- **畫布資料模組 (Canvas State)**：
- `GET /api/projects/{projectId}/canvas/snapshot`：取得 PostgreSQL 最近一次 Nodes/Edges 快照，僅供匯出、AI、災難復原與除錯。
- `POST /api/internal/liveblocks/webhook`：驗證 Liveblocks webhook 後觸發 Inngest 快照工作；不是公開前端 API。

- **AI 推理與工作流模組 (AI Reasoning)**：
- `POST /api/ai/chat`：使用登入者自己的 Gemini API Key，以 SSE／串流回傳結果並支援萃取結構化節點。
- `POST /api/ai/expand`：未來以選中節點為基礎進行發散延伸；目前發散延伸使用一般 LLM，不啟用 RAG。
- `POST /api/ai/synthesize`：傳入已選取的節點 ID，由後端重新讀取內容後生成收斂區規格。

- **知識庫檔案模組 (Knowledge Base)**：
- `POST /api/projects/{projectId}/knowledge/upload-url`：取得限時上傳 URL，讓瀏覽器直傳 Object Storage。
- `POST /api/projects/{projectId}/knowledge`：登記完成上傳的檔案並啟動非同步切片與 Embedding。
- `GET /api/projects/{projectId}/knowledge`：取得該專案已上傳的檔案列表。
- `GET /api/projects/{projectId}/knowledge/{documentId}`：取得處理狀態與錯誤原因。
- `DELETE /api/projects/{projectId}/knowledge/{documentId}`：刪除原始檔與其所有向量切片。

---

## 8. Notion 風格 UI/UX 與新手導覽 (Design & Joyride)

- **視覺設計規範**：
- **字體與排版**：採用 noto-sans 思源黑體，字階層次清晰；卡片預設無強烈陰影，以 `1px` 細邊框（`border-neutral-200 dark:border-neutral-800`）營造 Notion 式乾淨質感。
- **分區視覺 (Zone Backdrop)**：畫布三大區域使用極輕微的色塊底紋標示（資料區：暖粉灰 `#FBF5F5`、發散區：淡珊瑚粉 `#FDF0F2`、收斂區：淡玫瑰粉 `#F7E8EB`）。

- **新手教學流程 (React Joyride Steps)**：

1. **Step 1: 專案側邊欄** $\rightarrow$「在這裡切換或建立你的專案工作區，放入給 RAG 的文件」。
2. **Step 2: 側邊 Chatbot** $\rightarrow$「隨時與 Gemini 討論想法，點擊【生成節點】即可將靈感做成節點，放至畫布」。
3. **Step 3: 三大思考分區** $\rightarrow$「從左到右：整理資料、發散思考、最後由 AI 一鍵收斂產出規格」。
4. **Step 4: 節點 AI 延伸** $\rightarrow$「選中任意節點點擊 `+ AI 延伸`，系統會自動結合上傳文件推演下一步」。

---

## 9. 畫布狀態、同步與自動排版策略

這會是實作中最容易產生雙重資料來源的區域，因此先固定責任邊界：

1. Liveblocks Storage 是使用者互動中 Nodes／Edges 的即時 authoritative state；Zustand 只保存本機 UI 狀態，不另做一套畫布真實資料。
2. 使用 `@liveblocks/react-flow` 同步 React Flow mutation；Presence（游標、選取節點、在線成員）屬於暫時資料，不寫入 PostgreSQL。
3. PostgreSQL `canvas_nodes/canvas_edges` 是可查詢快照，提供 RAG、AI、匯出、搜尋與災難復原，不與瀏覽器每次拖曳同步寫入。
4. Liveblocks webhook 觸發 Inngest，將 Room state 以 debounce／idempotent job 寫入 PostgreSQL；快照延遲可接受，但 UI 顯示 Liveblocks sync status。
5. AI 新增或修改節點前，Next.js backend 再次驗證 Workspace Membership，使用 Liveblocks server API mutation；成功後再由同一快照管線落入 PostgreSQL，避免 AI 與使用者各寫一份不同狀態。
6. 自動排版不是永久開啟。只有有編輯權限的使用者按下「重新排版」、切換 LR/TB，或 AI 一次新增多個節點時才執行 Dagre，並以單一 collaborative mutation 套用，讓所有在線成員看到同一結果。
7. Dagre 適合 MVP 的有向圖排版，但複雜 Group Node、不同尺寸節點與跨區連線可能需要額外修正；三大 Zone 建議先作為背景分區，不要一開始就依賴巢狀 Group Node 排版。

---

## 10. RAG 與 AI 推理規格（暫不開發）

目前版本不開發 RAG。發散與收斂都使用一般 LLM，依流程傳入資料池、節點與對話內容；不做文件檢索、Embedding、向量搜尋或來源引用。若未來重新提出可驗證來源需求，需另立規格、資料模型與開發排程，本章內容僅保留為歷史構想，不代表目前承諾。

### 10.1 文件處理管線

`取得 R2 Presigned URL → 瀏覽器直傳 → 後端 HEAD 驗證 → documents(pending) → Inngest 擷取文字 → 清理／切片 → 使用觸發者自己的 Gemini Key 產生 Embedding → 寫入切片 → documents(ready)`

* Presigned URL 限定 object key、method、Content-Type 與短效期限；完成後後端以 HEAD 驗證大小與 metadata，再接受文件登記。
* Inngest event 只傳 `userId/workspaceId/projectId/documentId`，不得包含解密後的 Gemini API Key、JWT、R2 secret 或文件全文。
* 每個 Inngest step 只在需要呼叫 Gemini 時，依 event 的 `userId` 即時解密該觸發者的 Key，使用完即丟棄；Key 無效或已刪除時把 document 標記為 `failed` 並提示該使用者重新設定。
* 大檔案依頁面／chunk 拆成可重試步驟，不能把整個解析、Embedding 與索引流程塞進單一 Vercel request 或單一步驟。
* 切片應保存頁碼、段落或行號，`groundingSource` 只存 document/chunk ID 與顯示資訊，實際引用內容由後端查詢。
* RAG 查詢不能只固定 Top-3；建議先取 Top-8，再依相似度門檻與多樣性篩選 3–5 段，查不到足夠相關資料時要明示「以下為模型推論」。
* `RETRIEVAL_DOCUMENT` 與 `RETRIEVAL_QUERY` 使用對應的 Embedding task type；寫入與查詢必須使用同一模型和維度。
* 第一版先處理 PDF、TXT、MD；掃描 PDF 需要 OCR，程式碼需要依語言／函式切片，應視為後續專項。
* 刪除文件時必須同時刪除 Object Storage 原始檔與資料庫紀錄；背景工作要可重試並具有 idempotency key。

### 10.2 AI 輸出與成本控制

* 所有建立節點的 AI API 使用 JSON Schema Structured Outputs，後端仍需以 Zod 驗證、限制 title/content/tags 長度。
* Chat 回覆使用串流；`expand` 與 `synthesize` 可先用一般 request，避免過早增加狀態複雜度。
* 每個專案設定單次輸入節點數、輸入字元、輸出節點數與每日 AI 用量上限。
* 大型收斂採「節點摘要快取 → 分區摘要 → 最終合成」，不能把無上限的完整畫布一次送入模型。
* 每次 AI 執行保存 model ID、prompt version、選取節點 ID、引用 chunk ID、耗時與 token usage，方便除錯與估算成本；不必保存機密 prompt 原文。

---

## 11. 安全、隱私與穩定性需求

* Gemini API Key、資料庫連線字串與 Storage secret 僅存在伺服器端；禁止使用 `NEXT_PUBLIC_` 前綴。
* Markdown 渲染禁止原始 HTML，若日後開放 HTML 必須使用嚴格 sanitize，避免 XSS。
* 上傳檔案同時檢查副檔名、MIME、檔頭、大小與數量；原始檔採私有 bucket + signed URL。
* 影片／網址匯入需防止 SSRF，不允許伺服器任意請求 localhost、內網 IP 或 metadata endpoint。
* AI API 加入登入驗證、rate limit、timeout、重試上限與 request ID；重試不可重複建立節點。
* Password、JWT、Refresh Cookie 與使用者 API Key 不得出現在 application log、analytics、Sentry breadcrumb 或 API 範例。
* 管理端所有列表都要分頁；停權、角色變更、撤銷 session 與密碼重設必須寫 audit log，並防止管理員停用自己或移除最後一位 active admin。
* 前後端不同 origin 時，CORS 只允許明確列出的前端網域並開啟 credentials；Refresh Cookie 的 Domain、SameSite、Secure 屬性依實際部署網域設定，不能使用 `*`。
* 專案刪除採二次確認。正式產品可先 soft delete 並保留短期復原期，再由排程實際清除檔案與資料。
* OpenAPI 頁面在正式環境需限制存取，且 schema 不顯示 secret 或內部管理端點。

---

## 12. 建議專案目錄

```text
context-flow/
├── frontend/
│   └── src/
│       ├── app/{(auth),settings,admin,workspaces}/
│       ├── components/{canvas,chat,knowledge,ui}/
│       ├── features/{auth,account,admin,workspaces,projects,collaboration,canvas,ai,knowledge}/
│       ├── lib/api/     # 由後端 OpenAPI 產生的 typed client
│       └── stores/
├── backend/
│   └── src/
│       ├── modules/{auth,users,admin,ai-credentials,workspaces,collaboration,projects,canvas,ai,knowledge,storage}/
│       ├── common/{auth,guards,filters}/
│       ├── config/      # 環境變數驗證
│       ├── db/          # Drizzle schema、migration、repository
│       ├── inngest/     # durable functions 與 serve endpoint
│       ├── jobs/        # 文件切片、Embedding、快照、匯出與清理
│       └── main.ts
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

Next.js Route Handler 只負責 request validation、權限與 response；SQL、AI prompt、Storage 操作應留在 `backend/server` 的 Service／Repository，避免 route 變成無法測試的大型函式。後端 repository 只允許 API 與 Worker 引用，frontend 不可引用。

---

## 13. MVP 開發順序與驗收條件

### Phase 0：專案骨架

* `frontend` / `backend` 頂層分離、pnpm workspace + Turborepo、Next.js、Next.js backend、Drizzle、Neon、JWT 登入／註冊、personal Workspace、管理員帳號管理與基本 CI。
* 驗收：註冊會以 transaction 建立 user + personal Workspace + owner membership；一個 `pnpm dev` 可啟動 Web、API、Inngest Dev Server；一般帳號無法進入管理 API；改密碼／停權後舊 refresh session 失效；API Key 加密落庫且任何讀取 API 都不回傳明文。

### Phase 1：Workspace 與多人畫布 MVP

* Shared Workspace CRUD、username 邀請、membership roles、Project CRUD、Liveblocks React Flow、Presence、文字節點、Edge、三區背景與 LR/TB 排版。
* 驗收：兩個瀏覽器帳號可同時看到游標與節點修改；viewer mutation 被前端與 Liveblocks permission 阻擋；非成員拿 project UUID 也無法取得 Room token；重新整理後位置與連線不遺失；移除成員後不能再次加入 Room。

### Phase 2：Chat 與 AI 節點

* Gemini 串流對話、回覆轉節點、選取節點 AI 延伸、Structured Outputs。
* 驗收：模型回傳格式錯誤不會建立壞資料；重送 request 不會產生重複節點；有清楚的 loading、cancel、retry 狀態。

### Phase 3：收斂驗證與文字型 RAG（條件式）

* 先完成收斂區的節點選取、摘要與輸出；確認需要來源追溯後，再加入 Cloudflare R2、PDF/TXT/MD、Inngest 切片、Embedding、引用來源與文件刪除。
* 驗收：沒有自己的 Gemini API Key 時禁止啟動 AI/RAG 並導向設定；上傳失敗可重試；引用可回到正確頁碼／片段；刪除文件後 R2 原始檔與向量都不可再取得。

### Phase 4：收斂與輸出

* 勾選節點收斂、Markdown/JSON 匯出、使用量與錯誤觀測。
* 驗收：大型畫布不會超出模型輸入限制；匯出內容保留節點順序、來源與連線關係。

### Phase 5：進階能力

* 圖片／影片理解、PNG/SVG、專案複製、分享、多人協作、版本歷史。

---

## 14. 專案初始化與開啟流程

### 14.1 目前狀態

目前已建立 pnpm workspace、Turborepo、`frontend` 與 `backend` 兩個 Next.js 專案；可直接執行 `pnpm dev`。Frontend 使用 port 3000，Backend 使用 port 3001，API base path 固定為 `/api`，不使用 `/v1`。

### 14.2 第一次初始化（PowerShell）

先確認環境：

```powershell
node --version   # Next.js 16 至少需要 Node.js 20.9
pnpm --version
```

目前骨架已建立，不需要再次執行 create-next-app。若從零重建，兩個目錄都使用 Next.js App Router：

```powershell
cd C:\webProjects\context-flow
pnpm create next-app@latest frontend --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --skip-install
pnpm create next-app@latest backend --ts --eslint --app --import-alias "@/*" --skip-install
```

接著建立根目錄的 `package.json`、`pnpm-workspace.yaml`、`turbo.json`。統一 package name 為 `@context-flow/frontend`、`@context-flow/backend`，根目錄 scripts 至少提供 `dev`、`build`、`lint`、`typecheck`。完成 workspace 後再安裝第一階段套件：

```powershell
pnpm --filter @context-flow/frontend add @xyflow/react @liveblocks/client @liveblocks/react @liveblocks/react-flow zustand @dagrejs/dagre react-markdown remark-gfm zod
pnpm --filter @context-flow/backend add @google/genai @liveblocks/node @aws-sdk/client-s3 @aws-sdk/s3-request-presigner inngest jose drizzle-orm @neondatabase/serverless
pnpm --filter @context-flow/backend add -D drizzle-kit
pnpm add -Dw turbo
Set-Location frontend
pnpm dlx shadcn@latest init
Set-Location ..
```

以上只安裝已確定的 JWT、Liveblocks、Cloudflare R2 與 Inngest 路線，不再同時引入其他 Auth、Storage、Realtime 或 Queue 候選套件。

### 14.3 環境變數

`frontend/.env.local` 只放瀏覽器可以知道的設定：

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
```

`backend/.env.local` 放 API 與 Worker 使用的 server secrets：

```dotenv
DATABASE_URL=
GEMINI_MODEL=gemini-3.6-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GEMINI_EMBEDDING_DIMENSIONS=768
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ISSUER=context-flow-api
JWT_AUDIENCE=context-flow-web
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
USER_API_KEY_ENCRYPTION_KEY=
USER_API_KEY_ENCRYPTION_KEY_VERSION=1
INITIAL_ADMIN_USERNAME=
INITIAL_ADMIN_PASSWORD_HASH=
R2_ACCOUNT_ID=
R2_BUCKET_NAME=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
LIVEBLOCKS_SECRET_KEY=
LIVEBLOCKS_WEBHOOK_SECRET=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

建立可提交的 `.env.example`，只留空值與說明，禁止放真實金鑰。初始管理員密碼應在本機以 Node.js scrypt 產生 hash，再只把 `INITIAL_ADMIN_PASSWORD_HASH` 交給一次性 seed；成功建立後從部署設定移除。R2 Bucket 保持 private，瀏覽器上傳／下載只取得短效 Presigned URL。

### 14.4 每次開發時的開啟方式

```powershell
cd C:\webProjects\context-flow
pnpm install
pnpm dev
```

Turborepo 會同時啟動 Web 與 API；需要 Inngest Dev Server 時另開終端機執行 `pnpm dev:inngest`：

* Web：`http://localhost:3000`
* API health check：`http://localhost:3001/api/health`
* Inngest Dev Server：`http://localhost:8288`

通常只有 lockfile 或依賴有變更時才需要再次執行 `pnpm install`；平常直接 `pnpm dev` 即可。如果 Web 能開但資料無法載入，先確認 API health check，再檢查 `NEXT_PUBLIC_API_BASE_URL`、CORS 與登入 token。

根目錄 `dev` script 使用 `turbo run dev`；`dev:inngest` 連到 `http://localhost:3001/api/inngest`。不要把 Inngest Dev Server 誤當成正式環境 worker。

### 14.5 提交前檢查

```powershell
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

資料庫 migration、單元測試與端對端測試指令，等骨架及工具確定後加入 `package.json` scripts，讓本機與 CI 使用同一組命令。

### 14.6 Vercel 部署流程

1. 同一個 Git repository 建立兩個 Vercel Project：Frontend 的 Root Directory 設為 `frontend`，Backend 設為 `backend`。
2. Frontend 只配置公開 API URL；Backend 配置 Neon、JWT、Gemini Key encryption、R2、Liveblocks 與 Inngest secrets。
3. Backend 使用 Next.js Route Handlers，由 Vercel 自動建立 Functions；本機以 `next dev --port 3001` 啟動。
4. Inngest production endpoint 為 Backend 的 `/api/inngest`，部署後在 Inngest Cloud 完成 app sync；耗時流程拆成多個可重試 step。
5. Liveblocks webhook 指向 Backend internal webhook，驗證 signature 後才送出 Inngest snapshot event。
6. R2 bucket 保持 private，CORS 只允許正式 Frontend domain 與 localhost；Presigned URL 使用短效期限並限制 operation/object key。
7. Vercel Preview 與 Production 使用分離的 Neon branch、R2 prefix/bucket、Liveblocks project 與 secrets，避免測試資料寫入正式環境。

---

## 15. 已確認決策紀錄

1. 帳號：Next.js backend 自建 Username/Password；JWT MVP 使用 HS256，Access 與 Refresh 使用不同 secret。未來拆成多個驗證服務時再評估 RS256／EdDSA 與 `kid` 輪替。
2. 註冊：任何人可直接設定唯一 username + password，不需要 Email 或信箱驗證。
3. 忘記密碼：使用者輸入註冊 Email，系統寄出一次性短效重設連結；使用者自行設定新密碼。
4. AI：沒有平台共用額度；使用者必須先在帳號設定加入自己的 Gemini API Key，否則 AI、Embedding 與 RAG 處理不可用。
5. 權限：每人註冊後自動擁有 personal Workspace；Shared Workspace 使用 membership model，支援多位成員共同編輯多個 Project。
6. 共編：Liveblocks Room + `@liveblocks/react-flow`，Next.js backend 依 JWT 與 Membership 簽發 room permission。
7. 檔案：Cloudflare R2 private bucket + 短效 Presigned URL。
8. 背景工作：Inngest，承接文件解析、Embedding、Liveblocks 快照、匯出與刪除清理。
9. 部署：Frontend 與 Next.js Backend 分成兩個 Vercel Project；長時間工作交給 Inngest，WebSocket 共編交給 Liveblocks。

---

## 16. 官方參考資料（2026-08-31 核對）

* Next.js 16 升級與 Node.js 版本需求：https://nextjs.org/docs/app/guides/upgrading/version-16
* Next.js 支援版本政策：https://nextjs.org/support-policy
* Gemini 模型列表：https://ai.google.dev/gemini-api/docs/models
* Gemini Embedding 與維度設定：https://ai.google.dev/gemini-api/docs/embeddings
* Neon pgvector 搜尋與 HNSW／IVFFlat：https://neon.com/docs/ai/ai-vector-search-optimization
* Next.js backend JWT Authentication：https://docs.nestjs.com/security/authentication
* OWASP Password Storage（Node.js scrypt）：https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
* OWASP JSON Web Token Security：https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html
* OWASP Secrets Management：https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
* Vercel Functions Limits（不支援作為 WebSocket Server）：https://vercel.com/docs/limits
* Cloudflare R2 Presigned URLs：https://developers.cloudflare.com/r2/api/s3/presigned-urls/
* Inngest Next.js backend Quick Start：https://www.inngest.com/docs/getting-started/nestjs-quick-start
* Liveblocks React Flow Integration：https://liveblocks.io/docs/api-reference/liveblocks-react-flow
