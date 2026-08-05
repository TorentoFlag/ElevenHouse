CREATE TABLE "flow_automation_quota_authorities" (
	"owner_subject_id" uuid PRIMARY KEY NOT NULL,
	"active_allocations" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_automation_quota_authorities_shape_check" CHECK ("flow_automation_quota_authorities"."active_allocations" >= 0
        and "flow_automation_quota_authorities"."revision" > 0
        and "flow_automation_quota_authorities"."updated_at" >= "flow_automation_quota_authorities"."created_at")
);
--> statement-breakpoint
ALTER TABLE "flow_enrollment_commands" ADD COLUMN "request_schema_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "flow_enrollment_commands" ADD COLUMN "target_version_id" uuid;--> statement-breakpoint
ALTER TABLE "flow_enrollment_commands" ADD COLUMN "expected_definition_revision" integer;--> statement-breakpoint
ALTER TABLE "flow_enrollment_commands" ADD COLUMN "expected_enrollment_revision" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "flow_enrollment_commands" ADD COLUMN "expected_active_version_id" uuid;--> statement-breakpoint
ALTER TABLE "flow_enrollment_commands" ADD COLUMN "expected_activation_epoch_id" uuid;--> statement-breakpoint
ALTER TABLE "flow_enrollment_controls" ADD COLUMN "owner_subject_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "flow_automation_quota_authorities" ADD CONSTRAINT "flow_automation_quota_authorities_owner_subject_fk" FOREIGN KEY ("owner_subject_id") REFERENCES "public"."flow_runtime_owner_subjects"("owner_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flow_automation_quota_authorities_updated_idx" ON "flow_automation_quota_authorities" USING btree ("updated_at","owner_subject_id");--> statement-breakpoint
ALTER TABLE "flow_enrollment_controls" ADD CONSTRAINT "flow_enrollment_controls_owner_subject_fk" FOREIGN KEY ("owner_subject_id") REFERENCES "public"."flow_runtime_owner_subjects"("owner_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollment_commands" ADD CONSTRAINT "flow_enrollment_commands_request_shape_check" CHECK (("flow_enrollment_commands"."command_scope" = 'flows.enrollment.activate.v1'
          and "flow_enrollment_commands"."request_schema_version" = 'flow-activation-command.v1'
          and "flow_enrollment_commands"."target_version_id" is not null
          and "flow_enrollment_commands"."expected_definition_revision" > 0
          and "flow_enrollment_commands"."expected_enrollment_revision" >= 0
          and "flow_enrollment_commands"."expected_activation_epoch_id" is null)
        or ("flow_enrollment_commands"."command_scope" = 'flows.enrollment.pause.v1'
          and "flow_enrollment_commands"."request_schema_version" = 'flow-enrollment-pause-command.v1'
          and "flow_enrollment_commands"."target_version_id" is null
          and "flow_enrollment_commands"."expected_definition_revision" is null
          and "flow_enrollment_commands"."expected_enrollment_revision" >= 0
          and "flow_enrollment_commands"."expected_active_version_id" is not null
          and "flow_enrollment_commands"."expected_activation_epoch_id" is not null));