CREATE TABLE "reviewable_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'not_yet_received' NOT NULL,
	"window_policy" text NOT NULL,
	"source_resource_key" varchar(180) NOT NULL,
	"product_id" uuid,
	"order_id" uuid,
	"booking_id" uuid,
	"title_snapshot" text NOT NULL,
	"context_label_snapshot" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"review_window_closes_at" timestamp with time zone NOT NULL,
	"blocked_reason_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewable_instances_relationship_identity_unique" UNIQUE("relationship_id","client_user_id","astrologer_user_id"),
	CONSTRAINT "reviewable_instances_kind_check" CHECK ("reviewable_instances"."kind" in ('booking', 'astro_diary_period', 'astro_calendar_service_period', 'async_delivery', 'instant_delivery', 'mini_delivery', 'course_access', 'course_completion', 'pack_session', 'pack', 'subscription_period', 'group_participation', 'gift_redemption', 'custom_fulfillment')),
	CONSTRAINT "reviewable_instances_status_check" CHECK ("reviewable_instances"."status" in ('not_yet_received', 'reviewable', 'window_closed', 'blocked', 'review_submitted')),
	CONSTRAINT "reviewable_instances_window_policy_check" CHECK ("reviewable_instances"."window_policy" in ('standard_14_days_after_receipt', 'active_period_plus_14_days')),
	CONSTRAINT "reviewable_instances_window_range_check" CHECK ("reviewable_instances"."received_at" < "reviewable_instances"."review_window_closes_at"),
	CONSTRAINT "reviewable_instances_title_check" CHECK (length(trim("reviewable_instances"."title_snapshot")) between 1 and 240 and "reviewable_instances"."title_snapshot" = trim("reviewable_instances"."title_snapshot") and "reviewable_instances"."title_snapshot" !~ '[[:cntrl:]]'),
	CONSTRAINT "reviewable_instances_context_label_check" CHECK (length(trim("reviewable_instances"."context_label_snapshot")) between 1 and 240 and "reviewable_instances"."context_label_snapshot" = trim("reviewable_instances"."context_label_snapshot") and "reviewable_instances"."context_label_snapshot" !~ '[[:cntrl:]]'),
	CONSTRAINT "reviewable_instances_source_resource_key_check" CHECK (length(trim("reviewable_instances"."source_resource_key")) between 1 and 180 and "reviewable_instances"."source_resource_key" = trim("reviewable_instances"."source_resource_key")),
	CONSTRAINT "reviewable_instances_block_reason_check" CHECK (("reviewable_instances"."status" = 'blocked' and "reviewable_instances"."blocked_reason_code" is not null) or ("reviewable_instances"."status" <> 'blocked' and "reviewable_instances"."blocked_reason_code" is null))
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reviewable_instance_id" uuid NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"public_identity_mode" text NOT NULL,
	"visibility_status" text DEFAULT 'not_public' NOT NULL,
	"dispute_status" text DEFAULT 'none' NOT NULL,
	"active_public_version_id" uuid,
	"pending_version_id" uuid,
	"active_public_reply_version_id" uuid,
	"pending_reply_version_id" uuid,
	"first_published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_reviewable_instance_unique" UNIQUE("reviewable_instance_id"),
	CONSTRAINT "reviews_public_identity_mode_check" CHECK ("reviews"."public_identity_mode" in ('named', 'secret_user')),
	CONSTRAINT "reviews_visibility_status_check" CHECK ("reviews"."visibility_status" in ('not_public', 'visible', 'temporarily_hidden_by_dispute', 'hidden_by_moderation')),
	CONSTRAINT "reviews_dispute_status_check" CHECK ("reviews"."dispute_status" in ('none', 'open', 'under_review', 'waiting_client', 'waiting_astrologer', 'resolved_closed')),
	CONSTRAINT "reviews_visible_version_check" CHECK (("reviews"."visibility_status" = 'visible' and "reviews"."active_public_version_id" is not null and "reviews"."first_published_at" is not null) or "reviews"."visibility_status" <> 'visible'),
	CONSTRAINT "reviews_dispute_hide_check" CHECK (("reviews"."dispute_status" in ('open', 'under_review', 'waiting_client', 'waiting_astrologer') and "reviews"."visibility_status" = 'temporarily_hidden_by_dispute') or "reviews"."dispute_status" in ('none', 'resolved_closed'))
);
--> statement-breakpoint
CREATE TABLE "review_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"rating" integer NOT NULL,
	"text" text NOT NULL,
	"public_identity_mode" text NOT NULL,
	"moderation_status" text DEFAULT 'pending' NOT NULL,
	"moderation_reason_code" text,
	"moderation_note" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_versions_review_number_unique" UNIQUE("review_id","version_number"),
	CONSTRAINT "review_versions_version_number_check" CHECK ("review_versions"."version_number" >= 1),
	CONSTRAINT "review_versions_rating_check" CHECK ("review_versions"."rating" between 1 and 5),
	CONSTRAINT "review_versions_text_check" CHECK (length(trim("review_versions"."text")) between 1 and 4000 and "review_versions"."text" = trim("review_versions"."text") and "review_versions"."text" !~ '[[:cntrl:]]'),
	CONSTRAINT "review_versions_public_identity_mode_check" CHECK ("review_versions"."public_identity_mode" in ('named', 'secret_user')),
	CONSTRAINT "review_versions_moderation_status_check" CHECK ("review_versions"."moderation_status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "review_versions_moderation_reason_check" CHECK ("review_versions"."moderation_reason_code" is null or "review_versions"."moderation_reason_code" in ('spam', 'abuse_or_hate', 'personal_data_exposure', 'off_topic', 'not_service_related', 'fraud_or_conflict', 'duplicate', 'legal_risk', 'other')),
	CONSTRAINT "review_versions_decision_shape_check" CHECK (("review_versions"."moderation_status" = 'pending' and "review_versions"."decided_at" is null and "review_versions"."decided_by_user_id" is null and "review_versions"."moderation_reason_code" is null) or ("review_versions"."moderation_status" = 'approved' and "review_versions"."decided_at" is not null and "review_versions"."decided_by_user_id" is not null and "review_versions"."moderation_reason_code" is null) or ("review_versions"."moderation_status" = 'rejected' and "review_versions"."decided_at" is not null and "review_versions"."decided_by_user_id" is not null and "review_versions"."moderation_reason_code" is not null)),
	CONSTRAINT "review_versions_moderation_note_check" CHECK ("review_versions"."moderation_note" is null or (length(trim("review_versions"."moderation_note")) <= 2000 and "review_versions"."moderation_note" !~ '[[:cntrl:]]'))
);
--> statement-breakpoint
CREATE TABLE "review_reply_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"text" text NOT NULL,
	"moderation_status" text DEFAULT 'pending' NOT NULL,
	"moderation_reason_code" text,
	"moderation_note" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_reply_versions_review_number_unique" UNIQUE("review_id","version_number"),
	CONSTRAINT "review_reply_versions_version_number_check" CHECK ("review_reply_versions"."version_number" >= 1),
	CONSTRAINT "review_reply_versions_text_check" CHECK (length(trim("review_reply_versions"."text")) between 1 and 4000 and "review_reply_versions"."text" = trim("review_reply_versions"."text") and "review_reply_versions"."text" !~ '[[:cntrl:]]'),
	CONSTRAINT "review_reply_versions_moderation_status_check" CHECK ("review_reply_versions"."moderation_status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "review_reply_versions_moderation_reason_check" CHECK ("review_reply_versions"."moderation_reason_code" is null or "review_reply_versions"."moderation_reason_code" in ('spam', 'abuse_or_hate', 'personal_data_exposure', 'off_topic', 'not_service_related', 'fraud_or_conflict', 'duplicate', 'legal_risk', 'other')),
	CONSTRAINT "review_reply_versions_decision_shape_check" CHECK (("review_reply_versions"."moderation_status" = 'pending' and "review_reply_versions"."decided_at" is null and "review_reply_versions"."decided_by_user_id" is null and "review_reply_versions"."moderation_reason_code" is null) or ("review_reply_versions"."moderation_status" = 'approved' and "review_reply_versions"."decided_at" is not null and "review_reply_versions"."decided_by_user_id" is not null and "review_reply_versions"."moderation_reason_code" is null) or ("review_reply_versions"."moderation_status" = 'rejected' and "review_reply_versions"."decided_at" is not null and "review_reply_versions"."decided_by_user_id" is not null and "review_reply_versions"."moderation_reason_code" is not null))
);
--> statement-breakpoint
CREATE TABLE "review_moderation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reason_code" text NOT NULL,
	"opened_by_user_id" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	CONSTRAINT "review_moderation_cases_status_check" CHECK ("review_moderation_cases"."status" in ('open', 'waiting_client', 'waiting_astrologer', 'consensus_reached', 'closed')),
	CONSTRAINT "review_moderation_cases_reason_check" CHECK ("review_moderation_cases"."reason_code" in ('spam', 'abuse_or_hate', 'personal_data_exposure', 'off_topic', 'not_service_related', 'fraud_or_conflict', 'duplicate', 'legal_risk', 'other')),
	CONSTRAINT "review_moderation_cases_close_shape_check" CHECK (("review_moderation_cases"."status" = 'closed' and "review_moderation_cases"."closed_at" is not null and "review_moderation_cases"."closed_by_user_id" is not null) or ("review_moderation_cases"."status" <> 'closed' and "review_moderation_cases"."closed_at" is null and "review_moderation_cases"."closed_by_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "review_moderation_case_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_role" text NOT NULL,
	"visibility" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_moderation_case_messages_author_role_check" CHECK ("review_moderation_case_messages"."author_role" in ('moderator', 'client', 'astrologer', 'system')),
	CONSTRAINT "review_moderation_case_messages_visibility_check" CHECK ("review_moderation_case_messages"."visibility" in ('all_case_participants', 'client_and_moderators', 'astrologer_and_moderators', 'moderators_only')),
	CONSTRAINT "review_moderation_case_messages_visibility_author_check" CHECK (("review_moderation_case_messages"."author_role" = 'moderator') or ("review_moderation_case_messages"."author_role" = 'client' and "review_moderation_case_messages"."visibility" in ('all_case_participants', 'client_and_moderators')) or ("review_moderation_case_messages"."author_role" = 'astrologer' and "review_moderation_case_messages"."visibility" in ('all_case_participants', 'astrologer_and_moderators')) or ("review_moderation_case_messages"."author_role" = 'system' and "review_moderation_case_messages"."visibility" in ('all_case_participants', 'moderators_only'))),
	CONSTRAINT "review_moderation_case_messages_body_check" CHECK (length(trim("review_moderation_case_messages"."body")) between 1 and 4000 and "review_moderation_case_messages"."body" = trim("review_moderation_case_messages"."body") and "review_moderation_case_messages"."body" !~ '[[:cntrl:]]')
);
--> statement-breakpoint
CREATE TABLE "review_rating_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"product_id" uuid,
	"visible_review_count" integer DEFAULT 0 NOT NULL,
	"approved_review_count" integer DEFAULT 0 NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"last_published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_rating_aggregates_scope_check" CHECK ("review_rating_aggregates"."scope" in ('astrologer', 'product')),
	CONSTRAINT "review_rating_aggregates_scope_shape_check" CHECK (("review_rating_aggregates"."scope" = 'astrologer' and "review_rating_aggregates"."product_id" is null) or ("review_rating_aggregates"."scope" = 'product' and "review_rating_aggregates"."product_id" is not null)),
	CONSTRAINT "review_rating_aggregates_counts_check" CHECK ("review_rating_aggregates"."visible_review_count" >= 0 and "review_rating_aggregates"."approved_review_count" >= "review_rating_aggregates"."visible_review_count" and "review_rating_aggregates"."rating_sum" >= 0 and "review_rating_aggregates"."rating_sum" <= "review_rating_aggregates"."approved_review_count" * 5)
);
--> statement-breakpoint
ALTER TABLE "reviewable_instances" ADD CONSTRAINT "reviewable_instances_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviewable_instances" ADD CONSTRAINT "reviewable_instances_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviewable_instances" ADD CONSTRAINT "reviewable_instances_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviewable_instances" ADD CONSTRAINT "reviewable_instances_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviewable_instances" ADD CONSTRAINT "reviewable_instances_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviewable_instances" ADD CONSTRAINT "reviewable_instances_relationship_fk" FOREIGN KEY ("relationship_id","client_user_id","astrologer_user_id") REFERENCES "public"."client_astrologer_relationships"("id","client_user_id","astrologer_user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewable_instance_id_reviewable_instances_id_fk" FOREIGN KEY ("reviewable_instance_id") REFERENCES "public"."reviewable_instances"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_versions" ADD CONSTRAINT "review_versions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_versions" ADD CONSTRAINT "review_versions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_reply_versions" ADD CONSTRAINT "review_reply_versions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_reply_versions" ADD CONSTRAINT "review_reply_versions_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_reply_versions" ADD CONSTRAINT "review_reply_versions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_moderation_cases" ADD CONSTRAINT "review_moderation_cases_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_moderation_cases" ADD CONSTRAINT "review_moderation_cases_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_moderation_cases" ADD CONSTRAINT "review_moderation_cases_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_moderation_case_messages" ADD CONSTRAINT "review_moderation_case_messages_case_id_review_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."review_moderation_cases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_moderation_case_messages" ADD CONSTRAINT "review_moderation_case_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_rating_aggregates" ADD CONSTRAINT "review_rating_aggregates_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_rating_aggregates" ADD CONSTRAINT "review_rating_aggregates_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "reviewable_instances_source_unique" ON "reviewable_instances" USING btree ("astrologer_user_id","client_user_id","kind","source_resource_key");
--> statement-breakpoint
CREATE INDEX "reviewable_instances_client_status_window_idx" ON "reviewable_instances" USING btree ("client_user_id","status","review_window_closes_at");
--> statement-breakpoint
CREATE INDEX "reviewable_instances_astrologer_kind_received_idx" ON "reviewable_instances" USING btree ("astrologer_user_id","kind","received_at");
--> statement-breakpoint
CREATE INDEX "reviews_astrologer_visibility_published_idx" ON "reviews" USING btree ("astrologer_user_id","visibility_status","first_published_at");
--> statement-breakpoint
CREATE INDEX "reviews_client_created_idx" ON "reviews" USING btree ("client_user_id","created_at");
--> statement-breakpoint
CREATE INDEX "review_versions_review_status_submitted_idx" ON "review_versions" USING btree ("review_id","moderation_status","submitted_at");
--> statement-breakpoint
CREATE INDEX "review_reply_versions_review_status_submitted_idx" ON "review_reply_versions" USING btree ("review_id","moderation_status","submitted_at");
--> statement-breakpoint
CREATE INDEX "review_moderation_cases_status_opened_idx" ON "review_moderation_cases" USING btree ("status","opened_at");
--> statement-breakpoint
CREATE INDEX "review_moderation_cases_review_idx" ON "review_moderation_cases" USING btree ("review_id");
--> statement-breakpoint
CREATE INDEX "review_moderation_case_messages_case_created_idx" ON "review_moderation_case_messages" USING btree ("case_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "review_rating_aggregates_astrologer_unique" ON "review_rating_aggregates" USING btree ("astrologer_user_id") WHERE "scope" = 'astrologer' and "product_id" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "review_rating_aggregates_product_unique" ON "review_rating_aggregates" USING btree ("astrologer_user_id","product_id") WHERE "scope" = 'product' and "product_id" is not null;
