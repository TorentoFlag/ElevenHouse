ALTER TABLE "flow_run_events" DROP CONSTRAINT "flow_run_events_summary_schema_check";--> statement-breakpoint
ALTER TABLE "flow_runtime_events" DROP CONSTRAINT "flow_runtime_events_normalized_shape_check";--> statement-breakpoint
ALTER TABLE "flow_run_events" ADD CONSTRAINT "flow_run_events_summary_schema_check" CHECK ((
        "flow_run_events"."event_type" = 'run_enrolled'
        and "flow_run_events"."node_id" is not null
        and "flow_run_events"."attempt_id" is null
        and "flow_run_events"."command_id" is null
        and "flow_run_events"."summary" ?& array[
          'schemaVersion', 'outcome', 'reasonCode', 'resultCode', 'eventKind',
          'activationEpochId', 'triggerNodeId', 'targetNodeId', 'targetNodeKind',
          'enrollmentPolicyKey', 'occurrenceKey'
        ]::text[]
        and "flow_run_events"."summary" - array[
          'schemaVersion', 'outcome', 'reasonCode', 'resultCode', 'eventKind',
          'activationEpochId', 'triggerNodeId', 'targetNodeId', 'targetNodeKind',
          'enrollmentPolicyKey', 'occurrenceKey'
        ]::text[] = '{}'::jsonb
        and jsonb_typeof("flow_run_events"."summary"->'schemaVersion') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'outcome') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'reasonCode') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'resultCode') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'eventKind') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'activationEpochId') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'triggerNodeId') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'targetNodeId') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'targetNodeKind') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'enrollmentPolicyKey') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'occurrenceKey') = 'string'
        and "flow_run_events"."summary"->>'schemaVersion' = 'flow-enrollment-trace.v1'
        and "flow_run_events"."summary"->>'outcome' = 'enrolled'
        and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_TRIGGER_MATCHED'
        and "flow_run_events"."summary"->>'resultCode' = 'FLOW_RUN_ENROLLED'
        and "flow_run_events"."summary"->>'eventKind' in ('booking_confirmed', 'manual_client')
        and "flow_run_events"."summary"->>'triggerNodeId' = "flow_run_events"."node_id"
        and length("flow_run_events"."summary"->>'triggerNodeId') between 1 and 160
        and "flow_run_events"."summary"->>'triggerNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
        and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
        and "flow_run_events"."summary"->>'enrollmentPolicyKey' in ('once_per_occurrence')
        and length("flow_run_events"."summary"->>'occurrenceKey') between 1 and 180
      ) or (
        "flow_run_events"."event_type" <> 'run_enrolled'
        and "flow_run_events"."summary" ?& array[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[]
        and (
          (
            "flow_run_events"."event_type" = 'token_advanced'
            and "flow_run_events"."summary" ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[]
            and jsonb_typeof("flow_run_events"."summary"->'sourceHandle') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'selectedEdgeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeKind') = 'string'
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[] = '{}'::jsonb
          ) or (
            "flow_run_events"."event_type" = 'token_advanced'
            and "flow_run_events"."summary" ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind',
              'sourceOutboxEventId', 'birthDataHistoryId', 'birthDataRevision',
              'workItemId', 'fromRevision', 'toRevision'
            ]::text[]
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind',
              'sourceOutboxEventId', 'birthDataHistoryId', 'birthDataRevision',
              'workItemId', 'fromRevision', 'toRevision'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof("flow_run_events"."summary"->'sourceHandle') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'selectedEdgeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeKind') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'sourceOutboxEventId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'birthDataHistoryId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'birthDataRevision') = 'number'
            and jsonb_typeof("flow_run_events"."summary"->'workItemId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'fromRevision') = 'number'
            and jsonb_typeof("flow_run_events"."summary"->'toRevision') = 'number'
            and "flow_run_events"."summary"->>'sourceOutboxEventId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and "flow_run_events"."summary"->>'birthDataHistoryId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and "flow_run_events"."summary"->>'workItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and scale(("flow_run_events"."summary"->>'birthDataRevision')::numeric) = 0
            and ("flow_run_events"."summary"->>'birthDataRevision')::numeric between 1 and 2147483647
            and scale(("flow_run_events"."summary"->>'fromRevision')::numeric) = 0
            and scale(("flow_run_events"."summary"->>'toRevision')::numeric) = 0
            and ("flow_run_events"."summary"->>'fromRevision')::numeric between 1 and 2147483646
            and ("flow_run_events"."summary"->>'toRevision')::numeric =
              ("flow_run_events"."summary"->>'fromRevision')::numeric + 1
          )
          or (
            "flow_run_events"."event_type" = 'token_signaled'
            and "flow_run_events"."summary" ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[]
            and jsonb_typeof("flow_run_events"."summary"->'sourceHandle') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'selectedEdgeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeKind') = 'string'
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[] = '{}'::jsonb
          )
          or (
            "flow_run_events"."event_type" = 'work_item_available'
            and "flow_run_events"."summary" ?& array[
              'workItemId', 'fromRevision', 'toRevision', 'scheduledFor'
            ]::text[]
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'workItemId', 'fromRevision', 'toRevision', 'scheduledFor'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof("flow_run_events"."summary"->'workItemId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'fromRevision') = 'number'
            and jsonb_typeof("flow_run_events"."summary"->'toRevision') = 'number'
            and jsonb_typeof("flow_run_events"."summary"->'scheduledFor') = 'string'
            and "flow_run_events"."summary"->>'workItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and scale(("flow_run_events"."summary"->>'fromRevision')::numeric) = 0
            and scale(("flow_run_events"."summary"->>'toRevision')::numeric) = 0
            and ("flow_run_events"."summary"->>'fromRevision')::numeric between 1 and 2147483646
            and ("flow_run_events"."summary"->>'toRevision')::numeric =
              ("flow_run_events"."summary"->>'fromRevision')::numeric + 1
            and length("flow_run_events"."summary"->>'scheduledFor') between 20 and 35
          )
          or (
            "flow_run_events"."event_type" = 'approval_expired'
            and "flow_run_events"."summary" ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[]
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof("flow_run_events"."summary"->'sourceHandle') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'selectedEdgeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeKind') = 'string'
          )
          or (
            "flow_run_events"."event_type" = 'booking_rescheduled'
            and "flow_run_events"."summary" ?& array[
              'bookingId', 'bookingLifecycleRevision',
              'previousStartAt', 'previousEndAt', 'previousTimeZone',
              'currentStartAt', 'currentEndAt', 'currentTimeZone',
              'workItemId', 'fromRevision', 'toRevision',
              'previousWorkItemStatus', 'currentWorkItemStatus',
              'previousDueAt', 'currentDueAt',
              'previousSnoozedUntil', 'currentSnoozedUntil', 'snoozeAdjustment'
            ]::text[]
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'bookingId', 'bookingLifecycleRevision',
              'previousStartAt', 'previousEndAt', 'previousTimeZone',
              'currentStartAt', 'currentEndAt', 'currentTimeZone',
              'workItemId', 'fromRevision', 'toRevision',
              'previousWorkItemStatus', 'currentWorkItemStatus',
              'previousDueAt', 'currentDueAt',
              'previousSnoozedUntil', 'currentSnoozedUntil', 'snoozeAdjustment'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof("flow_run_events"."summary"->'bookingId') = 'string'
            and "flow_run_events"."summary"->>'bookingId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and jsonb_typeof("flow_run_events"."summary"->'bookingLifecycleRevision') = 'number'
            and scale(("flow_run_events"."summary"->>'bookingLifecycleRevision')::numeric) = 0
            and ("flow_run_events"."summary"->>'bookingLifecycleRevision')::numeric
                  between 1 and 2147483647
            and jsonb_typeof("flow_run_events"."summary"->'previousStartAt') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'previousEndAt') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'previousTimeZone') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'currentStartAt') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'currentEndAt') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'currentTimeZone') = 'string'
            and ("flow_run_events"."summary"->>'previousStartAt')::timestamptz <
                  ("flow_run_events"."summary"->>'previousEndAt')::timestamptz
            and ("flow_run_events"."summary"->>'currentStartAt')::timestamptz <
                  ("flow_run_events"."summary"->>'currentEndAt')::timestamptz
            and length(trim("flow_run_events"."summary"->>'previousTimeZone')) between 1 and 120
            and length(trim("flow_run_events"."summary"->>'currentTimeZone')) between 1 and 120
            and (
              ("flow_run_events"."summary"->>'previousStartAt')::timestamptz IS DISTINCT FROM
                ("flow_run_events"."summary"->>'currentStartAt')::timestamptz
              or ("flow_run_events"."summary"->>'previousEndAt')::timestamptz IS DISTINCT FROM
                ("flow_run_events"."summary"->>'currentEndAt')::timestamptz
              or "flow_run_events"."summary"->>'previousTimeZone' IS DISTINCT FROM
                "flow_run_events"."summary"->>'currentTimeZone'
            )
            and (
              (
                jsonb_typeof("flow_run_events"."summary"->'workItemId') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'fromRevision') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'toRevision') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'previousWorkItemStatus') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'currentWorkItemStatus') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'previousDueAt') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'currentDueAt') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'previousSnoozedUntil') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'currentSnoozedUntil') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'snoozeAdjustment') = 'null'
              ) or (
                jsonb_typeof("flow_run_events"."summary"->'workItemId') = 'string'
                and "flow_run_events"."summary"->>'workItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                and jsonb_typeof("flow_run_events"."summary"->'fromRevision') = 'number'
                and jsonb_typeof("flow_run_events"."summary"->'toRevision') = 'number'
                and scale(("flow_run_events"."summary"->>'fromRevision')::numeric) = 0
                and scale(("flow_run_events"."summary"->>'toRevision')::numeric) = 0
                and ("flow_run_events"."summary"->>'fromRevision')::numeric between 1 and 2147483646
                and ("flow_run_events"."summary"->>'toRevision')::numeric =
                      ("flow_run_events"."summary"->>'fromRevision')::numeric + 1
                and jsonb_typeof("flow_run_events"."summary"->'previousWorkItemStatus') = 'string'
                and jsonb_typeof("flow_run_events"."summary"->'currentWorkItemStatus') = 'string'
                and "flow_run_events"."summary"->>'previousWorkItemStatus' in (
                  'pending', 'in_progress', 'snoozed'
                )
                and "flow_run_events"."summary"->>'currentWorkItemStatus' in (
                  'pending', 'in_progress', 'snoozed'
                )
                and jsonb_typeof("flow_run_events"."summary"->'previousDueAt') = 'string'
                and jsonb_typeof("flow_run_events"."summary"->'currentDueAt') = 'string'
                and jsonb_typeof("flow_run_events"."summary"->'previousSnoozedUntil') in ('null', 'string')
                and jsonb_typeof("flow_run_events"."summary"->'currentSnoozedUntil') in ('null', 'string')
                and jsonb_typeof("flow_run_events"."summary"->'snoozeAdjustment') = 'string'
                and "flow_run_events"."summary"->>'snoozeAdjustment' in ('unchanged', 'shortened', 'woken')
                and (
                  ("flow_run_events"."summary"->>'previousWorkItemStatus' = 'snoozed') =
                    (jsonb_typeof("flow_run_events"."summary"->'previousSnoozedUntil') = 'string')
                )
                and (
                  ("flow_run_events"."summary"->>'currentWorkItemStatus' = 'snoozed') =
                    (jsonb_typeof("flow_run_events"."summary"->'currentSnoozedUntil') = 'string')
                )
                and (
                  (
                    "flow_run_events"."summary"->>'snoozeAdjustment' = 'unchanged'
                    and "flow_run_events"."summary"->>'previousWorkItemStatus' =
                          "flow_run_events"."summary"->>'currentWorkItemStatus'
                    and "flow_run_events"."summary"->'previousSnoozedUntil' =
                          "flow_run_events"."summary"->'currentSnoozedUntil'
                    and (
                      "flow_run_events"."summary"->>'currentWorkItemStatus' <> 'snoozed'
                      or ("flow_run_events"."summary"->>'currentDueAt')::timestamptz >=
                           ("flow_run_events"."summary"->>'currentSnoozedUntil')::timestamptz
                    )
                  ) or (
                    "flow_run_events"."summary"->>'snoozeAdjustment' = 'shortened'
                    and "flow_run_events"."summary"->>'previousWorkItemStatus' = 'snoozed'
                    and "flow_run_events"."summary"->>'currentWorkItemStatus' = 'snoozed'
                    and ("flow_run_events"."summary"->>'currentSnoozedUntil')::timestamptz =
                          ("flow_run_events"."summary"->>'currentDueAt')::timestamptz
                    and ("flow_run_events"."summary"->>'currentSnoozedUntil')::timestamptz <
                          ("flow_run_events"."summary"->>'previousSnoozedUntil')::timestamptz
                  ) or (
                    "flow_run_events"."summary"->>'snoozeAdjustment' = 'woken'
                    and "flow_run_events"."summary"->>'previousWorkItemStatus' = 'snoozed'
                    and "flow_run_events"."summary"->>'currentWorkItemStatus' = 'pending'
                    and jsonb_typeof("flow_run_events"."summary"->'previousSnoozedUntil') = 'string'
                    and jsonb_typeof("flow_run_events"."summary"->'currentSnoozedUntil') = 'null'
                  )
                )
              )
            )
          )
          or (
            "flow_run_events"."event_type" not in (
              'token_advanced', 'token_signaled', 'work_item_available', 'approval_expired',
              'booking_rescheduled'
            )
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
            ]::text[] = '{}'::jsonb
          )
        )
        and jsonb_typeof("flow_run_events"."summary"->'schemaVersion') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'outcome') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'nodeKind') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'reasonCode') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'resultCode') = 'string'
        and "flow_run_events"."summary"->>'schemaVersion' = 'flow-runtime-trace.v1'
        and "flow_run_events"."summary"->>'nodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
        and length("flow_run_events"."summary"->>'resultCode') between 1 and 160
        and "flow_run_events"."summary"->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        and (
          (
            "flow_run_events"."event_type" = 'token_advanced'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
            and length("flow_run_events"."summary"->>'selectedEdgeId') between 1 and 160
            and "flow_run_events"."summary"->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
            and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and (
              (
                "flow_run_events"."attempt_id" is not null
                and "flow_run_events"."command_id" is null
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_EDGE_SELECTED'
                and "flow_run_events"."summary"->>'sourceHandle' in ('next', 'true', 'false', 'success', 'error', 'timeout', 'approved', 'rejected')
              ) or (
                "flow_run_events"."attempt_id" is null
                and "flow_run_events"."command_id" is not null
                and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_work_item'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_WORK_ITEM_COMPLETED'
                and "flow_run_events"."summary"->>'sourceHandle' = 'success'
              ) or (
                "flow_run_events"."attempt_id" is null
                and "flow_run_events"."command_id" is not null
                and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_approval'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_APPROVAL_DECIDED'
                and "flow_run_events"."summary"->>'sourceHandle' in ('approved', 'rejected')
              ) or (
                "flow_run_events"."attempt_id" is null
                and "flow_run_events"."command_id" is null
                and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_work_item'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_BIRTH_PROFILE_RECHECK_READY'
                and "flow_run_events"."summary"->>'sourceHandle' = 'success'
              )
            )
          )
          or
          (
            "flow_run_events"."event_type" = 'token_signaled'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'nodeKind' = 'natal_chart_request'
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_CHART_CALCULATION_COMPLETED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'sourceHandle' = 'next'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
            and length("flow_run_events"."summary"->>'selectedEdgeId') between 1 and 160
            and "flow_run_events"."summary"->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
            and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
          )
          or
          (
            "flow_run_events"."event_type" = 'work_item_available'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_work_item'
            and "flow_run_events"."summary"->>'outcome' = 'available'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_WORK_ITEM_SNOOZE_ELAPSED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_WORK_ITEM_AVAILABLE'
          )
          or
          (
            "flow_run_events"."event_type" = 'approval_available'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_approval'
            and "flow_run_events"."summary"->>'outcome' = 'available'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_APPROVAL_SNOOZE_ELAPSED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_APPROVAL_AVAILABLE'
          )
          or
          (
            "flow_run_events"."event_type" = 'approval_expired'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_approval'
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_APPROVAL_EXPIRED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'sourceHandle' = 'timeout'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
            and length("flow_run_events"."summary"->>'selectedEdgeId') between 1 and 160
            and "flow_run_events"."summary"->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
            and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
          )
          or
          (
            "flow_run_events"."event_type" = 'booking_rescheduled'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."booking_lifecycle_event_id" is not null
            and "flow_run_events"."summary"->>'outcome' = 'rescheduled'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_BOOKING_RESCHEDULED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_BOOKING_SCHEDULE_UPDATED'
          )
          or
          (
            "flow_run_events"."event_type" = 'token_waiting'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is not null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'outcome' = 'waiting'
            and (
              (
                "flow_run_events"."summary"->>'nodeKind' = 'astrologer_work_item'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_WORK_ITEM_CREATED'
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_WAITING_WORK_ITEM'
              ) or (
                "flow_run_events"."summary"->>'nodeKind' = 'natal_chart_request'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_CHART_CALCULATION_REQUESTED'
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_WAITING_SIGNAL'
              ) or (
                "flow_run_events"."summary"->>'nodeKind' = 'astrologer_approval'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_APPROVAL_CREATED'
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_WAITING_APPROVAL'
              )
            )
          )
          or
          (
            "flow_run_events"."event_type" = 'run_completed'
            and "flow_run_events"."attempt_id" is not null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'nodeKind' = 'completed'
            and "flow_run_events"."summary"->>'outcome' = 'terminal'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_GOAL_REACHED'
          )
          or (
            "flow_run_events"."event_type" = 'token_lease_expired'
            and "flow_run_events"."attempt_id" is not null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'outcome' = 'lease_expired'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          )
          or (
            "flow_run_events"."event_type" = 'run_canceled'
            and "flow_run_events"."summary"->>'outcome' = 'canceled'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_RUN_CANCELED'
            and (
              (
                "flow_run_events"."command_id" is not null
                and "flow_run_events"."booking_lifecycle_event_id" is null
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
              ) or (
                "flow_run_events"."command_id" is null
                and "flow_run_events"."booking_lifecycle_event_id" is not null
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_BOOKING_CANCELED'
              )
            )
          )
          or (
            "flow_run_events"."event_type" = 'token_retry_scheduled'
            and "flow_run_events"."attempt_id" is not null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'outcome' = 'retry_scheduled'
            and "flow_run_events"."summary"->>'reasonCode' in ('FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE')
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
          )
          or (
            "flow_run_events"."event_type" = 'run_failed'
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'outcome' = 'failed'
            and (
              (
                "flow_run_events"."summary"->>'reasonCode' in ('FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID', 'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH', 'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID', 'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE', 'FLOW_NODE_EXECUTION_REJECTED', 'FLOW_CHART_CALCULATION_FAILED')
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
              )
              or (
                "flow_run_events"."summary"->>'reasonCode' in ('FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE', 'FLOW_TOKEN_LEASE_EXPIRED')
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
              )
            )
          )
        )
      ));--> statement-breakpoint
