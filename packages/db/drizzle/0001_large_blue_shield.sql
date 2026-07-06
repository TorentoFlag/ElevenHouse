CREATE TABLE "calculation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"module" text NOT NULL,
	"mode" text NOT NULL,
	"method_code" text NOT NULL,
	"current_method_version" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'calculated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_records_module_check" CHECK ("calculation_records"."module" in ('numerology', 'chart', 'matrix', 'human_design')),
	CONSTRAINT "calculation_records_mode_check" CHECK ("calculation_records"."mode" in ('individual', 'compatibility')),
	CONSTRAINT "calculation_records_status_check" CHECK ("calculation_records"."status" in ('calculated', 'linked', 'published', 'archived'))
);--> statement-breakpoint
CREATE TABLE "calculation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"source" text NOT NULL,
	"client_id" uuid,
	"display_name" text NOT NULL,
	"birth_date" text,
	"input_snapshot" jsonb NOT NULL,
	"manually_overridden" boolean DEFAULT false NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_participants_role_check" CHECK ("calculation_participants"."role" in ('subject', 'partner')),
	CONSTRAINT "calculation_participants_source_check" CHECK ("calculation_participants"."source" in ('crm_client', 'manual'))
);--> statement-breakpoint
CREATE TABLE "calculation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"method_version" text NOT NULL,
	"settings_snapshot" jsonb NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"result_snapshot" jsonb NOT NULL,
	"result_summary" jsonb NOT NULL,
	"result_checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_versions_version_number_check" CHECK ("calculation_versions"."version_number" > 0)
);--> statement-breakpoint
CREATE TABLE "calculation_client_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"visibility" text DEFAULT 'private_to_astrologer' NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_client_links_visibility_check" CHECK ("calculation_client_links"."visibility" in ('private_to_astrologer', 'visible_to_client')),
	CONSTRAINT "calculation_client_links_published_at_check" CHECK ("calculation_client_links"."visibility" <> 'visible_to_client' or "calculation_client_links"."published_at" is not null)
);--> statement-breakpoint
CREATE TABLE "calculation_interpretations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"text" text NOT NULL,
	"model_id" text,
	"prompt_version" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_interpretations_source_check" CHECK ("calculation_interpretations"."source" in ('ai', 'manual')),
	CONSTRAINT "calculation_interpretations_status_check" CHECK ("calculation_interpretations"."status" in ('draft', 'approved')),
	CONSTRAINT "calculation_interpretations_approved_at_check" CHECK ("calculation_interpretations"."status" <> 'approved' or "calculation_interpretations"."approved_at" is not null)
);--> statement-breakpoint
CREATE TABLE "calculation_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"artifact_type" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_artifacts_type_check" CHECK ("calculation_artifacts"."artifact_type" in ('pdf')),
	CONSTRAINT "calculation_artifacts_status_check" CHECK ("calculation_artifacts"."status" in ('generating', 'ready', 'failed'))
);--> statement-breakpoint
ALTER TABLE "calculation_records" ADD CONSTRAINT "calculation_records_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_participants" ADD CONSTRAINT "calculation_participants_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_versions" ADD CONSTRAINT "calculation_versions_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_versions" ADD CONSTRAINT "calculation_versions_identity_unique" UNIQUE("id","calculation_id");--> statement-breakpoint
ALTER TABLE "calculation_client_links" ADD CONSTRAINT "calculation_client_links_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_interpretations" ADD CONSTRAINT "calculation_interpretations_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_interpretations" ADD CONSTRAINT "calculation_interpretations_version_calculation_fk" FOREIGN KEY ("version_id","calculation_id") REFERENCES "public"."calculation_versions"("id","calculation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_artifacts" ADD CONSTRAINT "calculation_artifacts_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_artifacts" ADD CONSTRAINT "calculation_artifacts_version_calculation_fk" FOREIGN KEY ("version_id","calculation_id") REFERENCES "public"."calculation_versions"("id","calculation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_artifacts" ADD CONSTRAINT "calculation_artifacts_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calculation_records_owner_updated_id_idx" ON "calculation_records" USING btree ("owner_user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "calculation_records_owner_status_updated_id_idx" ON "calculation_records" USING btree ("owner_user_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "calculation_records_owner_module_created_id_idx" ON "calculation_records" USING btree ("owner_user_id","module","created_at","id");--> statement-breakpoint
CREATE INDEX "calculation_records_owner_status_module_created_id_idx" ON "calculation_records" USING btree ("owner_user_id","status","module","created_at","id");--> statement-breakpoint
CREATE INDEX "calculation_participants_record_order_idx" ON "calculation_participants" USING btree ("calculation_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "calculation_versions_record_version_unique" ON "calculation_versions" USING btree ("calculation_id","version_number");--> statement-breakpoint
CREATE INDEX "calculation_versions_record_version_idx" ON "calculation_versions" USING btree ("calculation_id","version_number");--> statement-breakpoint
CREATE INDEX "calculation_versions_record_id_idx" ON "calculation_versions" USING btree ("calculation_id","id");--> statement-breakpoint
CREATE INDEX "calculation_client_links_record_idx" ON "calculation_client_links" USING btree ("calculation_id");--> statement-breakpoint
CREATE INDEX "calculation_client_links_client_idx" ON "calculation_client_links" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calculation_client_links_record_client_unique" ON "calculation_client_links" USING btree ("calculation_id","client_id");--> statement-breakpoint
CREATE INDEX "calculation_interpretations_record_idx" ON "calculation_interpretations" USING btree ("calculation_id");--> statement-breakpoint
CREATE INDEX "calculation_interpretations_version_idx" ON "calculation_interpretations" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "calculation_artifacts_record_idx" ON "calculation_artifacts" USING btree ("calculation_id");--> statement-breakpoint
CREATE INDEX "calculation_artifacts_version_idx" ON "calculation_artifacts" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "calculation_artifacts_media_idx" ON "calculation_artifacts" USING btree ("media_asset_id");
