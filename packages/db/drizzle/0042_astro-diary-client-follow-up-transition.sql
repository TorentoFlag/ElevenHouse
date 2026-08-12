CREATE OR REPLACE FUNCTION astro_diary_guard_versioned_head()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 THEN
      RAISE EXCEPTION 'AstroDiary versioned heads must begin at version one' USING errcode = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'astro_diary_drafts' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'AstroDiary versioned heads cannot be deleted' USING errcode = '55000';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'AstroDiary versioned heads require one contiguous version transition' USING errcode = '23514';
  END IF;

  IF TG_TABLE_NAME = 'astro_diary_journals' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.relationship_id IS DISTINCT FROM OLD.relationship_id
      OR NEW.journal_epoch_id IS DISTINCT FROM OLD.journal_epoch_id
      OR NEW.astrologer_user_id IS DISTINCT FROM OLD.astrologer_user_id
      OR NEW.client_user_id IS DISTINCT FROM OLD.client_user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NOT ((OLD.state = 'active' AND NEW.state IN ('active', 'erasing'))
        OR (OLD.state = 'erasing' AND NEW.state IN ('erasing', 'erased'))) THEN
      RAISE EXCEPTION 'AstroDiary journal identity or state transition is invalid' USING errcode = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'astro_diary_cycles' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.journal_id IS DISTINCT FROM OLD.journal_id
      OR NEW.opening_period_id IS DISTINCT FROM OLD.opening_period_id
      OR (
        NEW.opening_allowance_reservation_id IS DISTINCT FROM OLD.opening_allowance_reservation_id
        AND NOT (
          OLD.state = 'awaiting_client_entry'
          AND OLD.opening_allowance_reservation_id IS NOT NULL
          AND NEW.state IN ('awaiting_astrologer_response', 'closed')
          AND NEW.opening_allowance_reservation_id IS NULL
        )
      )
      OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
      OR NOT (
        (OLD.state = 'awaiting_client_entry'
          AND NEW.state IN ('awaiting_astrologer_response', 'closed'))
        OR (OLD.state = 'awaiting_astrologer_response'
          AND NEW.state IN ('awaiting_client_follow_up', 'awaiting_astrologer_closing_response', 'closed'))
        OR (OLD.state = 'awaiting_client_follow_up'
          AND NEW.state IN ('awaiting_astrologer_response', 'awaiting_astrologer_closing_response', 'closed'))
        OR (OLD.state = 'awaiting_astrologer_closing_response' AND NEW.state = 'closed')
      ) THEN
      RAISE EXCEPTION 'AstroDiary cycle allowance reservation may clear only when leaving client entry' USING errcode = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'astro_diary_response_obligations' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.journal_id IS DISTINCT FROM OLD.journal_id
      OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
      OR NEW.trigger_item_id IS DISTINCT FROM OLD.trigger_item_id
      OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
      OR NEW.due_at IS DISTINCT FROM OLD.due_at
      OR NEW.response_sla_working_days IS DISTINCT FROM OLD.response_sla_working_days
      OR NEW.service_timezone IS DISTINCT FROM OLD.service_timezone
      OR NEW.resolved_due_local IS DISTINCT FROM OLD.resolved_due_local
      OR NEW.resolved_due_offset IS DISTINCT FROM OLD.resolved_due_offset
      OR NOT (
        (OLD.state = 'open' AND NEW.state IN ('overdue', 'satisfied', 'cancelled_by_finance_revocation', 'closed_without_response'))
        OR (OLD.state = 'overdue' AND NEW.state IN ('satisfied', 'cancelled_by_finance_revocation', 'closed_without_response'))
      ) THEN
      RAISE EXCEPTION 'AstroDiary obligation identity or state transition is invalid' USING errcode = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'astro_diary_drafts' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.journal_id IS DISTINCT FROM OLD.journal_id
      OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
      OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
      OR NEW.author_role IS DISTINCT FROM OLD.author_role
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.corrects_item_id IS DISTINCT FROM OLD.corrects_item_id
      OR NEW.updated_at < OLD.updated_at THEN
      RAISE EXCEPTION 'AstroDiary draft ownership is immutable and versions are monotonic' USING errcode = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'astro_diary_context_snapshots' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.journal_id IS DISTINCT FROM OLD.journal_id
      OR NEW.item_id IS DISTINCT FROM OLD.item_id
      OR NEW.source_item_revision IS DISTINCT FROM OLD.source_item_revision
      OR NEW.source_item_digest IS DISTINCT FROM OLD.source_item_digest
      OR NEW.event_at IS DISTINCT FROM OLD.event_at
      OR NEW.event_timezone IS DISTINCT FROM OLD.event_timezone
      OR NOT (OLD.status = 'pending' AND NEW.status IN ('global_only', 'personal', 'failed', 'source_stale')) THEN
      RAISE EXCEPTION 'AstroDiary context source identity or state transition is invalid' USING errcode = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'astro_diary_read_cursors' THEN
    IF NEW.journal_id IS DISTINCT FROM OLD.journal_id
      OR NEW.participant_user_id IS DISTINCT FROM OLD.participant_user_id
      OR NEW.last_read_cursor < OLD.last_read_cursor
      OR NEW.updated_at < OLD.updated_at THEN
      RAISE EXCEPTION 'AstroDiary read cursor identity is immutable and cursor is monotonic' USING errcode = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
