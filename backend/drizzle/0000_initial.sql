CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "username" varchar(50) NOT NULL, "password_hash" text NOT NULL,
  "display_name" varchar(100), "role" varchar(20) NOT NULL DEFAULT 'user', "status" varchar(20) NOT NULL DEFAULT 'active',
  "token_version" integer NOT NULL DEFAULT 1, "last_login_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(), CHECK ("role" IN ('user', 'admin')), CHECK ("status" IN ('active', 'suspended'))
);
CREATE UNIQUE INDEX "idx_users_username_lower" ON "users" (lower("username"));

CREATE TABLE "refresh_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE, "user_agent" text, "ip_address" text, "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_refresh_sessions_user" ON "refresh_sessions" ("user_id");

CREATE TABLE "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "issued_by_admin_id" uuid REFERENCES "users"("id") ON DELETE SET NULL, "token_hash" varchar(64) NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL, "consumed_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "user_ai_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" varchar(30) NOT NULL DEFAULT 'gemini', "encrypted_api_key" text NOT NULL, "encryption_iv" text NOT NULL,
  "auth_tag" text NOT NULL, "encryption_key_version" integer NOT NULL DEFAULT 1, "key_hint" varchar(12) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active', "last_validated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), UNIQUE ("user_id", "provider")
);

CREATE TABLE "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" varchar(255) NOT NULL, "kind" varchar(20) NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL, "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(), CHECK ("kind" IN ('personal', 'shared'))
);
CREATE TABLE "workspace_members" (
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "role" varchar(20) NOT NULL,
  "joined_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("workspace_id", "user_id"),
  CHECK ("role" IN ('owner', 'admin', 'editor', 'viewer'))
);
CREATE INDEX "idx_workspace_members_user" ON "workspace_members" ("user_id");
CREATE TABLE "workspace_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "target_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "invited_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL, "role" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending', "created_at" timestamptz NOT NULL DEFAULT now(), "responded_at" timestamptz
);

CREATE TABLE "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL, "name" varchar(255) NOT NULL, "description" text,
  "layout_direction" varchar(10) NOT NULL DEFAULT 'LR', "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_projects_workspace" ON "projects" ("workspace_id");
CREATE TABLE "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "uploaded_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL, "original_name" varchar(255) NOT NULL,
  "mime_type" varchar(100) NOT NULL, "storage_key" text NOT NULL UNIQUE, "size_bytes" bigint NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending', "error_message" text, "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "canvas_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "zone" varchar(20) NOT NULL, "media_type" varchar(30) NOT NULL, "title" varchar(255), "content" text, "media_url" text,
  "tags" text[] NOT NULL DEFAULT ARRAY[]::text[], "position_x" real NOT NULL, "position_y" real NOT NULL,
  "grounding_source" jsonb, "version" integer NOT NULL DEFAULT 1, "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
