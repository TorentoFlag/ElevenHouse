CREATE TABLE "verification_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewer_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_applications_status_check" CHECK ("verification_applications"."status" in ('pending', 'approved', 'rejected', 'revoked')),
	CONSTRAINT "verification_applications_rejection_reason_check" CHECK ("verification_applications"."status" <> 'rejected' or length(trim("verification_applications"."rejection_reason")) > 0),
	CONSTRAINT "verification_applications_reviewed_at_check" CHECK ("verification_applications"."status" = 'pending' or "verification_applications"."reviewed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "verification_application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"media_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_application_documents_kind_check" CHECK ("verification_application_documents"."kind" in ('identity', 'qualification'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "verification_application_documents_application_media_unique" ON "verification_application_documents" USING btree ("application_id","media_id");--> statement-breakpoint
ALTER TABLE "verification_applications" ADD CONSTRAINT "verification_applications_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_applications" ADD CONSTRAINT "verification_applications_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_application_documents" ADD CONSTRAINT "verification_application_documents_application_id_verification_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."verification_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_application_documents" ADD CONSTRAINT "verification_application_documents_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_applications_owner_submitted_idx" ON "verification_applications" USING btree ("owner_user_id","submitted_at","id");--> statement-breakpoint
CREATE INDEX "verification_applications_status_submitted_idx" ON "verification_applications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "verification_application_documents_application_idx" ON "verification_application_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "verification_application_documents_media_idx" ON "verification_application_documents" USING btree ("media_id");