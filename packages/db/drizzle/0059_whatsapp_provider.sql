CREATE TABLE "messaging_whatsapp_cloud_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"waba_id" text NOT NULL,
	"business_id" text,
	"phone_number_id" text NOT NULL,
	"display_phone_number" text,
	"verified_name" text,
	"platform_type" text,
	"is_on_biz_app" boolean,
	"access_token_encrypted" jsonb NOT NULL,
	"token_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_via" text NOT NULL,
	"history_sync_status" text DEFAULT 'not_requested' NOT NULL,
	"contact_sync_status" text DEFAULT 'not_requested' NOT NULL,
	"token_issued_at" timestamp with time zone,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_whatsapp_cloud_accounts_connection_unique" UNIQUE("channel_connection_id"),
	CONSTRAINT "messaging_whatsapp_cloud_accounts_phone_unique" UNIQUE("phone_number_id"),
	CONSTRAINT "messaging_whatsapp_cloud_accounts_waba_id_length_check" CHECK (length(trim("messaging_whatsapp_cloud_accounts"."waba_id")) between 1 and 200),
	CONSTRAINT "messaging_whatsapp_cloud_accounts_business_id_length_check" CHECK ("messaging_whatsapp_cloud_accounts"."business_id" is null or length(trim("messaging_whatsapp_cloud_accounts"."business_id")) between 1 and 200),
	CONSTRAINT "messaging_whatsapp_cloud_accounts_phone_id_length_check" CHECK (length(trim("messaging_whatsapp_cloud_accounts"."phone_number_id")) between 1 and 200),
	CONSTRAINT "messaging_whatsapp_cloud_accounts_access_token_object_check" CHECK (jsonb_typeof("messaging_whatsapp_cloud_accounts"."access_token_encrypted") = 'object'),
	CONSTRAINT "messaging_whatsapp_cloud_accounts_token_scopes_array_check" CHECK (jsonb_typeof("messaging_whatsapp_cloud_accounts"."token_scopes") = 'array'),
	CONSTRAINT "messaging_whatsapp_cloud_accounts_connected_via_check" CHECK ("messaging_whatsapp_cloud_accounts"."connected_via" = 'embedded_signup_coexistence'),
	CONSTRAINT "messaging_whatsapp_cloud_accounts_history_status_check" CHECK ("messaging_whatsapp_cloud_accounts"."history_sync_status" in ('not_requested', 'requested', 'syncing', 'completed', 'declined', 'failed', 'partial')),
	CONSTRAINT "messaging_whatsapp_cloud_accounts_contact_status_check" CHECK ("messaging_whatsapp_cloud_accounts"."contact_sync_status" in ('not_requested', 'requested', 'syncing', 'completed', 'declined', 'failed', 'partial'))
);
--> statement-breakpoint
CREATE TABLE "messaging_provider_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"event_key" text NOT NULL,
	"field" text NOT NULL,
	"external_account_id" text,
	"external_owner_user_id" text,
	"payload_ref" text,
	"payload_encrypted" jsonb,
	"normalized_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"processed_at" timestamp with time zone,
	CONSTRAINT "messaging_provider_webhook_events_event_key_unique" UNIQUE("event_key"),
	CONSTRAINT "messaging_provider_webhook_events_provider_check" CHECK ("messaging_provider_webhook_events"."provider" in ('telegram', 'instagram', 'whatsapp')),
	CONSTRAINT "messaging_provider_webhook_events_mode_check" CHECK ("messaging_provider_webhook_events"."mode" in ('telegram_business_bot', 'telegram_mtproto_account', 'instagram_graph', 'whatsapp_cloud')),
	CONSTRAINT "messaging_provider_webhook_events_status_check" CHECK ("messaging_provider_webhook_events"."processing_status" in ('pending', 'processing', 'processed', 'failed', 'ignored')),
	CONSTRAINT "messaging_provider_webhook_events_event_key_length_check" CHECK (length(trim("messaging_provider_webhook_events"."event_key")) between 1 and 500),
	CONSTRAINT "messaging_provider_webhook_events_field_length_check" CHECK (length(trim("messaging_provider_webhook_events"."field")) between 1 and 200),
	CONSTRAINT "messaging_provider_webhook_events_attempt_count_check" CHECK ("messaging_provider_webhook_events"."attempt_count" >= 0),
	CONSTRAINT "messaging_provider_webhook_events_summary_object_check" CHECK (jsonb_typeof("messaging_provider_webhook_events"."normalized_summary") = 'object'),
	CONSTRAINT "messaging_provider_webhook_events_payload_encrypted_object_check" CHECK ("messaging_provider_webhook_events"."payload_encrypted" is null or jsonb_typeof("messaging_provider_webhook_events"."payload_encrypted") = 'object')
);
--> statement-breakpoint
ALTER TABLE "messaging_channel_connections" DROP CONSTRAINT "messaging_channel_connections_provider_check";--> statement-breakpoint
ALTER TABLE "messaging_channel_connections" DROP CONSTRAINT "messaging_channel_connections_mode_check";--> statement-breakpoint
ALTER TABLE "messaging_channel_connections" DROP CONSTRAINT "messaging_channel_connections_provider_mode_check";--> statement-breakpoint
ALTER TABLE "messaging_external_identities" DROP CONSTRAINT "messaging_external_identities_provider_check";--> statement-breakpoint
ALTER TABLE "messaging_thread_identities" DROP CONSTRAINT "messaging_thread_identities_provider_check";--> statement-breakpoint
ALTER TABLE "message_media_ingestions" DROP CONSTRAINT "message_media_ingestions_provider_check";--> statement-breakpoint
ALTER TABLE "message_delivery_attempts" DROP CONSTRAINT "message_delivery_attempts_provider_check";--> statement-breakpoint
ALTER TABLE "messaging_whatsapp_cloud_accounts" ADD CONSTRAINT "messaging_whatsapp_cloud_accounts_channel_connection_id_messaging_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."messaging_channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messaging_provider_webhook_events_status_received_idx" ON "messaging_provider_webhook_events" USING btree ("processing_status","received_at");--> statement-breakpoint
ALTER TABLE "messaging_channel_connections" ADD CONSTRAINT "messaging_channel_connections_provider_check" CHECK ("messaging_channel_connections"."provider" in ('telegram', 'instagram', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "messaging_channel_connections" ADD CONSTRAINT "messaging_channel_connections_mode_check" CHECK ("messaging_channel_connections"."mode" in ('telegram_business_bot', 'telegram_mtproto_account', 'instagram_graph', 'whatsapp_cloud'));--> statement-breakpoint
ALTER TABLE "messaging_channel_connections" ADD CONSTRAINT "messaging_channel_connections_provider_mode_check" CHECK (("messaging_channel_connections"."provider" = 'telegram' and "messaging_channel_connections"."mode" in ('telegram_business_bot', 'telegram_mtproto_account')) or ("messaging_channel_connections"."provider" = 'instagram' and "messaging_channel_connections"."mode" = 'instagram_graph') or ("messaging_channel_connections"."provider" = 'whatsapp' and "messaging_channel_connections"."mode" = 'whatsapp_cloud'));--> statement-breakpoint
ALTER TABLE "messaging_external_identities" ADD CONSTRAINT "messaging_external_identities_provider_check" CHECK ("messaging_external_identities"."provider" in ('telegram', 'instagram', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "messaging_thread_identities" ADD CONSTRAINT "messaging_thread_identities_provider_check" CHECK ("messaging_thread_identities"."provider" in ('telegram', 'instagram', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "message_media_ingestions" ADD CONSTRAINT "message_media_ingestions_provider_check" CHECK ("message_media_ingestions"."provider" in ('telegram', 'instagram', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "message_delivery_attempts" ADD CONSTRAINT "message_delivery_attempts_provider_check" CHECK ("message_delivery_attempts"."provider" in ('telegram', 'instagram', 'whatsapp'));