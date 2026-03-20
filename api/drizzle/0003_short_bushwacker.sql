DROP INDEX "whatsapp_conversations_phone_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversations_phone_unique" ON "whatsapp_conversations" USING btree ("phone");