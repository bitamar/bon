ALTER TABLE "customers" DROP CONSTRAINT "customers_business_id_tax_id_unique";--> statement-breakpoint
DROP INDEX "user_businesses_active_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "customers_business_id_tax_id_unique" ON "customers" USING btree ("business_id","tax_id") WHERE "customers"."tax_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_businesses_active_unique" ON "user_businesses" USING btree ("user_id","business_id") WHERE "user_businesses"."removed_at" is null;