-- Contas que o admin liberou para usar a chave de IA dele. As demais usam a propria chave.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "use_owner_ai_key" BOOLEAN NOT NULL DEFAULT false;
