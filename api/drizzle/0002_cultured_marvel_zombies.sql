CREATE TYPE "public"."conversation_status" AS ENUM('active', 'idle', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."llm_role" AS ENUM('user', 'assistant', 'tool_call', 'tool_result');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TABLE "whatsapp_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"active_business_id" uuid,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_conversations_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"twilio_sid" text,
	"direction" "message_direction" NOT NULL,
	"llm_role" "llm_role" NOT NULL,
	"tool_name" text,
	"tool_call_id" text,
	"body" text NOT NULL,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_pending_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"payload" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_active_business_id_businesses_id_fk" FOREIGN KEY ("active_business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_pending_actions" ADD CONSTRAINT "whatsapp_pending_actions_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_conversations_phone_idx" ON "whatsapp_conversations" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messages_twilio_sid_unique" ON "whatsapp_messages" USING btree ("twilio_sid") WHERE "whatsapp_messages"."twilio_sid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "whatsapp_messages_conversation_created_idx" ON "whatsapp_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_pending_actions_conv_type_unique" ON "whatsapp_pending_actions" USING btree ("conversation_id","action_type");