-- Add password field to users for credentials authentication
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password" TEXT;

-- Add CNPJ field to workspaces
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "cnpj" TEXT;

-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "password_reset_tokens_email_idx" ON "password_reset_tokens"("email");
