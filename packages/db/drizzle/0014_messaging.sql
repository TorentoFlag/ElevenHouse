CREATE TABLE "messaging_channel_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'connecting' NOT NULL,
	"external_account_id" text,
	"external_owner_user_id" text,
	"display_name_snapshot" text,
	"username_snapshot" text,
	"capabilities" jsonb NOT NULL,
	"consent_record_id" uuid,
	"connected_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_channel_connections_id_provider_unique" UNIQUE("id","provider"),
	CONSTRAINT "messaging_channel_connections_provider_check" CHECK ("messaging_channel_connections"."provider" in ('telegram', 'instagram')),
	CONSTRAINT "messaging_channel_connections_mode_check" CHECK ("messaging_channel_connections"."mode" in ('telegram_business_bot', 'telegram_mtproto_account', 'instagram_graph')),
	CONSTRAINT "messaging_channel_connections_provider_mode_check" CHECK (("messaging_channel_connections"."provider" = 'telegram' and "messaging_channel_connections"."mode" in ('telegram_business_bot', 'telegram_mtproto_account')) or ("messaging_channel_connections"."provider" = 'instagram' and "messaging_channel_connections"."mode" = 'instagram_graph')),
	CONSTRAINT "messaging_channel_connections_status_check" CHECK ("messaging_channel_connections"."status" in ('connecting', 'active', 'paused', 'revoked', 'reauth_required', 'error')),
	CONSTRAINT "messaging_channel_connections_capabilities_object_check" CHECK (jsonb_typeof("messaging_channel_connections"."capabilities") = 'object'),
	CONSTRAINT "messaging_channel_connections_external_account_id_length_check" CHECK ("messaging_channel_connections"."external_account_id" is null or length(trim("messaging_channel_connections"."external_account_id")) between 1 and 200),
	CONSTRAINT "messaging_channel_connections_external_owner_id_length_check" CHECK ("messaging_channel_connections"."external_owner_user_id" is null or length(trim("messaging_channel_connections"."external_owner_user_id")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "messaging_external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text,
	"provider_chat_id" text NOT NULL,
	"username_snapshot" text,
	"display_name_snapshot" text,
	"avatar_media_id" uuid,
	"linked_client_user_id" uuid,
	"link_status" text DEFAULT 'unlinked' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "messaging_external_identities_id_provider_unique" UNIQUE("id","provider"),
	CONSTRAINT "messaging_external_identities_provider_check" CHECK ("messaging_external_identities"."provider" in ('telegram', 'instagram')),
	CONSTRAINT "messaging_external_identities_link_status_check" CHECK ("messaging_external_identities"."link_status" in ('unlinked', 'suggested', 'linked', 'ignored')),
	CONSTRAINT "messaging_external_identities_provider_chat_id_length_check" CHECK (length(trim("messaging_external_identities"."provider_chat_id")) between 1 and 200),
	CONSTRAINT "messaging_external_identities_seen_at_check" CHECK ("messaging_external_identities"."last_seen_at" >= "messaging_external_identities"."first_seen_at")
);
--> statement-breakpoint
CREATE TABLE "messaging_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"client_user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"last_message_id" uuid,
	"last_message_at" timestamp with time zone,
	"unread_astrologer_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_threads_status_check" CHECK ("messaging_threads"."status" in ('open', 'archived', 'blocked')),
	CONSTRAINT "messaging_threads_unread_astrologer_count_check" CHECK ("messaging_threads"."unread_astrologer_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "messaging_thread_identities" (
	"thread_id" uuid NOT NULL,
	"external_identity_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_thread_identities_provider_check" CHECK ("messaging_thread_identities"."provider" in ('telegram', 'instagram'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"external_identity_id" uuid,
	"direction" text NOT NULL,
	"sender_kind" text NOT NULL,
	"provider_message_id" text,
	"provider_update_id" text,
	"provider_sent_at" timestamp with time zone,
	"content_type" text DEFAULT 'text' NOT NULL,
	"text" text NOT NULL,
	"media_asset_id" uuid,
	"status" text NOT NULL,
	"failure_code" text,
	"idempotency_key" text,
	"request_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_direction_check" CHECK ("messages"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "messages_sender_kind_check" CHECK ("messages"."sender_kind" in ('client', 'astrologer', 'system')),
	CONSTRAINT "messages_content_type_check" CHECK ("messages"."content_type" in ('text', 'image', 'file', 'voice', 'video_note', 'video', 'unsupported')),
	CONSTRAINT "messages_status_check" CHECK ("messages"."status" in ('received', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'unknown', 'deleted')),
	CONSTRAINT "messages_text_length_check" CHECK (length("messages"."text") <= 4000),
	CONSTRAINT "messages_outbound_request_check" CHECK ("messages"."direction" <> 'outbound' or ("messages"."idempotency_key" is not null and "messages"."request_hash" ~ '^sha256:[a-f0-9]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "message_media_ingestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_file_id" text NOT NULL,
	"provider_file_unique_id" text NOT NULL,
	"provider_mime_type" text,
	"provider_size_bytes" integer,
	"content_type" text NOT NULL,
	"duration_seconds" integer,
	"width" integer,
	"height" integer,
	"download_status" text DEFAULT 'pending' NOT NULL,
	"media_asset_id" uuid,
	"failure_code" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"checksum_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_media_ingestions_provider_check" CHECK ("message_media_ingestions"."provider" in ('telegram', 'instagram')),
	CONSTRAINT "message_media_ingestions_content_type_check" CHECK ("message_media_ingestions"."content_type" in ('text', 'image', 'file', 'voice', 'video_note', 'video', 'unsupported')),
	CONSTRAINT "message_media_ingestions_download_status_check" CHECK ("message_media_ingestions"."download_status" in ('pending', 'downloading', 'ready', 'failed', 'permanent_failed')),
	CONSTRAINT "message_media_ingestions_provider_size_check" CHECK ("message_media_ingestions"."provider_size_bytes" is null or "message_media_ingestions"."provider_size_bytes" >= 0),
	CONSTRAINT "message_media_ingestions_duration_check" CHECK ("message_media_ingestions"."duration_seconds" is null or "message_media_ingestions"."duration_seconds" >= 0),
	CONSTRAINT "message_media_ingestions_width_check" CHECK ("message_media_ingestions"."width" is null or "message_media_ingestions"."width" > 0),
	CONSTRAINT "message_media_ingestions_height_check" CHECK ("message_media_ingestions"."height" is null or "message_media_ingestions"."height" > 0),
	CONSTRAINT "message_media_ingestions_attempt_count_check" CHECK ("message_media_ingestions"."attempt_count" >= 0),
	CONSTRAINT "message_media_ingestions_checksum_check" CHECK ("message_media_ingestions"."checksum_sha256" is null or "message_media_ingestions"."checksum_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "message_media_ingestions_ready_media_check" CHECK ("message_media_ingestions"."download_status" <> 'ready' or "message_media_ingestions"."media_asset_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "message_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_request_id" text,
	"provider_response_message_id" text,
	"provider_status_code" integer,
	"status" text NOT NULL,
	"retryable" boolean NOT NULL,
	"error_code" text,
	"error_message" text,
	"attempted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "message_delivery_attempts_provider_check" CHECK ("message_delivery_attempts"."provider" in ('telegram', 'instagram')),
	CONSTRAINT "message_delivery_attempts_status_check" CHECK ("message_delivery_attempts"."status" in ('sent', 'failed', 'unknown')),
	CONSTRAINT "message_delivery_attempts_number_check" CHECK ("message_delivery_attempts"."attempt_number" > 0),
	CONSTRAINT "message_delivery_attempts_status_code_check" CHECK ("message_delivery_attempts"."provider_status_code" is null or "message_delivery_attempts"."provider_status_code" between 100 and 599)
);
--> statement-breakpoint
CREATE TABLE "messaging_instagram_graph_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"instagram_user_id" text NOT NULL,
	"instagram_username" text,
	"instagram_display_name" text,
	"access_token_encrypted" jsonb NOT NULL,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_instagram_graph_accounts_connection_unique" UNIQUE("channel_connection_id"),
	CONSTRAINT "messaging_instagram_graph_accounts_instagram_user_unique" UNIQUE("instagram_user_id"),
	CONSTRAINT "messaging_instagram_graph_accounts_instagram_user_id_length_check" CHECK (length(trim("messaging_instagram_graph_accounts"."instagram_user_id")) between 1 and 200),
	CONSTRAINT "messaging_instagram_graph_accounts_access_token_object_check" CHECK (jsonb_typeof("messaging_instagram_graph_accounts"."access_token_encrypted") = 'object')
);
--> statement-breakpoint
CREATE TABLE "messaging_telegram_mtproto_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"login_state" text DEFAULT 'code_required' NOT NULL,
	"phone_number_encrypted" jsonb NOT NULL,
	"phone_code_hash_encrypted" jsonb NOT NULL,
	"session_encrypted" jsonb,
	"phone_number_last4" text NOT NULL,
	"telegram_user_id" text,
	"pts" integer,
	"qts" integer,
	"date_cursor" timestamp with time zone,
	"seq" integer,
	"lease_owner" text,
	"leased_until" timestamp with time zone,
	"last_listener_heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_telegram_mtproto_sessions_connection_unique" UNIQUE("channel_connection_id"),
	CONSTRAINT "messaging_telegram_mtproto_sessions_login_state_check" CHECK ("messaging_telegram_mtproto_sessions"."login_state" in ('code_required', 'password_required', 'authorized', 'reauth_required', 'revoked')),
	CONSTRAINT "messaging_telegram_mtproto_sessions_phone_last4_check" CHECK ("messaging_telegram_mtproto_sessions"."phone_number_last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "messaging_telegram_mtproto_sessions_phone_encrypted_object_check" CHECK (jsonb_typeof("messaging_telegram_mtproto_sessions"."phone_number_encrypted") = 'object'),
	CONSTRAINT "messaging_telegram_mtproto_sessions_phone_code_hash_encrypted_object_check" CHECK (jsonb_typeof("messaging_telegram_mtproto_sessions"."phone_code_hash_encrypted") = 'object'),
	CONSTRAINT "messaging_telegram_mtproto_sessions_session_encrypted_object_check" CHECK ("messaging_telegram_mtproto_sessions"."session_encrypted" is null or jsonb_typeof("messaging_telegram_mtproto_sessions"."session_encrypted") = 'object'),
	CONSTRAINT "messaging_telegram_mtproto_sessions_update_cursors_check" CHECK (("messaging_telegram_mtproto_sessions"."pts" is null or "messaging_telegram_mtproto_sessions"."pts" >= 0) and ("messaging_telegram_mtproto_sessions"."qts" is null or "messaging_telegram_mtproto_sessions"."qts" >= 0) and ("messaging_telegram_mtproto_sessions"."seq" is null or "messaging_telegram_mtproto_sessions"."seq" >= 0)),
	CONSTRAINT "messaging_telegram_mtproto_sessions_telegram_user_id_length_check" CHECK ("messaging_telegram_mtproto_sessions"."telegram_user_id" is null or length(trim("messaging_telegram_mtproto_sessions"."telegram_user_id")) between 1 and 200),
	CONSTRAINT "messaging_telegram_mtproto_sessions_lease_owner_length_check" CHECK ("messaging_telegram_mtproto_sessions"."lease_owner" is null or length(trim("messaging_telegram_mtproto_sessions"."lease_owner")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "messaging_realtime_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" bigserial NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"thread_id" uuid,
	"message_id" uuid,
	"channel_connection_id" uuid,
	"external_identity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_realtime_events_type_check" CHECK ("messaging_realtime_events"."type" in ('thread.created', 'thread.updated', 'message.received', 'message.updated', 'message.deleted', 'channelConnection.updated', 'identity.linked', 'delivery.failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_channel_connections_external_account_unique" ON "messaging_channel_connections" USING btree ("provider","external_account_id") WHERE "messaging_channel_connections"."external_account_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_external_identities_connection_chat_unique" ON "messaging_external_identities" USING btree ("channel_connection_id","provider_chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_thread_identities_thread_identity_unique" ON "messaging_thread_identities" USING btree ("thread_id","external_identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_thread_identities_external_identity_unique" ON "messaging_thread_identities" USING btree ("external_identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_thread_identities_primary_thread_provider_unique" ON "messaging_thread_identities" USING btree ("thread_id","provider") WHERE "messaging_thread_identities"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_inbound_provider_dedupe_unique" ON "messages" USING btree ("channel_connection_id","external_identity_id","provider_message_id","direction") WHERE "messages"."provider_message_id" is not null and "messages"."external_identity_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_outbound_idempotency_unique" ON "messages" USING btree ("thread_id","idempotency_key") WHERE "messages"."direction" = 'outbound';--> statement-breakpoint
CREATE UNIQUE INDEX "message_media_ingestions_message_unique" ON "message_media_ingestions" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_delivery_attempts_message_attempt_unique" ON "message_delivery_attempts" USING btree ("message_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_realtime_events_event_id_unique" ON "messaging_realtime_events" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "messaging_channel_connections" ADD CONSTRAINT "messaging_channel_connections_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_external_identities" ADD CONSTRAINT "messaging_external_identities_linked_client_user_id_users_id_fk" FOREIGN KEY ("linked_client_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_external_identities" ADD CONSTRAINT "messaging_external_identities_connection_provider_fk" FOREIGN KEY ("channel_connection_id","provider") REFERENCES "public"."messaging_channel_connections"("id","provider") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_threads" ADD CONSTRAINT "messaging_threads_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_threads" ADD CONSTRAINT "messaging_threads_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_identities" ADD CONSTRAINT "messaging_thread_identities_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_identities" ADD CONSTRAINT "messaging_thread_identities_external_identity_provider_fk" FOREIGN KEY ("external_identity_id","provider") REFERENCES "public"."messaging_external_identities"("id","provider") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_connection_id_messaging_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."messaging_channel_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_external_identity_id_messaging_external_identities_id_fk" FOREIGN KEY ("external_identity_id") REFERENCES "public"."messaging_external_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_media_ingestions" ADD CONSTRAINT "message_media_ingestions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_media_ingestions" ADD CONSTRAINT "message_media_ingestions_channel_connection_id_messaging_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."messaging_channel_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_media_ingestions" ADD CONSTRAINT "message_media_ingestions_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_delivery_attempts" ADD CONSTRAINT "message_delivery_attempts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_instagram_graph_accounts" ADD CONSTRAINT "messaging_instagram_graph_accounts_channel_connection_id_messaging_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."messaging_channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_telegram_mtproto_sessions" ADD CONSTRAINT "messaging_telegram_mtproto_sessions_channel_connection_id_messaging_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."messaging_channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_realtime_events" ADD CONSTRAINT "messaging_realtime_events_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messaging_channel_connections_astrologer_provider_mode_status_idx" ON "messaging_channel_connections" USING btree ("astrologer_user_id","provider","mode","status");--> statement-breakpoint
CREATE INDEX "messaging_external_identities_linked_client_idx" ON "messaging_external_identities" USING btree ("linked_client_user_id");--> statement-breakpoint
CREATE INDEX "messaging_threads_astrologer_status_last_message_idx" ON "messaging_threads" USING btree ("astrologer_user_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "messaging_threads_astrologer_client_idx" ON "messaging_threads" USING btree ("astrologer_user_id","client_user_id");--> statement-breakpoint
CREATE INDEX "messages_thread_created_idx" ON "messages" USING btree ("thread_id","created_at","id");--> statement-breakpoint
CREATE INDEX "message_media_ingestions_status_retry_idx" ON "message_media_ingestions" USING btree ("download_status","next_retry_at","created_at");--> statement-breakpoint
CREATE INDEX "message_media_ingestions_message_idx" ON "message_media_ingestions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messaging_telegram_mtproto_sessions_login_state_idx" ON "messaging_telegram_mtproto_sessions" USING btree ("login_state");--> statement-breakpoint
CREATE INDEX "messaging_telegram_mtproto_sessions_lease_idx" ON "messaging_telegram_mtproto_sessions" USING btree ("leased_until","login_state");--> statement-breakpoint
CREATE INDEX "messaging_realtime_events_astrologer_event_id_idx" ON "messaging_realtime_events" USING btree ("astrologer_user_id","event_id");