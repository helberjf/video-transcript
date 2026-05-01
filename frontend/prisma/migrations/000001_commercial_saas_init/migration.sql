CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT,
  "email" TEXT UNIQUE,
  "email_verified" TIMESTAMP(3),
  "image" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_account_id" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts"("user_id");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT PRIMARY KEY,
  "session_token" TEXT NOT NULL UNIQUE,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions"("user_id");

CREATE TABLE IF NOT EXISTS "verification_tokens" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" VARCHAR(80) PRIMARY KEY,
  "client_name" VARCHAR(160) NOT NULL,
  "owner_name" VARCHAR(160) NOT NULL,
  "owner_email" VARCHAR(255) NOT NULL,
  "segment" VARCHAR(160) NOT NULL,
  "plan" VARCHAR(24) NOT NULL DEFAULT 'trial',
  "billing_status" VARCHAR(40) NOT NULL DEFAULT 'trialing',
  "stripe_customer_id" VARCHAR(120) UNIQUE,
  "stripe_subscription_id" VARCHAR(120) UNIQUE,
  "stripe_price_id" VARCHAR(120),
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "onboarding_step" INTEGER NOT NULL DEFAULT 0,
  "owner_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "workspaces_owner_email_idx" ON "workspaces"("owner_email");
CREATE INDEX IF NOT EXISTS "workspaces_plan_idx" ON "workspaces"("plan");

CREATE TABLE IF NOT EXISTS "workspace_members" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" VARCHAR(80) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "role" VARCHAR(32) NOT NULL DEFAULT 'owner',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");
CREATE INDEX IF NOT EXISTS "workspace_members_user_id_idx" ON "workspace_members"("user_id");

CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" VARCHAR(80) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" VARCHAR(80) NOT NULL,
  "credits" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(160) UNIQUE,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "usage_events_workspace_id_created_at_idx" ON "usage_events"("workspace_id", "created_at");

CREATE TABLE IF NOT EXISTS "stripe_events" (
  "id" TEXT PRIMARY KEY,
  "type" VARCHAR(120) NOT NULL,
  "workspace_id" VARCHAR(80) REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB
);

CREATE INDEX IF NOT EXISTS "stripe_events_type_idx" ON "stripe_events"("type");
CREATE INDEX IF NOT EXISTS "stripe_events_workspace_id_idx" ON "stripe_events"("workspace_id");
