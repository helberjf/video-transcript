-- Convites: so quem tem codigo valido cria conta na versao web
CREATE TABLE IF NOT EXISTS "invite_codes" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "note" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'trial',
  "max_uses" INTEGER NOT NULL DEFAULT 1,
  "uses" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3),
  "disabled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "invite_redemptions" (
  "id" TEXT PRIMARY KEY,
  "invite_code_id" TEXT NOT NULL REFERENCES "invite_codes"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL,
  "user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "invite_redemptions_code_email_key"
  ON "invite_redemptions"("invite_code_id", "email");

CREATE INDEX IF NOT EXISTS "invite_redemptions_email_idx" ON "invite_redemptions"("email");
