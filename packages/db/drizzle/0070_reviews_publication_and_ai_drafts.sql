CREATE TABLE "review_publication_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"reviewable_instance_id" uuid NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"first_approved_version_id" uuid NOT NULL,
	"occurrence_key" varchar(180) NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"flow_enrollment_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_publication_events_review_unique" UNIQUE("review_id"),
	CONSTRAINT "review_publication_events_version_unique" UNIQUE("first_approved_version_id"),
	CONSTRAINT "review_publication_events_occurrence_key_check" CHECK (length(trim("review_publication_events"."occurrence_key")) between 1 and 180 and "review_publication_events"."occurrence_key" = trim("review_publication_events"."occurrence_key"))
);
--> statement-breakpoint
CREATE TABLE "review_ai_reply_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"ai_usage_attempt_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"prompt_id" varchar(160) NOT NULL,
	"prompt_version" integer NOT NULL,
	"prompt_input_digest" varchar(71) NOT NULL,
	"draft_text" text,
	"safe_error_code" varchar(120),
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_ai_reply_drafts_attempt_unique" UNIQUE("ai_usage_attempt_id"),
	CONSTRAINT "review_ai_reply_drafts_status_check" CHECK ("review_ai_reply_drafts"."status" in ('pending', 'succeeded', 'failed', 'superseded')),
	CONSTRAINT "review_ai_reply_drafts_prompt_version_check" CHECK ("review_ai_reply_drafts"."prompt_version" >= 1),
	CONSTRAINT "review_ai_reply_drafts_prompt_input_digest_check" CHECK ("review_ai_reply_drafts"."prompt_input_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "review_ai_reply_drafts_prompt_id_check" CHECK (length(trim("review_ai_reply_drafts"."prompt_id")) between 1 and 160 and "review_ai_reply_drafts"."prompt_id" = trim("review_ai_reply_drafts"."prompt_id")),
	CONSTRAINT "review_ai_reply_drafts_draft_text_check" CHECK ("review_ai_reply_drafts"."draft_text" is null or (length(trim("review_ai_reply_drafts"."draft_text")) between 1 and 4000 and "review_ai_reply_drafts"."draft_text" = trim("review_ai_reply_drafts"."draft_text") and "review_ai_reply_drafts"."draft_text" !~ '[[:cntrl:]]')),
	CONSTRAINT "review_ai_reply_drafts_completion_shape_check" CHECK (("review_ai_reply_drafts"."status" = 'pending' and "review_ai_reply_drafts"."completed_at" is null and "review_ai_reply_drafts"."draft_text" is null and "review_ai_reply_drafts"."safe_error_code" is null) or ("review_ai_reply_drafts"."status" = 'succeeded' and "review_ai_reply_drafts"."completed_at" is not null and "review_ai_reply_drafts"."draft_text" is not null and "review_ai_reply_drafts"."safe_error_code" is null) or ("review_ai_reply_drafts"."status" = 'failed' and "review_ai_reply_drafts"."completed_at" is not null and "review_ai_reply_drafts"."draft_text" is null and "review_ai_reply_drafts"."safe_error_code" is not null) or ("review_ai_reply_drafts"."status" = 'superseded' and "review_ai_reply_drafts"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "review_publication_events" ADD CONSTRAINT "review_publication_events_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_publication_events" ADD CONSTRAINT "review_publication_events_reviewable_instance_id_reviewable_instances_id_fk" FOREIGN KEY ("reviewable_instance_id") REFERENCES "public"."reviewable_instances"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_publication_events" ADD CONSTRAINT "review_publication_events_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_publication_events" ADD CONSTRAINT "review_publication_events_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_publication_events" ADD CONSTRAINT "review_publication_events_first_approved_version_id_review_versions_id_fk" FOREIGN KEY ("first_approved_version_id") REFERENCES "public"."review_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_ai_reply_drafts" ADD CONSTRAINT "review_ai_reply_drafts_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_ai_reply_drafts" ADD CONSTRAINT "review_ai_reply_drafts_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "review_publication_events_occurrence_unique" ON "review_publication_events" USING btree ("astrologer_user_id","occurrence_key");
--> statement-breakpoint
CREATE INDEX "review_publication_events_flow_pending_idx" ON "review_publication_events" USING btree ("published_at","id") WHERE "flow_enrollment_requested_at" is null;
--> statement-breakpoint
CREATE INDEX "review_ai_reply_drafts_review_created_idx" ON "review_ai_reply_drafts" USING btree ("review_id","created_at");
--> statement-breakpoint
CREATE INDEX "review_ai_reply_drafts_pending_idx" ON "review_ai_reply_drafts" USING btree ("requested_at","id") WHERE "status" = 'pending';
