ALTER TABLE "flow_runtime_commands" DROP CONSTRAINT "flow_runtime_commands_scope_check";--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "execution_token_id" uuid;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "node_activation_sequence" bigint;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "last_command_id" uuid;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "last_run_event_id" uuid;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_token_run_owner_fk" FOREIGN KEY ("execution_token_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_execution_tokens"("id","flow_run_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_last_command_run_owner_fk" FOREIGN KEY ("last_command_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_runtime_commands"("id","flow_run_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_last_run_event_run_owner_fk" FOREIGN KEY ("last_run_event_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_run_events"("id","flow_run_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_approvals_token_activation_unique" ON "flow_approvals" USING btree ("execution_token_id","node_activation_sequence");--> statement-breakpoint
CREATE INDEX "flow_approvals_pending_expiry_idx" ON "flow_approvals" USING btree ("status","expires_at","created_at","id");--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_revision_check" CHECK ("flow_approvals"."revision" > 0);--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_runtime_provenance_check" CHECK ((
        "flow_approvals"."execution_token_id" is null
        and "flow_approvals"."node_activation_sequence" is null
        and "flow_approvals"."expires_at" is null
        and "flow_approvals"."revision" = 1
        and "flow_approvals"."last_command_id" is null
        and "flow_approvals"."last_run_event_id" is null
      ) or (
        "flow_approvals"."execution_token_id" is not null
        and "flow_approvals"."node_activation_sequence" > 0
        and (
          ("flow_approvals"."revision" = 1
            and "flow_approvals"."status" = 'pending'
            and "flow_approvals"."last_command_id" is null
            and "flow_approvals"."last_run_event_id" is null)
          or ("flow_approvals"."revision" > 1
            and ("flow_approvals"."last_command_id" is null) <> ("flow_approvals"."last_run_event_id" is null))
        )
      ));--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_runtime_expiry_check" CHECK ("flow_approvals"."execution_token_id" is null or "flow_approvals"."expires_at" is null or "flow_approvals"."expires_at" >= "flow_approvals"."created_at");--> statement-breakpoint
ALTER TABLE "flow_runtime_commands" ADD CONSTRAINT "flow_runtime_commands_scope_check" CHECK ("flow_runtime_commands"."api_surface" = 'astrologer-api'
        and "flow_runtime_commands"."route_template" in ('/flow-runs/:runId/cancel', '/flow-approvals/:approvalId/decision', '/flow-work-items/:workItemId/start', '/flow-work-items/:workItemId/snooze', '/flow-work-items/:workItemId/complete')
        and "flow_runtime_commands"."command_scope" in ('flows.runtime.cancel.v1', 'flows.approvals.decide.v1', 'flows.work-items.start.v1', 'flows.work-items.snooze.v1', 'flows.work-items.complete.v1')
        and (
          ("flow_runtime_commands"."route_template" = '/flow-runs/:runId/cancel'
            and "flow_runtime_commands"."command_scope" = 'flows.runtime.cancel.v1'
            and "flow_runtime_commands"."flow_run_id" = "flow_runtime_commands"."resource_id")
          or ("flow_runtime_commands"."route_template" = '/flow-approvals/:approvalId/decision'
            and "flow_runtime_commands"."command_scope" = 'flows.approvals.decide.v1')
          or ("flow_runtime_commands"."route_template" = '/flow-work-items/:workItemId/start'
            and "flow_runtime_commands"."command_scope" = 'flows.work-items.start.v1')
          or ("flow_runtime_commands"."route_template" = '/flow-work-items/:workItemId/snooze'
            and "flow_runtime_commands"."command_scope" = 'flows.work-items.snooze.v1')
          or ("flow_runtime_commands"."route_template" = '/flow-work-items/:workItemId/complete'
            and "flow_runtime_commands"."command_scope" = 'flows.work-items.complete.v1')
        ));