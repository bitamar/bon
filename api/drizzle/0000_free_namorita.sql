CREATE TYPE "public"."allocation_status" AS ENUM('pending', 'approved', 'rejected', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."business_role" AS ENUM('owner', 'admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."business_type" AS ENUM('licensed_dealer', 'exempt_dealer', 'limited_company');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'finalized', 'sent', 'paid', 'partially_paid', 'cancelled', 'credited');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer', 'credit', 'check', 'other');--> statement-breakpoint
CREATE TYPE "public"."sequence_group" AS ENUM('tax_document', 'credit_note', 'receipt');--> statement-breakpoint
CREATE TYPE "public"."shaam_audit_result" AS ENUM('approved', 'rejected', 'deferred', 'error', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'cancelled', 'trialing');--> statement-breakpoint
CREATE TYPE "public"."tax_id_type" AS ENUM('company_id', 'vat_number', 'personal_id', 'none');--> statement-breakpoint
CREATE TABLE "business_shaam_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"needs_reauth" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_shaam_credentials_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"business_type" "business_type" NOT NULL,
	"registration_number" text NOT NULL,
	"vat_number" text,
	"street_address" text,
	"city" text,
	"postal_code" text,
	"phone" text,
	"email" text,
	"invoice_number_prefix" text,
	"starting_invoice_number" integer DEFAULT 1 NOT NULL,
	"default_vat_rate" integer DEFAULT 1700 NOT NULL,
	"logo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_registration_number_unique" UNIQUE("registration_number"),
	CONSTRAINT "businesses_vat_number_unique" UNIQUE("vat_number"),
	CONSTRAINT "businesses_soft_delete_check" CHECK (("businesses"."is_active" AND "businesses"."deleted_at" IS NULL) OR (NOT "businesses"."is_active" AND "businesses"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"tax_id_type" "tax_id_type" DEFAULT 'none' NOT NULL,
	"is_licensed_dealer" boolean DEFAULT false NOT NULL,
	"email" text,
	"phone" text,
	"street_address" text,
	"city" text,
	"postal_code" text,
	"contact_name" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_soft_delete_check" CHECK (("customers"."is_active" AND "customers"."deleted_at" IS NULL) OR (NOT "customers"."is_active" AND "customers"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
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
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"catalog_number" text,
	"quantity" numeric(12, 4) NOT NULL,
	"unit_price_minor_units" integer NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"vat_rate_basis_points" integer NOT NULL,
	"line_total_minor_units" integer DEFAULT 0 NOT NULL,
	"vat_amount_minor_units" integer DEFAULT 0 NOT NULL,
	"line_total_incl_vat_minor_units" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_items_invoice_position_unique" UNIQUE("invoice_id","position")
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_minor_units" integer NOT NULL,
	"paid_at" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"notes" text,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_payments_amount_positive" CHECK ("invoice_payments"."amount_minor_units" > 0)
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
	"document_number" text,
	"credited_invoice_id" uuid,
	"sequence_group" "sequence_group",
	"invoice_date" date DEFAULT CURRENT_DATE NOT NULL,
	"issued_at" timestamp with time zone,
	"due_date" date,
	"notes" text,
	"internal_notes" text,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"vat_exemption_reason" text,
	"subtotal_minor_units" integer DEFAULT 0 NOT NULL,
	"discount_minor_units" integer DEFAULT 0 NOT NULL,
	"total_excl_vat_minor_units" integer DEFAULT 0 NOT NULL,
	"vat_minor_units" integer DEFAULT 0 NOT NULL,
	"total_incl_vat_minor_units" integer DEFAULT 0 NOT NULL,
	"allocation_status" "allocation_status",
	"allocation_number" text,
	"allocation_error" text,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"plan" "subscription_plan" NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"meshulam_customer_id" text,
	"meshulam_process_id" text,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "user_businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"role" "business_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"google_id" text,
	"name" text NOT NULL,
	"avatar_url" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "business_shaam_credentials" ADD CONSTRAINT "business_shaam_credentials_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_allocation_numbers" ADD CONSTRAINT "emergency_allocation_numbers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_allocation_numbers" ADD CONSTRAINT "emergency_allocation_numbers_used_for_invoice_id_invoices_id_fk" FOREIGN KEY ("used_for_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credited_invoice_id_invoices_id_fk" FOREIGN KEY ("credited_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shaam_audit_log" ADD CONSTRAINT "shaam_audit_log_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shaam_audit_log" ADD CONSTRAINT "shaam_audit_log_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_businesses" ADD CONSTRAINT "user_businesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_businesses" ADD CONSTRAINT "user_businesses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_business_id_tax_id_unique" ON "customers" USING btree ("business_id","tax_id") WHERE "customers"."tax_id"is not null and"customers"."is_active"= true;--> statement-breakpoint
CREATE INDEX "customers_business_id_idx" ON "customers" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_numbers_business_number_unique" ON "emergency_allocation_numbers" USING btree ("business_id","number");--> statement-breakpoint
CREATE INDEX "emergency_numbers_business_available_idx" ON "emergency_allocation_numbers" USING btree ("business_id","used") WHERE "emergency_allocation_numbers"."used" = false;--> statement-breakpoint
CREATE INDEX "invoice_payments_invoice_id_idx" ON "invoice_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_business_seqgroup_seqnum_unique" ON "invoices" USING btree ("business_id","sequence_group","sequence_number") WHERE "invoices"."sequence_number"is not null;--> statement-breakpoint
CREATE INDEX "invoices_business_status_idx" ON "invoices" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "invoices_business_date_idx" ON "invoices" USING btree ("business_id","invoice_date");--> statement-breakpoint
CREATE INDEX "invoices_business_customer_idx" ON "invoices" USING btree ("business_id","customer_id");--> statement-breakpoint
CREATE INDEX "invoices_draft_cleanup_idx" ON "invoices" USING btree ("updated_at") WHERE "invoices"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "invoices_overdue_candidates_idx" ON "invoices" USING btree ("due_date","status") WHERE "invoices"."is_overdue" = false AND "invoices"."due_date" IS NOT NULL AND "invoices"."status" IN ('finalized', 'sent', 'partially_paid');--> statement-breakpoint
CREATE INDEX "invoices_overdue_reset_idx" ON "invoices" USING btree ("status") WHERE "invoices"."is_overdue" = true AND "invoices"."status" IN ('paid', 'cancelled', 'credited');--> statement-breakpoint
CREATE INDEX "invoices_credited_invoice_idx" ON "invoices" USING btree ("business_id","credited_invoice_id","document_type");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "shaam_audit_log_invoice_idx" ON "shaam_audit_log" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_businesses_user_business_unique" ON "user_businesses" USING btree ("user_id","business_id");--> statement-breakpoint
CREATE INDEX "user_businesses_business_id_idx" ON "user_businesses" USING btree ("business_id");