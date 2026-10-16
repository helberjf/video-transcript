-- Contadores de rate limit compartilhados entre as instancias serverless.
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "key" TEXT PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "rate_limit_buckets_window_start_idx" ON "rate_limit_buckets"("window_start");
