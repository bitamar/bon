CREATE TABLE "emergency_allocation_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"number" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"used_for_invoice_id" uuid,
	"used_at" timestamp with time zone,
	"reported" boolean DEFAULT false NOT NULL,
	"reported_at" timestamp with time zone,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergency_allocation_numbers" ADD CONSTRAINT "emergency_allocation_numbers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_allocation_numbers" ADD CONSTRAINT "emergency_allocation_numbers_used_for_invoice_id_invoices_id_fk" FOREIGN KEY ("used_for_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_numbers_business_number_unique" ON "emergency_allocation_numbers" USING btree ("business_id","number");--> statement-breakpoint
CREATE INDEX "emergency_numbers_business_available_idx" ON "emergency_allocation_numbers" USING btree ("business_id","used") WHERE "emergency_allocation_numbers"."used" = false;