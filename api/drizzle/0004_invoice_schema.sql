CREATE TYPE "public"."allocation_status" AS ENUM('pending', 'approved', 'rejected', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'finalized', 'sent', 'paid', 'partially_paid', 'cancelled', 'credited');--> statement-breakpoint
CREATE TYPE "public"."sequence_group" AS ENUM('tax_document', 'credit_note', 'receipt');--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"catalog_number" text,
	"quantity" numeric(12, 4) NOT NULL,
	"unit_price_agora" integer NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"vat_rate_basis_points" integer NOT NULL,
	"line_total_agora" integer DEFAULT 0 NOT NULL,
	"vat_amount_agora" integer DEFAULT 0 NOT NULL,
	"line_total_incl_vat_agora" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_items_invoice_position_unique" UNIQUE("invoice_id","position")
);
--> statement-breakpoint
CREATE TABLE "invoice_sequences" (
	"business_id" uuid NOT NULL,
	"sequence_group" "sequence_group" NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_sequences_business_id_sequence_group_pk" PRIMARY KEY("business_id","sequence_group")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid,
	"customer_name" text,
	"customer_tax_id" text,
	"customer_address" text,
	"customer_email" text,
	"document_type" "document_type" NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"is_overdue" boolean DEFAULT false NOT NULL,
	"sequence_number" integer,
	"full_number" text,
	"credited_invoice_id" uuid,
	"sequence_group" "sequence_group",
	"invoice_date" date DEFAULT CURRENT_DATE NOT NULL,
	"issued_at" timestamp with time zone,
	"due_date" date,
	"notes" text,
	"internal_notes" text,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"vat_exemption_reason" text,
	"subtotal_agora" integer DEFAULT 0 NOT NULL,
	"discount_agora" integer DEFAULT 0 NOT NULL,
	"total_excl_vat_agora" integer DEFAULT 0 NOT NULL,
	"vat_agora" integer DEFAULT 0 NOT NULL,
	"total_incl_vat_agora" integer DEFAULT 0 NOT NULL,
	"allocation_status" "allocation_status",
	"allocation_number" text,
	"allocation_error" text,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credited_invoice_id_invoices_id_fk" FOREIGN KEY ("credited_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_business_seqgroup_seqnum_unique" ON "invoices" USING btree ("business_id","sequence_group","sequence_number") WHERE "invoices"."sequence_number" is not null;--> statement-breakpoint
CREATE INDEX "invoices_business_status_idx" ON "invoices" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "invoices_business_date_idx" ON "invoices" USING btree ("business_id","invoice_date");--> statement-breakpoint
CREATE INDEX "invoices_business_customer_idx" ON "invoices" USING btree ("business_id","customer_id");--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN "next_invoice_number";