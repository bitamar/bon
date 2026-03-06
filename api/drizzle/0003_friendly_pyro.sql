CREATE TYPE "public"."shaam_audit_result" AS ENUM('approved', 'rejected', 'deferred', 'error', 'emergency');--> statement-breakpoint
CREATE TABLE "shaam_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"request_payload" text NOT NULL,
	"response_payload" text,
	"http_status" integer,
	"allocation_number" text,
	"error_code" text,
	"result" "shaam_audit_result" NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shaam_audit_log" ADD CONSTRAINT "shaam_audit_log_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shaam_audit_log" ADD CONSTRAINT "shaam_audit_log_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shaam_audit_log_invoice_idx" ON "shaam_audit_log" USING btree ("invoice_id");