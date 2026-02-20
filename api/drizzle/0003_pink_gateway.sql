ALTER TABLE "customers" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_businesses" ADD COLUMN "removed_at" timestamp with time zone;