ALTER TABLE "flow_runtime_events" ADD CONSTRAINT "flow_runtime_events_normalized_shape_check" CHECK ((
        "flow_runtime_events"."event_kind" is null
        and "flow_runtime_events"."occurrence_key" is null
        and "flow_runtime_events"."payload_schema_version" is null
        and "flow_runtime_events"."payload_digest" is null
        and "flow_runtime_events"."classification" is null
        and "flow_runtime_events"."redaction_version" is null
        and "flow_runtime_events"."retention_policy_id" is null
        and "flow_runtime_events"."ingestion_outcome" is null
        and "flow_runtime_events"."processed_at" is null
      ) or (
        "flow_runtime_events"."event_kind" in ('booking_confirmed', 'manual_client')
        and length(trim("flow_runtime_events"."occurrence_key")) between 1 and 180
        and "flow_runtime_events"."payload_schema_version" = 1
        and "flow_runtime_events"."payload_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "flow_runtime_events"."classification" in ('personal')
        and "flow_runtime_events"."redaction_version" = 1
        and length(trim("flow_runtime_events"."retention_policy_id")) between 1 and 180
        and "flow_runtime_events"."ingestion_outcome" in ('enrolled', 'no_match', 'late_unmatched', 'subject_ineligible', 'suppressed')
        and "flow_runtime_events"."processed_at" is not null
      ));