ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(320);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email_lower" ON "users" (lower("email")) WHERE "email" IS NOT NULL;
