CREATE TABLE "audit_log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_log_entries_action_check" CHECK (length(trim("audit_log_entries"."action")) between 1 and 160),
	CONSTRAINT "audit_log_entries_target_type_check" CHECK (length(trim("audit_log_entries"."target_type")) between 1 and 120),
	CONSTRAINT "audit_log_entries_target_id_check" CHECK (length(trim("audit_log_entries"."target_id")) between 1 and 200),
	CONSTRAINT "audit_log_entries_metadata_check" CHECK (jsonb_typeof("audit_log_entries"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "audit_actor_subjects" (
	"actor_subject_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"service_key" varchar(180),
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"erased_at" timestamp with time zone,
	CONSTRAINT "audit_actor_subjects_shape_check" CHECK ((
          "audit_actor_subjects"."state" = 'active'
          and "audit_actor_subjects"."erased_at" is null
          and (
            ("audit_actor_subjects"."kind" = 'user' and "audit_actor_subjects"."user_id" is not null and "audit_actor_subjects"."service_key" is null)
            or ("audit_actor_subjects"."kind" = 'service' and "audit_actor_subjects"."user_id" is null
              and length(trim("audit_actor_subjects"."service_key")) between 1 and 180
              and "audit_actor_subjects"."service_key" = trim("audit_actor_subjects"."service_key")
              and "audit_actor_subjects"."service_key" ~ '^[A-Za-z0-9._:-]+$')
          )
        ) or (
          "audit_actor_subjects"."state" = 'erased'
          and "audit_actor_subjects"."user_id" is null
          and "audit_actor_subjects"."service_key" is null
          and "audit_actor_subjects"."erased_at" is not null
          and "audit_actor_subjects"."erased_at" >= "audit_actor_subjects"."created_at"
        ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "audit_actor_subjects_user_unique" ON "audit_actor_subjects" USING btree ("user_id") WHERE "audit_actor_subjects"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_actor_subjects_service_unique" ON "audit_actor_subjects" USING btree ("service_key") WHERE "audit_actor_subjects"."service_key" is not null;--> statement-breakpoint
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_actor_subjects" ADD CONSTRAINT "audit_actor_subjects_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entries_actor_user_id_index" ON "audit_log_entries" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_entries_action_index" ON "audit_log_entries" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_entries_target_index" ON "audit_log_entries" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_entries_occurred_at_index" ON "audit_log_entries" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_actor_subjects_state_created_idx" ON "audit_actor_subjects" USING btree ("state","created_at","actor_subject_id");