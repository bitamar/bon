CREATE TYPE "public"."tax_id_type" AS ENUM('company_id', 'vat_number', 'personal_id', 'none');--> statement-breakpoint
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_business_id_tax_id_unique" UNIQUE("business_id","tax_id")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;