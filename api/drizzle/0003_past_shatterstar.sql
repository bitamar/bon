-- Pre-migration safety: null out duplicate phone values before creating unique index.
-- Keep the most recently updated row for each phone; null the rest.
WITH ranked AS (
  SELECT id, phone, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY updated_at DESC) AS rn
  FROM users
  WHERE phone IS NOT NULL
)
UPDATE users SET phone = NULL
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone") WHERE phone IS NOT NULL;