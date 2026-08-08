ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_messaging_delivery_reconciliation_payload_check" CHECK ("outbox_events"."event_type" <> 'messaging.message.delivery_reconciliation_requested.v1' or (
        "outbox_events"."payload"->>'messageId' = "outbox_events"."aggregate_id"::text
        and "outbox_events"."payload"->>'schemaVersion' = 'messaging-message-delivery-reconciliation-request.v1'
      ));