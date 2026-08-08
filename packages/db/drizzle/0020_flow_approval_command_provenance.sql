CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_run_event_command()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_run_event_command_guard$
DECLARE
  command_row flow_runtime_commands%ROWTYPE;
  lifecycle_event_row booking_lifecycle_events%ROWTYPE;
BEGIN
  IF NEW.booking_lifecycle_event_id IS NOT NULL THEN
    SELECT * INTO lifecycle_event_row FROM booking_lifecycle_events WHERE id = NEW.booking_lifecycle_event_id;
    IF NOT FOUND OR NEW.command_id IS NOT NULL OR lifecycle_event_row.owner_user_id IS DISTINCT FROM NEW.owner_user_id
       OR NOT EXISTS (
         SELECT 1 FROM flow_runs run JOIN flow_runtime_events runtime_event
           ON runtime_event.id = run.runtime_event_id AND runtime_event.owner_user_id = run.owner_user_id
          WHERE run.id = NEW.flow_run_id AND run.owner_user_id = NEW.owner_user_id
            AND runtime_event.source = 'booking' AND runtime_event.subject_type = 'booking'
            AND runtime_event.subject_id = lifecycle_event_row.booking_id::text
       ) THEN
      RAISE EXCEPTION 'system run event requires its canonical Booking lifecycle event'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
    END IF;
    IF NEW.event_type = 'run_canceled' THEN
      IF NEW.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_BOOKING_CANCELED'
         OR lifecycle_event_row.event_kind IS DISTINCT FROM 'cancelled'
         OR (NEW.attempt_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM flow_execution_attempts attempt WHERE attempt.id = NEW.attempt_id
             AND attempt.owner_user_id = NEW.owner_user_id AND attempt.flow_run_id = NEW.flow_run_id
             AND attempt.node_id = NEW.node_id AND attempt.outcome = 'canceled'
             AND attempt.result_code = 'FLOW_RUN_CANCELED'
             AND attempt.trace_summary->>'reasonCode' = 'FLOW_BOOKING_CANCELED'
         )) THEN
        RAISE EXCEPTION 'system cancellation event requires its canonical Booking lifecycle event'
          USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
      END IF;
    ELSIF NEW.event_type = 'booking_rescheduled' THEN
      IF NEW.attempt_id IS NOT NULL OR lifecycle_event_row.event_kind IS DISTINCT FROM 'rescheduled'
         OR NEW.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_BOOKING_RESCHEDULED'
         OR NEW.summary->>'resultCode' IS DISTINCT FROM 'FLOW_BOOKING_SCHEDULE_UPDATED'
         OR NEW.summary->>'bookingId' IS DISTINCT FROM lifecycle_event_row.booking_id::text
         OR (NEW.summary->>'bookingLifecycleRevision')::integer IS DISTINCT FROM lifecycle_event_row.revision
         OR (NEW.summary->>'previousStartAt')::timestamptz IS DISTINCT FROM lifecycle_event_row.before_start_at
         OR (NEW.summary->>'previousEndAt')::timestamptz IS DISTINCT FROM lifecycle_event_row.before_end_at
         OR NEW.summary->>'previousTimeZone' IS DISTINCT FROM lifecycle_event_row.before_time_zone
         OR (NEW.summary->>'currentStartAt')::timestamptz IS DISTINCT FROM lifecycle_event_row.after_start_at
         OR (NEW.summary->>'currentEndAt')::timestamptz IS DISTINCT FROM lifecycle_event_row.after_end_at
         OR NEW.summary->>'currentTimeZone' IS DISTINCT FROM lifecycle_event_row.after_time_zone
         OR NOT EXISTS (
           SELECT 1 FROM flow_execution_tokens token WHERE token.flow_run_id = NEW.flow_run_id
             AND token.owner_user_id = NEW.owner_user_id AND token.node_id = NEW.node_id
             AND token.node_kind = NEW.summary->>'nodeKind'
         ) THEN
        RAISE EXCEPTION 'schedule adjustment event requires its canonical Booking reschedule'
          USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
      END IF;
    ELSE
      RAISE EXCEPTION 'Booking lifecycle provenance is not supported for this run event'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
    END IF;
    RETURN NULL;
  END IF;

  IF NEW.command_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO command_row FROM flow_runtime_commands WHERE id = NEW.command_id;

  IF NEW.event_type = 'run_canceled' AND (
    NOT FOUND OR command_row.api_surface <> 'astrologer-api' OR command_row.owner_user_id <> NEW.owner_user_id
    OR command_row.flow_run_id <> NEW.flow_run_id OR command_row.route_template <> '/flow-runs/:runId/cancel'
    OR command_row.resource_id <> NEW.flow_run_id OR command_row.command_scope <> 'flows.runtime.cancel.v1'
    OR command_row.state <> 'succeeded'
  ) THEN
    RAISE EXCEPTION 'cancellation event requires a succeeded runtime command'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
  END IF;

  IF NEW.event_type = 'token_advanced' AND NEW.summary->>'reasonCode' = 'FLOW_WORK_ITEM_COMPLETED' AND (
    NOT FOUND OR command_row.api_surface <> 'astrologer-api' OR command_row.owner_user_id <> NEW.owner_user_id
    OR command_row.flow_run_id <> NEW.flow_run_id OR command_row.route_template <> '/flow-work-items/:workItemId/complete'
    OR command_row.command_scope <> 'flows.work-items.complete.v1' OR command_row.state <> 'succeeded'
    OR NOT EXISTS (
      SELECT 1 FROM flow_work_items WHERE id = command_row.resource_id AND owner_user_id = NEW.owner_user_id
        AND flow_run_id = NEW.flow_run_id AND node_id = NEW.node_id AND last_command_id = command_row.id
        AND status = 'completed'
    )
  ) THEN
    RAISE EXCEPTION 'work-item completion event requires its succeeded runtime command'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
  END IF;

  IF NEW.event_type = 'token_advanced' AND NEW.summary->>'reasonCode' = 'FLOW_APPROVAL_DECIDED' AND (
    NOT FOUND OR command_row.api_surface <> 'astrologer-api' OR command_row.owner_user_id <> NEW.owner_user_id
    OR command_row.flow_run_id <> NEW.flow_run_id OR command_row.route_template <> '/flow-approvals/:approvalId/decision'
    OR command_row.command_scope <> 'flows.approvals.decide.v1' OR command_row.state <> 'succeeded'
    OR NEW.summary->>'nodeKind' <> 'astrologer_approval'
    OR NEW.summary->>'sourceHandle' NOT IN ('approved', 'rejected')
    OR NOT EXISTS (
      SELECT 1 FROM flow_approvals WHERE id = command_row.resource_id AND owner_user_id = NEW.owner_user_id
        AND flow_run_id = NEW.flow_run_id AND execution_token_id IS NOT NULL
        AND last_run_event_id = NEW.id AND status = NEW.summary->>'sourceHandle'
    )
  ) THEN
    RAISE EXCEPTION 'approval decision event requires its succeeded runtime command'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
  END IF;

  IF NEW.event_type NOT IN ('run_canceled', 'token_advanced')
     OR (NEW.event_type = 'token_advanced' AND NEW.summary->>'reasonCode' NOT IN ('FLOW_WORK_ITEM_COMPLETED', 'FLOW_APPROVAL_DECIDED')) THEN
    RAISE EXCEPTION 'flow run event has an unsupported command provenance'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
  END IF;
  RETURN NULL;
END;
$flow_run_event_command_guard$;
