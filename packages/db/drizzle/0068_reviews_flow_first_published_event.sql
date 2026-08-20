DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM flow_runtime_events
     WHERE event_kind = 'review_received'
  ) THEN
    RAISE EXCEPTION 'Cannot migrate review flow runtime events automatically: review_received events already exist';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM flow_run_events
     WHERE summary->>'eventKind' = 'review_received'
  ) THEN
    RAISE EXCEPTION 'Cannot migrate review flow run summaries automatically: review_received run traces already exist';
  END IF;
END $migration$;
--> statement-breakpoint
UPDATE flow_versions
   SET graph = replace(graph::text, 'review_received', 'review_first_published')::jsonb,
       capability_manifest = replace(
         replace(capability_manifest::text, 'reviews.events.received', 'reviews.events.first_published'),
         'review_received',
         'review_first_published'
       )::jsonb
 WHERE graph::text LIKE '%review_received%'
    OR capability_manifest::text LIKE '%review_received%'
    OR capability_manifest::text LIKE '%reviews.events.received%';
--> statement-breakpoint
DO $migration$
DECLARE
  existing_definition text;
  updated_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO existing_definition
    FROM pg_constraint
   WHERE conrelid = 'flow_runtime_events'::regclass
     AND conname = 'flow_runtime_events_normalized_shape_check';

  IF existing_definition IS NULL THEN
    RAISE EXCEPTION 'flow_runtime_events_normalized_shape_check not found';
  END IF;

  updated_definition := replace(existing_definition, 'review_received', 'review_first_published');

  IF updated_definition = existing_definition THEN
    IF position('review_first_published' in existing_definition) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'flow_runtime_events_normalized_shape_check review event kind allowlist was not updated';
  END IF;

  ALTER TABLE flow_runtime_events DROP CONSTRAINT flow_runtime_events_normalized_shape_check;
  EXECUTE 'ALTER TABLE flow_runtime_events ADD CONSTRAINT flow_runtime_events_normalized_shape_check ' || updated_definition;
END $migration$;
--> statement-breakpoint
DO $migration$
DECLARE
  existing_definition text;
  updated_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO existing_definition
    FROM pg_constraint
   WHERE conrelid = 'flow_versions'::regclass
     AND conname = 'flow_versions_capability_manifest_schema_check';

  IF existing_definition IS NULL THEN
    RAISE EXCEPTION 'flow_versions_capability_manifest_schema_check not found';
  END IF;

  updated_definition := replace(
    replace(existing_definition, 'reviews.events.received', 'reviews.events.first_published'),
    'review_received',
    'review_first_published'
  );

  IF updated_definition = existing_definition THEN
    IF position('review_first_published' in existing_definition) > 0
       AND position('reviews.events.first_published' in existing_definition) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'flow_versions_capability_manifest_schema_check review trigger allowlist was not updated';
  END IF;

  ALTER TABLE flow_versions DROP CONSTRAINT flow_versions_capability_manifest_schema_check;
  EXECUTE 'ALTER TABLE flow_versions ADD CONSTRAINT flow_versions_capability_manifest_schema_check ' || updated_definition;
END $migration$;
--> statement-breakpoint
DO $migration$
DECLARE
  existing_definition text;
  updated_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO existing_definition
    FROM pg_constraint
   WHERE conrelid = 'flow_run_events'::regclass
     AND conname = 'flow_run_events_summary_schema_check';

  IF existing_definition IS NULL THEN
    RAISE EXCEPTION 'flow_run_events_summary_schema_check not found';
  END IF;

  updated_definition := replace(existing_definition, 'review_received', 'review_first_published');

  IF updated_definition = existing_definition THEN
    IF position('review_first_published' in existing_definition) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'flow_run_events_summary_schema_check review event kind allowlist was not updated';
  END IF;

  ALTER TABLE flow_run_events DROP CONSTRAINT flow_run_events_summary_schema_check;
  EXECUTE 'ALTER TABLE flow_run_events ADD CONSTRAINT flow_run_events_summary_schema_check ' || updated_definition;
END $migration$;
