export const astroDiaryProductIntegrityConstraintName = "astro_diary_product_integrity" as const;

export const astroDiaryProductIntegrityTriggerTables = [
  "products",
  "product_access_grants",
  "product_delivery_formats",
  "product_required_client_data",
  "product_methods",
  "product_modifiers"
] as const;

const constraintTriggersSql = astroDiaryProductIntegrityTriggerTables
  .map(
    (table) => `CREATE CONSTRAINT TRIGGER "${astroDiaryProductIntegrityConstraintName}"
AFTER INSERT OR UPDATE OR DELETE ON "${table}"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_astro_diary_product_integrity();`
  )
  .join("\n--> statement-breakpoint\n");

export const astroDiaryProductIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_assert_astro_diary_product_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $astro_diary_product_integrity$
DECLARE
  new_product_id uuid;
  old_product_id uuid;
  checked_product_id uuid;
  checked_product_ids uuid[] := ARRAY[]::uuid[];
  product_row products%ROWTYPE;
  product_row_transaction_id text;
  config_field_count integer;
  config_present boolean;
  journal_is_sole_grant boolean;
  access_grant_count bigint;
  journal_grant_count bigint;
  canonical_journal_grant_count bigint;
  delivery_formats text[];
  required_client_data_count bigint;
  method_count bigint;
  modifier_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    IF TG_OP = 'UPDATE' AND (
      NEW.id IS DISTINCT FROM OLD.id
      OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.revision <> OLD.revision + 1
      OR NEW.updated_at < OLD.updated_at
    ) THEN
      RAISE EXCEPTION 'Product mutation requires one monotonic revision bump'
        USING ERRCODE = '23514', CONSTRAINT = '${astroDiaryProductIntegrityConstraintName}';
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_product_id := NEW.id;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      old_product_id := OLD.id;
    END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN
      new_product_id := NEW.product_id;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      old_product_id := OLD.product_id;
    END IF;
  END IF;

  SELECT coalesce(
           array_agg(candidate_product_id ORDER BY candidate_product_id),
           ARRAY[]::uuid[]
         )
    INTO checked_product_ids
    FROM (
      SELECT DISTINCT unnest(ARRAY[new_product_id, old_product_id]) AS candidate_product_id
    ) AS candidate_product_ids
   WHERE candidate_product_id IS NOT NULL;

  FOREACH checked_product_id IN ARRAY checked_product_ids
  LOOP
    SELECT *
      INTO product_row
      FROM products
     WHERE id = checked_product_id
       FOR NO KEY UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    SELECT xmin::text
      INTO product_row_transaction_id
      FROM products
     WHERE id = checked_product_id;
    IF TG_TABLE_NAME <> 'products'
       AND product_row_transaction_id IS DISTINCT FROM pg_current_xact_id()::text THEN
      RAISE EXCEPTION 'Product child mutation requires a parent revision bump in the same transaction'
        USING ERRCODE = '23514', CONSTRAINT = '${astroDiaryProductIntegrityConstraintName}';
    END IF;

    config_field_count := num_nonnulls(
      product_row.astro_diary_reflection_cycles_per_period,
      product_row.astro_diary_response_sla_working_days,
      product_row.astro_diary_client_response_window_calendar_days,
      product_row.astro_diary_working_weekdays_mask,
      product_row.astro_diary_service_timezone
    );
    config_present := config_field_count = 5;

    SELECT count(*),
           count(*) FILTER (WHERE grant_value = 'journal'),
           count(*) FILTER (WHERE grant_value = 'journal' AND grant_order = 0)
      INTO access_grant_count, journal_grant_count, canonical_journal_grant_count
      FROM (
        SELECT value AS grant_value, "order" AS grant_order
          FROM product_access_grants
         WHERE product_id = checked_product_id
      ) AS grants;

    journal_is_sole_grant := journal_grant_count = 1
      AND canonical_journal_grant_count = 1
      AND access_grant_count = 1;

    IF config_field_count NOT IN (0, 5) THEN
      RAISE EXCEPTION 'AstroDiary product configuration must be either complete or absent'
        USING ERRCODE = '23514', CONSTRAINT = '${astroDiaryProductIntegrityConstraintName}';
    END IF;

    IF journal_grant_count <> 0 AND (
      access_grant_count <> 1
      OR canonical_journal_grant_count <> journal_grant_count
    ) THEN
      RAISE EXCEPTION 'Journal must be the product sole access grant'
        USING ERRCODE = '23514', CONSTRAINT = '${astroDiaryProductIntegrityConstraintName}';
    END IF;

    IF config_present IS DISTINCT FROM journal_is_sole_grant THEN
      RAISE EXCEPTION 'AstroDiary configuration and sole journal access grant must coexist'
        USING ERRCODE = '23514', CONSTRAINT = '${astroDiaryProductIntegrityConstraintName}';
    END IF;

    IF NOT journal_is_sole_grant THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_timezone_names
       WHERE name = product_row.astro_diary_service_timezone
    ) THEN
      RAISE EXCEPTION 'AstroDiary service timezone is not a recognized IANA timezone'
        USING ERRCODE = '23514', CONSTRAINT = '${astroDiaryProductIntegrityConstraintName}';
    END IF;

    IF product_row.type IS DISTINCT FROM 'async'
       OR product_row.payment_model IS DISTINCT FROM 'once'
       OR product_row.subscription_period NOT IN ('week', 'month', 'year')
       OR product_row.execution_mode IS DISTINCT FROM 'async'
       OR product_row.participant_mode IS DISTINCT FROM 'solo'
       OR product_row.price_minor <= 0
       OR product_row.duration_minutes IS NOT NULL
       OR product_row.duration_label IS NOT NULL
       OR product_row.sla_label IS NOT NULL
       OR product_row.package_session_count IS NOT NULL
       OR product_row.package_discount_percent IS NOT NULL
       OR product_row.trial_days IS NOT NULL
       OR product_row.group_size IS NOT NULL THEN
      RAISE EXCEPTION 'AstroDiary product parent shape is invalid'
        USING ERRCODE = '23514', CONSTRAINT = '${astroDiaryProductIntegrityConstraintName}';
    END IF;

    SELECT coalesce(
             array_agg(delivery_format ORDER BY format_order),
             ARRAY[]::text[]
           )
      INTO delivery_formats
      FROM (
        SELECT value AS delivery_format, "order" AS format_order
          FROM product_delivery_formats
         WHERE product_id = checked_product_id
      ) AS formats;

    IF delivery_formats IS DISTINCT FROM ARRAY['chat', 'audio', 'file']::text[]
       OR EXISTS (
         SELECT 1 FROM product_delivery_formats exact_format
          WHERE exact_format.product_id = checked_product_id
            AND NOT (
              (exact_format.value = 'chat' AND exact_format."order" = 0)
              OR (exact_format.value = 'audio' AND exact_format."order" = 1)
              OR (exact_format.value = 'file' AND exact_format."order" = 2)
            )
       ) THEN
      RAISE EXCEPTION 'AstroDiary delivery formats must be exactly chat, audio and file'
        USING ERRCODE = '23514', CONSTRAINT = '${astroDiaryProductIntegrityConstraintName}';
    END IF;

    SELECT count(*)
      INTO required_client_data_count
      FROM product_required_client_data
     WHERE product_id = checked_product_id;
    SELECT count(*)
      INTO method_count
      FROM product_methods
     WHERE product_id = checked_product_id;
    SELECT count(*)
      INTO modifier_count
      FROM product_modifiers
     WHERE product_id = checked_product_id;

    IF required_client_data_count <> 0
       OR method_count <> 0
       OR modifier_count <> 0 THEN
      RAISE EXCEPTION 'AstroDiary client data, methods and modifiers must be empty'
        USING ERRCODE = '23514', CONSTRAINT = '${astroDiaryProductIntegrityConstraintName}';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$astro_diary_product_integrity$;
--> statement-breakpoint
${constraintTriggersSql}`;
