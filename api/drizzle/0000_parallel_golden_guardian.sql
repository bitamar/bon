CREATE TYPE "public"."allocation_status" AS ENUM('pending', 'approved', 'rejected', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."business_role" AS ENUM('owner', 'admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."business_type" AS ENUM('licensed_dealer', 'exempt_dealer', 'limited_company');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'finalized', 'sent', 'paid', 'partially_paid', 'cancelled', 'credited');--> statement-breakpoint
CREATE TYPE "public"."sequence_group" AS ENUM('tax_document', 'credit_note', 'receipt');--> statement-breakpoint
CREATE TYPE "public"."tax_id_type" AS ENUM('company_id', 'vat_number', 'personal_id', 'none');--> statement-breakpoint
CREATE TABLE "business_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "business_role" NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"personal_message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_invitations_token_unique" UNIQUE("token"),
	CONSTRAINT "business_invitations_business_id_email_unique" UNIQUE("business_id","email")
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
	CONSTRAINT "businesses_vat_number_unique" UNIQUE("vat_number")
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"role" "business_role" NOT NULL,
	"invited_by_user_id" uuid,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
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
ALTER TABLE "business_invitations" ADD CONSTRAINT "business_invitations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invitations" ADD CONSTRAINT "business_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credited_invoice_id_invoices_id_fk" FOREIGN KEY ("credited_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_businesses" ADD CONSTRAINT "user_businesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_businesses" ADD CONSTRAINT "user_businesses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_businesses" ADD CONSTRAINT "user_businesses_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_invitations_business_id_idx" ON "business_invitations" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_invitations_email_idx" ON "business_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_business_id_tax_id_unique" ON "customers" USING btree ("business_id","tax_id") WHERE "customers"."tax_id"is not null and"customers"."is_active"= true;--> statement-breakpoint
CREATE INDEX "customers_business_id_idx" ON "customers" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_business_seqgroup_seqnum_unique" ON "invoices" USING btree ("business_id","sequence_group","sequence_number") WHERE "invoices"."sequence_number"is not null;--> statement-breakpoint
CREATE INDEX "invoices_business_status_idx" ON "invoices" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "invoices_business_date_idx" ON "invoices" USING btree ("business_id","invoice_date");--> statement-breakpoint
CREATE INDEX "invoices_business_customer_idx" ON "invoices" USING btree ("business_id","customer_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_businesses_active_unique" ON "user_businesses" USING btree ("user_id","business_id") WHERE "user_businesses"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "user_businesses_business_id_idx" ON "user_businesses" USING btree ("business_id");