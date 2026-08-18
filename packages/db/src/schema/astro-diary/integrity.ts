/**
 * Immediate mutation guards are installed after every AstroDiary table. Published facts stay
 * append-only; mutable heads advance by one exact version/revision under the journal transaction.
 */
export const astroDiaryImmutableEvidenceSql = `
create or replace function astro_diary_guard_immutable_evidence()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'AstroDiary evidence in % is immutable', tg_table_name
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function astro_diary_guard_versioned_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.version <> 1 then
      raise exception 'AstroDiary versioned heads must begin at version one'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if tg_table_name = 'astro_diary_drafts' then return old; end if;
    raise exception 'AstroDiary versioned heads cannot be deleted'
      using errcode = '55000';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'AstroDiary versioned heads require one contiguous version transition'
      using errcode = '23514';
  end if;

  if tg_table_name = 'astro_diary_journals' then
    if new.id is distinct from old.id
      or new.relationship_id is distinct from old.relationship_id
      or new.journal_epoch_id is distinct from old.journal_epoch_id
      or new.astrologer_user_id is distinct from old.astrologer_user_id
      or new.client_user_id is distinct from old.client_user_id
      or new.created_at is distinct from old.created_at
      or not ((old.state = 'active' and new.state in ('active', 'erasing'))
        or (old.state = 'erasing' and new.state in ('erasing', 'erased'))) then
      raise exception 'AstroDiary journal identity or state transition is invalid'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'astro_diary_cycles' then
    if new.id is distinct from old.id
      or new.journal_id is distinct from old.journal_id
      or new.opening_period_id is distinct from old.opening_period_id
      or (
        new.opening_allowance_reservation_id is distinct from old.opening_allowance_reservation_id
        and not (
          old.state = 'awaiting_client_entry'
          and old.opening_allowance_reservation_id is not null
          and new.state in ('awaiting_astrologer_response', 'closed')
          and new.opening_allowance_reservation_id is null
        )
      )
      or new.opened_at is distinct from old.opened_at
      or not (
        (old.state = 'awaiting_client_entry'
          and new.state in ('awaiting_astrologer_response', 'closed'))
        or (old.state = 'awaiting_astrologer_response'
          and new.state in ('awaiting_client_follow_up', 'awaiting_astrologer_closing_response', 'closed'))
        or (old.state = 'awaiting_client_follow_up'
          and new.state in ('awaiting_astrologer_response', 'awaiting_astrologer_closing_response', 'closed'))
        or (old.state = 'awaiting_astrologer_closing_response' and new.state = 'closed')
      ) then
      raise exception 'AstroDiary cycle allowance reservation may clear only when leaving client entry'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'astro_diary_response_obligations' then
    if new.id is distinct from old.id
      or new.journal_id is distinct from old.journal_id
      or new.cycle_id is distinct from old.cycle_id
      or new.trigger_item_id is distinct from old.trigger_item_id
      or new.opened_at is distinct from old.opened_at
      or new.due_at is distinct from old.due_at
      or new.response_sla_working_days is distinct from old.response_sla_working_days
      or new.service_timezone is distinct from old.service_timezone
      or new.resolved_due_local is distinct from old.resolved_due_local
      or new.resolved_due_offset is distinct from old.resolved_due_offset
      or not (
        (old.state = 'open' and new.state in (
          'overdue', 'satisfied', 'cancelled_by_finance_revocation', 'closed_without_response'
        ))
        or (old.state = 'overdue' and new.state in (
          'satisfied', 'cancelled_by_finance_revocation', 'closed_without_response'
        ))
      ) then
      raise exception 'AstroDiary obligation identity or state transition is invalid'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'astro_diary_drafts' then
    if new.id is distinct from old.id
      or new.journal_id is distinct from old.journal_id
      or new.cycle_id is distinct from old.cycle_id
      or new.author_user_id is distinct from old.author_user_id
      or new.author_role is distinct from old.author_role
      or new.kind is distinct from old.kind
      or new.corrects_item_id is distinct from old.corrects_item_id
      or new.updated_at < old.updated_at then
      raise exception 'AstroDiary draft ownership is immutable and versions are monotonic'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'astro_diary_context_snapshots' then
    if new.id is distinct from old.id
      or new.journal_id is distinct from old.journal_id
      or new.item_id is distinct from old.item_id
      or new.source_item_revision is distinct from old.source_item_revision
      or new.source_item_digest is distinct from old.source_item_digest
      or new.event_at is distinct from old.event_at
      or new.event_timezone is distinct from old.event_timezone
      or not (old.status = 'pending'
        and new.status in ('global_only', 'personal', 'failed', 'source_stale')) then
      raise exception 'AstroDiary context source identity or state transition is invalid'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'astro_diary_read_cursors' then
    if new.journal_id is distinct from old.journal_id
      or new.participant_user_id is distinct from old.participant_user_id
      or new.last_read_cursor < old.last_read_cursor
      or new.updated_at < old.updated_at then
      raise exception 'AstroDiary read cursor identity is immutable and cursor is monotonic'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function astro_diary_guard_timeline_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  expected_next_cursor bigint;
begin
  if tg_op = 'DELETE' then
    raise exception 'AstroDiary timeline heads cannot be deleted; append a tombstone revision'
      using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    perform 1 from astro_diary_journals where id = new.journal_id for update;
    select coalesce(max(item.cursor), 0) + 1 into expected_next_cursor
      from astro_diary_timeline_items item
     where item.journal_id = new.journal_id;
    if new.current_revision <> 1 then
      raise exception 'AstroDiary timeline heads must begin at revision one'
        using errcode = '23514';
    end if;
    if new.cursor is null then
      raise exception 'AstroDiary timeline cursor is server generated'
        using errcode = '23514';
    end if;
    if new.cursor <> expected_next_cursor then
      raise exception 'AstroDiary timeline cursor is not the next server cursor'
        using errcode = '23514';
    end if;
    return new;
  end if;
  perform 1 from astro_diary_journals where id = new.journal_id for update;
  if new.id is distinct from old.id
    or new.journal_id is distinct from old.journal_id
    or new.cycle_id is distinct from old.cycle_id
    or new.author_role is distinct from old.author_role
    or new.author_user_id is distinct from old.author_user_id
    or new.occurred_at is distinct from old.occurred_at
    or new.cursor is distinct from old.cursor
    or new.current_revision <> old.current_revision + 1 then
    raise exception 'AstroDiary timeline head requires one contiguous immutable-identity revision'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function astro_diary_guard_transition_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'AstroDiary command lifecycle heads cannot be deleted'
      using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then return new; end if;

  if tg_table_name = 'astro_diary_entry_attachments' then
    if new.media_id is distinct from old.media_id
      or new.journal_id is distinct from old.journal_id
      or new.item_id is distinct from old.item_id
      or new.owner_user_id is distinct from old.owner_user_id
      or new.purpose is distinct from old.purpose
      or new.bound_at is distinct from old.bound_at
      or old.state <> 'bound' or new.state <> 'released' then
      raise exception 'AstroDiary media binding permits only bound to released'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'astro_diary_erasure_commands' then
    if new.id is distinct from old.id
      or new.journal_id is distinct from old.journal_id
      or new.target_type is distinct from old.target_type
      or new.target_id is distinct from old.target_id
      or new.source_version is distinct from old.source_version
      or new.source_digest is distinct from old.source_digest
      or new.derivative_command_id is distinct from old.derivative_command_id
      or new.cascade_request_id is distinct from old.cascade_request_id
      or new.requested_at is distinct from old.requested_at
      or old.state <> 'pending' or new.state <> 'completed' then
      raise exception 'AstroDiary erasure command permits only pending to completed'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'astro_diary_cascade_commands' then
    if new.cascade_request_id is distinct from old.cascade_request_id
      or new.journal_id is distinct from old.journal_id
      or new.requested_at is distinct from old.requested_at
      or old.state <> 'pending' or new.state <> 'completed' then
      raise exception 'AstroDiary cascade command permits only pending to completed'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function astro_diary_guard_async_command_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  old_state text;
  new_state text;
  initial_state text;
  processing_state text;
  terminal_states text[];
  direct_terminal_states text[];
begin
  if tg_op = 'DELETE' then
    raise exception 'AstroDiary async command lifecycle cannot be deleted'
      using errcode = '55000';
  end if;
  if tg_table_name = 'astro_diary_ai_attempts' then
    if tg_op = 'INSERT' then
      if new.state <> 'processing' then
        raise exception 'AstroDiary AI attempt must begin processing' using errcode = '23514';
      end if;
      return new;
    end if;
    if new.id is distinct from old.id
      or new.command_id is distinct from old.command_id
      or new.stage is distinct from old.stage
      or new.requested_model is distinct from old.requested_model
      or new.input_digest is distinct from old.input_digest
      or new.started_at is distinct from old.started_at
      or old.state <> 'processing'
      or new.state not in ('succeeded', 'known_failed', 'outcome_unknown', 'source_stale', 'cancelled') then
      raise exception 'AstroDiary AI attempt transition is invalid' using errcode = '23514';
    end if;
    return new;
  end if;

  old_state := case when tg_op = 'UPDATE' then coalesce(to_jsonb(old)->>'state', to_jsonb(old)->>'status') end;
  new_state := coalesce(to_jsonb(new)->>'state', to_jsonb(new)->>'status');
  initial_state := case
    when tg_table_name = 'astro_diary_export_commands' then 'queued'
    else 'pending'
  end;
  processing_state := case
    when tg_table_name = 'astro_diary_event_deliveries' then 'publishing'
    else 'processing'
  end;
  terminal_states := case
    when tg_table_name = 'astro_diary_ai_commands'
      then array['succeeded', 'known_failed', 'outcome_unknown', 'source_stale', 'cancelled']
    when tg_table_name = 'astro_diary_export_commands'
      then array['ready', 'failed', 'invalidated']
    when tg_table_name = 'astro_diary_derivative_commands'
      then array['completed', 'known_failed', 'source_stale']
    when tg_table_name in ('astro_diary_erasure_commands', 'astro_diary_cascade_commands')
      then array['completed']
    when tg_table_name = 'astro_diary_event_deliveries' then array['published']
    else array[]::text[]
  end;
  direct_terminal_states := case
    when tg_table_name = 'astro_diary_ai_commands' then array['source_stale', 'cancelled']
    when tg_table_name = 'astro_diary_export_commands' then array['invalidated']
    when tg_table_name = 'astro_diary_derivative_commands' then array['source_stale']
    else array[]::text[]
  end;

  if tg_op = 'INSERT' then
    if new_state <> initial_state or new.attempts <> 0 or new.claim_fence <> 0
      or new.lease_owner is not null or new.lease_expires_at is not null
      or new.next_attempt_at is not null or new.last_failure_code is not null
      or new.quarantined_at is not null or new.quarantine_reason_code is not null then
      raise exception 'AstroDiary async lifecycle must begin with pristine initial authority'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - array[
      'state', 'status', 'attempts', 'claim_fence', 'lease_owner', 'lease_expires_at',
      'next_attempt_at', 'last_failure_code', 'quarantined_at', 'quarantine_reason_code',
      'failure_code', 'processing_started_at', 'completed_at', 'artifact_media_id',
      'artifact_owner_user_id', 'updated_at', 'published_at'
    ]) <> (to_jsonb(old) - array[
      'state', 'status', 'attempts', 'claim_fence', 'lease_owner', 'lease_expires_at',
      'next_attempt_at', 'last_failure_code', 'quarantined_at', 'quarantine_reason_code',
      'failure_code', 'processing_started_at', 'completed_at', 'artifact_media_id',
      'artifact_owner_user_id', 'updated_at', 'published_at'
    ]) then
    raise exception 'AstroDiary async command identity is immutable' using errcode = '23514';
  end if;

  if old_state = initial_state and new_state = processing_state then
    if new.claim_fence <> old.claim_fence + 1 or new.attempts <> old.attempts + 1 then
      raise exception 'AstroDiary async claim requires one fence and attempt increment'
        using errcode = '23514';
    end if;
  elsif old_state = processing_state and new_state = initial_state then
    if old.attempts >= old.max_attempts then
      raise exception 'AstroDiary retry exhaustion requires terminal quarantine'
        using errcode = '23514';
    end if;
    if new.claim_fence <> old.claim_fence or new.attempts <> old.attempts
      or new.next_attempt_at is null or new.last_failure_code is null then
      raise exception 'AstroDiary retry transition lacks exact persisted evidence'
        using errcode = '23514';
    end if;
  elsif old_state = processing_state and new_state = processing_state then
    if old.lease_expires_at > statement_timestamp()
      or new.claim_fence <> old.claim_fence + 1 or new.attempts <> old.attempts + 1 then
      raise exception 'AstroDiary expired claim recovery requires a new fence and attempt'
        using errcode = '23514';
    end if;
  elsif new.quarantined_at is not null then
    if old_state <> processing_state
      or new.claim_fence <> old.claim_fence or new.attempts <> old.attempts then
      raise exception 'AstroDiary async quarantine transition requires an active claim'
        using errcode = '23514';
    end if;
  elsif new_state = any(terminal_states) then
    if old_state = initial_state and new_state = any(direct_terminal_states) then
      if new.claim_fence <> old.claim_fence or new.attempts <> old.attempts then
        raise exception 'AstroDiary source invalidation is the only terminal transition allowed before claim'
          using errcode = '23514';
      end if;
    elsif old_state <> processing_state
      or new.claim_fence <> old.claim_fence or new.attempts <> old.attempts then
      raise exception 'AstroDiary worker terminal transition requires an active claim'
        using errcode = '23514';
    end if;
  else
    raise exception 'AstroDiary async command transition is invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function astro_diary_guard_media_authority_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'AstroDiary media authority is retained; transition it to deleted'
      using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    if new.state <> 'pending' then
      raise exception 'AstroDiary media authority must begin pending'
        using errcode = '23514';
    end if;
    return new;
  end if;
  if new.media_id is distinct from old.media_id
    or new.journal_id is distinct from old.journal_id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.purpose is distinct from old.purpose
    or new.visibility is distinct from old.visibility
    or new.created_at is distinct from old.created_at
    or new.updated_at < old.updated_at
    or not (
      (old.state = 'pending' and new.state in ('pending', 'ready', 'failed', 'deleted'))
      or (old.state = 'ready' and new.state in ('ready', 'bound', 'deleted'))
      or (old.state = 'bound' and new.state in ('bound', 'deleted'))
      or (old.state = 'failed' and new.state in ('failed', 'deleted'))
    ) then
    raise exception 'AstroDiary media authority identity or lifecycle transition is invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger astro_diary_journals_version_guard
before insert or update or delete on astro_diary_journals
for each row execute function astro_diary_guard_versioned_head();
create trigger astro_diary_cycles_version_guard
before insert or update or delete on astro_diary_cycles
for each row execute function astro_diary_guard_versioned_head();
create trigger astro_diary_response_obligations_version_guard
before insert or update or delete on astro_diary_response_obligations
for each row execute function astro_diary_guard_versioned_head();
create trigger astro_diary_drafts_version_guard
before insert or update or delete on astro_diary_drafts
for each row execute function astro_diary_guard_versioned_head();
create trigger astro_diary_context_snapshots_version_guard
before insert or update or delete on astro_diary_context_snapshots
for each row execute function astro_diary_guard_versioned_head();
create trigger astro_diary_read_cursors_version_guard
before insert or update or delete on astro_diary_read_cursors
for each row execute function astro_diary_guard_versioned_head();
create trigger astro_diary_timeline_items_revision_guard
before insert or update or delete on astro_diary_timeline_items
for each row execute function astro_diary_guard_timeline_head();
create trigger astro_diary_entry_attachments_transition_guard
before update or delete on astro_diary_entry_attachments
for each row execute function astro_diary_guard_transition_head();
create trigger astro_diary_ai_commands_transition_guard
before insert or update or delete on astro_diary_ai_commands
for each row execute function astro_diary_guard_async_command_transition();
create trigger astro_diary_ai_attempts_transition_guard
before insert or update or delete on astro_diary_ai_attempts
for each row execute function astro_diary_guard_async_command_transition();
create trigger astro_diary_export_commands_transition_guard
before insert or update or delete on astro_diary_export_commands
for each row execute function astro_diary_guard_async_command_transition();
create trigger astro_diary_derivative_commands_transition_guard
before insert or update or delete on astro_diary_derivative_commands
for each row execute function astro_diary_guard_async_command_transition();
create trigger astro_diary_erasure_commands_transition_guard
before insert or update or delete on astro_diary_erasure_commands
for each row execute function astro_diary_guard_async_command_transition();
create trigger astro_diary_cascade_commands_transition_guard
before insert or update or delete on astro_diary_cascade_commands
for each row execute function astro_diary_guard_async_command_transition();
create trigger astro_diary_event_deliveries_transition_guard
before insert or update or delete on astro_diary_event_deliveries
for each row execute function astro_diary_guard_async_command_transition();
create trigger astro_diary_media_authorities_transition_guard
before insert or update or delete on astro_diary_media_authorities
for each row execute function astro_diary_guard_media_authority_transition();

create trigger astro_diary_timeline_item_revisions_immutable
before update or delete on astro_diary_timeline_item_revisions
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_timeline_revision_attachments_immutable
before update or delete on astro_diary_timeline_revision_attachments
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_draft_version_facts_immutable
before update or delete on astro_diary_draft_version_facts
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_context_invalidations_immutable
before update or delete on astro_diary_context_invalidations
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_context_displays_immutable
before update or delete on astro_diary_context_displays
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_context_display_transits_immutable
before update or delete on astro_diary_context_display_transits
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_context_display_personal_highlights_immutable
before update or delete on astro_diary_context_display_personal_highlights
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_media_access_revocations_immutable
before update or delete on astro_diary_media_access_revocations
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_journal_media_access_revocations_immutable
before update or delete on astro_diary_journal_media_access_revocations
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_item_read_access_revocations_immutable
before update or delete on astro_diary_item_read_access_revocations
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_events_immutable
before update or delete on astro_diary_events
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_realtime_events_immutable
before update or delete on astro_diary_realtime_events
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_cascade_targets_immutable
before update or delete on astro_diary_cascade_targets
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_command_receipts_immutable
before update or delete on astro_diary_command_receipts
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_command_preconditions_immutable
before update or delete on astro_diary_command_preconditions
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_command_event_receipts_immutable
before update or delete on astro_diary_command_event_receipts
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_event_application_receipts_immutable
before update or delete on astro_diary_event_application_receipts
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_erasure_decision_facts_immutable
before update or delete on astro_diary_erasure_decision_facts
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_derivative_redaction_receipts_immutable
before update or delete on astro_diary_derivative_redaction_receipts
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_cascade_receipts_immutable
before update or delete on astro_diary_cascade_receipts
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_ai_drafts_immutable
before update or delete on astro_diary_ai_drafts
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_response_obligation_weekdays_immutable
before update or delete on astro_diary_response_obligation_weekdays
for each row execute function astro_diary_guard_immutable_evidence();
create trigger astro_diary_cycle_opening_allowance_facts_immutable
before update or delete on astro_diary_cycle_opening_allowance_facts
for each row execute function astro_diary_guard_immutable_evidence();
`;

/**
 * The UoW may insert a head, its revision, attachments, events and receipts in any deterministic
 * order. These checks therefore run at commit, after the complete write-set is visible, and lock
 * the journal parent before reading children.
 */
export const astroDiaryDeferredGraphIntegritySql = `
create or replace function astro_diary_validate_media_asset_authority()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  target_media_id uuid;
begin
  if tg_table_name = 'media_assets' then
    target_media_id := coalesce(new.id, old.id);
  else
    target_media_id := coalesce(new.media_id, old.media_id);
  end if;
  if target_media_id is null then return null; end if;

  if exists (
    select 1 from astro_diary_media_authorities authority
    left join media_assets media
      on media.id = authority.media_id
     and media.owner_user_id = authority.owner_user_id
     and media.purpose = authority.purpose
     and media.visibility = 'private'
     and (
       (authority.state = 'pending' and media.status in ('uploading', 'processing'))
       or (authority.state in ('ready', 'bound') and media.status = 'ready')
       or (authority.state = 'failed' and media.status = 'failed')
       or (authority.state = 'deleted' and media.status = 'deleted')
     )
   where authority.media_id = target_media_id and media.id is null
  ) then
    raise exception 'AstroDiary media authority differs from its exact private generic asset'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from media_assets media
    left join astro_diary_media_authorities authority
      on authority.media_id = media.id
     and authority.owner_user_id = media.owner_user_id
     and authority.purpose = media.purpose
     and authority.visibility = media.visibility
   where media.id = target_media_id
     and media.purpose in ('astro_diary_attachment', 'astro_diary_voice')
     and media.visibility = 'private'
     and authority.media_id is null
  ) then
    raise exception 'AstroDiary generic Diary asset lacks its exact journal authority'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create or replace function astro_diary_validate_journal_graph()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  target_journal_id uuid;
  journal_row astro_diary_journals%rowtype;
begin
  if tg_table_name = 'astro_diary_journals' then
    target_journal_id := coalesce(new.id, old.id);
  elsif tg_table_name in (
    'astro_diary_cycles', 'astro_diary_cycle_opening_allowance_facts',
    'astro_diary_response_obligations',
    'astro_diary_timeline_items', 'astro_diary_timeline_item_revisions',
    'astro_diary_timeline_revision_attachments', 'astro_diary_drafts',
    'astro_diary_draft_version_facts',
    'astro_diary_draft_attachments', 'astro_diary_media_authorities',
    'astro_diary_entry_attachments',
    'astro_diary_media_access_revocations', 'astro_diary_journal_media_access_revocations',
    'astro_diary_item_read_access_revocations', 'astro_diary_context_snapshots',
    'astro_diary_context_displays', 'astro_diary_context_display_transits',
    'astro_diary_context_display_personal_highlights',
    'astro_diary_context_invalidations', 'astro_diary_read_cursors',
    'astro_diary_events', 'astro_diary_realtime_events', 'astro_diary_ai_commands', 'astro_diary_ai_drafts',
    'astro_diary_export_commands', 'astro_diary_derivative_commands',
    'astro_diary_erasure_commands', 'astro_diary_cascade_commands',
    'astro_diary_cascade_targets', 'astro_diary_cascade_receipts',
    'astro_diary_erasure_decision_facts',
    'astro_diary_command_receipts', 'astro_diary_command_preconditions',
    'astro_diary_command_event_receipts', 'astro_diary_event_application_receipts'
  ) then
    target_journal_id := coalesce(new.journal_id, old.journal_id);
  elsif tg_table_name = 'astro_diary_response_obligation_weekdays' then
    select obligation.journal_id into target_journal_id
      from astro_diary_response_obligations obligation
     where obligation.id = coalesce(new.obligation_id, old.obligation_id);
  elsif tg_table_name = 'astro_diary_ai_attempts' then
    select command.journal_id into target_journal_id
      from astro_diary_ai_commands command
     where command.id = coalesce(new.command_id, old.command_id);
  elsif tg_table_name = 'astro_diary_derivative_redaction_receipts' then
    select command.journal_id into target_journal_id
      from astro_diary_erasure_commands command
     where command.id = coalesce(new.command_id, old.command_id);
  end if;

  if target_journal_id is null then return null; end if;
  select * into journal_row from astro_diary_journals
   where id = target_journal_id for update;
  if not found then return null; end if;

  if not exists (
    select 1 from client_subscriptions subscription
     where subscription.journal_epoch_id = journal_row.journal_epoch_id
       and subscription.relationship_id = journal_row.relationship_id
  ) then
    raise exception 'AstroDiary journal epoch is not bound to its relationship'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_cycles cycle
    left join client_subscription_periods period on period.id = cycle.opening_period_id
    left join client_subscriptions subscription
      on subscription.id = period.subscription_id
     and subscription.journal_epoch_id = journal_row.journal_epoch_id
     and subscription.relationship_id = journal_row.relationship_id
   where cycle.journal_id = target_journal_id and subscription.id is null
  ) then
    raise exception 'AstroDiary cycle opening period has a cross-journal epoch reference'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_cycles cycle
    left join astro_diary_cycle_opening_allowance_facts fact
      on fact.cycle_id = cycle.id
     and fact.journal_id = cycle.journal_id
     and fact.opening_period_id = cycle.opening_period_id
     and fact.recorded_at = cycle.opened_at
    where cycle.journal_id = target_journal_id
      and (fact.cycle_id is null
        or (fact.opening_allowance_reservation_id is not null
          and (fact.opening_allowance_consumption_id is not null
            or (cycle.state = 'awaiting_client_entry'
              and cycle.opening_allowance_reservation_id is distinct from fact.opening_allowance_reservation_id)
            or (cycle.state <> 'awaiting_client_entry'
              and cycle.opening_allowance_reservation_id is not null)))
        or (fact.opening_allowance_consumption_id is not null
          and (fact.opening_allowance_reservation_id is not null
            or cycle.opening_allowance_reservation_id is not null)))
  ) then
    raise exception 'AstroDiary cycle lacks its exact immutable opening allowance fact'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_timeline_items item
     where item.journal_id = target_journal_id
       and ((item.author_role = 'client' and item.author_user_id <> journal_row.client_user_id)
         or (item.author_role = 'astrologer' and item.author_user_id <> journal_row.astrologer_user_id))
  ) or exists (
    select 1 from astro_diary_drafts draft
     where draft.journal_id = target_journal_id
       and ((draft.author_role = 'client' and draft.author_user_id <> journal_row.client_user_id)
         or (draft.author_role = 'astrologer' and draft.author_user_id <> journal_row.astrologer_user_id))
  ) then
    raise exception 'AstroDiary author role does not match journal pair'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_media_authorities authority
   where authority.journal_id = target_journal_id
     and authority.owner_user_id not in (journal_row.client_user_id, journal_row.astrologer_user_id)
  ) then
    raise exception 'AstroDiary media authority owner is not a journal participant'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_media_authorities authority
    left join astro_diary_timeline_items item
      on item.id = authority.bound_item_id
     and item.journal_id = authority.journal_id
     and item.author_user_id = authority.owner_user_id
   where authority.journal_id = target_journal_id
     and authority.state = 'bound' and item.id is null
  ) then
    raise exception 'AstroDiary bound media authority has a cross-journal item or author'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_drafts draft
    left join astro_diary_draft_version_facts fact
      on fact.draft_id = draft.id
     and fact.journal_id = draft.journal_id
     and fact.version = draft.version
     and fact.recorded_at = draft.updated_at
   where draft.journal_id = target_journal_id and fact.draft_id is null
  ) or exists (
    select 1 from astro_diary_drafts draft
   where draft.journal_id = target_journal_id
     and (select count(*) from astro_diary_draft_version_facts fact
           where fact.draft_id = draft.id and fact.journal_id = draft.journal_id)
       <> draft.version
  ) then
    raise exception 'AstroDiary draft head lacks its contiguous immutable version facts'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_cycles cycle
    left join astro_diary_timeline_items prompt
      on prompt.id = cycle.awaiting_client_prompt_item_id
     and prompt.journal_id = cycle.journal_id
     and prompt.cycle_id = cycle.id
     and prompt.kind = 'reflection_prompt'
     and prompt.author_role = 'astrologer'
   where cycle.journal_id = target_journal_id
     and cycle.awaiting_client_prompt_item_id is not null
     and prompt.id is null
  ) then
    raise exception 'AstroDiary cycle prompt has a cross-journal reference or invalid role'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_response_obligations obligation
    left join astro_diary_timeline_items trigger_item
      on trigger_item.id = obligation.trigger_item_id
     and trigger_item.journal_id = obligation.journal_id
     and trigger_item.cycle_id = obligation.cycle_id
     and trigger_item.author_role = 'client'
    left join astro_diary_timeline_items response_item
      on response_item.id = obligation.satisfied_by_item_id
     and response_item.journal_id = obligation.journal_id
     and response_item.cycle_id = obligation.cycle_id
     and response_item.author_role = 'astrologer'
   where obligation.journal_id = target_journal_id
     and (trigger_item.id is null
       or (obligation.satisfied_by_item_id is not null and response_item.id is null))
  ) then
    raise exception 'AstroDiary obligation has a cross-journal reference or invalid participant'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_cycles cycle
   where cycle.journal_id = target_journal_id
     and cycle.client_response_timezone is not null
     and not exists (
       select 1 from pg_timezone_names zone where zone.name = cycle.client_response_timezone
     )
  ) or exists (
    select 1 from astro_diary_response_obligations obligation
   where obligation.journal_id = target_journal_id
     and not exists (
       select 1 from pg_timezone_names zone where zone.name = obligation.service_timezone
     )
  ) then
    raise exception 'AstroDiary deadline evidence uses an unknown IANA timezone'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_response_obligations obligation
   where obligation.journal_id = target_journal_id
     and (select count(*) from astro_diary_response_obligation_weekdays weekday
           where weekday.obligation_id = obligation.id) not between 1 and 7
  ) then
    raise exception 'AstroDiary working weekday evidence is incomplete'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_timeline_items item
    left join astro_diary_timeline_items corrected
      on corrected.id = item.corrects_item_id
     and corrected.journal_id = item.journal_id
     and corrected.cycle_id = item.cycle_id
     and corrected.author_user_id = item.author_user_id
   where item.journal_id = target_journal_id
     and item.corrects_item_id is not null and corrected.id is null
  ) or exists (
    select 1 from astro_diary_drafts draft
    left join astro_diary_timeline_items corrected
      on corrected.id = draft.corrects_item_id
     and corrected.journal_id = draft.journal_id
     and corrected.author_user_id = draft.author_user_id
   where draft.journal_id = target_journal_id
     and draft.corrects_item_id is not null and corrected.id is null
  ) then
    raise exception 'AstroDiary correction has a cross-journal reference or different author'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_timeline_items head
    left join lateral (
      select revision.* from astro_diary_timeline_item_revisions revision
       where revision.item_id = head.id
       order by revision.revision desc limit 1
    ) latest on true
   where head.journal_id = target_journal_id
     and (latest.item_id is null
       or latest.revision <> head.current_revision
       or latest.journal_id <> head.journal_id
       or latest.cycle_id <> head.cycle_id
       or latest.cursor <> head.cursor
       or latest.kind is distinct from head.kind
       or latest.original_kind is distinct from head.original_kind
       or latest.author_role is distinct from head.author_role
       or latest.author_user_id is distinct from head.author_user_id
       or latest.body is distinct from head.body
       or latest.mood_id is distinct from head.mood_id
       or latest.context_status is distinct from head.context_status
       or latest.corrects_item_id is distinct from head.corrects_item_id
       or latest.tombstone_reason is distinct from head.tombstone_reason
       or latest.edited_at is distinct from head.edited_at
       or latest.occurred_at is distinct from head.occurred_at
       or (select count(*) from astro_diary_timeline_item_revisions all_revisions
            where all_revisions.item_id = head.id) <> head.current_revision)
  ) then
    raise exception 'AstroDiary timeline head does not match latest revision'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_timeline_item_revisions revision
    join astro_diary_timeline_items head on head.id = revision.item_id
   where revision.journal_id = target_journal_id
     and (revision.journal_id <> head.journal_id
       or revision.cycle_id <> head.cycle_id
       or revision.cursor <> head.cursor
       or revision.author_role <> head.author_role
       or revision.author_user_id <> head.author_user_id
       or revision.occurred_at <> head.occurred_at)
  ) then
    raise exception 'AstroDiary published revision identity differs from its immutable item head'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_entry_attachments attachment
    join astro_diary_timeline_items item
      on item.id = attachment.item_id and item.journal_id = attachment.journal_id
    left join media_assets media
      on media.id = attachment.media_id
     and media.owner_user_id = attachment.owner_user_id
     and media.purpose = attachment.purpose
     and media.visibility = 'private'
     and media.status = 'ready'
    left join astro_diary_media_authorities authority
      on authority.media_id = attachment.media_id
     and authority.journal_id = attachment.journal_id
     and authority.owner_user_id = attachment.owner_user_id
     and authority.purpose = attachment.purpose
     and authority.state = 'bound'
     and authority.bound_item_id = attachment.item_id
   where attachment.journal_id = target_journal_id
     and (item.author_user_id <> attachment.owner_user_id
       or media.id is null or authority.media_id is null)
  ) then
    raise exception 'AstroDiary media binding is not private and ready for its exact author/purpose'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_draft_attachments attachment
    join astro_diary_drafts draft
      on draft.id = attachment.draft_id and draft.journal_id = attachment.journal_id
    left join media_assets media
      on media.id = attachment.media_id
     and media.owner_user_id = attachment.owner_user_id
     and media.purpose = attachment.purpose
     and media.visibility = 'private'
     and media.status = 'ready'
    left join astro_diary_media_authorities authority
      on authority.media_id = attachment.media_id
     and authority.journal_id = attachment.journal_id
     and authority.owner_user_id = attachment.owner_user_id
     and authority.purpose = attachment.purpose
     and authority.state = 'ready'
   where attachment.journal_id = target_journal_id
     and (draft.author_user_id <> attachment.owner_user_id
       or media.id is null or authority.media_id is null)
  ) then
    raise exception 'AstroDiary draft media binding is not private and ready for its exact author'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_journal_media_access_revocations revocation
    left join astro_diary_media_authorities authority
      on authority.media_id = revocation.media_id
     and authority.journal_id = revocation.journal_id
   where revocation.journal_id = target_journal_id and authority.media_id is null
  ) then
    raise exception 'AstroDiary journal media revocation has a cross-journal reference'
      using errcode = '23514';
  end if;

  if (journal_row.state = 'active' and exists (
    select 1 from astro_diary_journal_media_access_revocations revocation
     where revocation.journal_id = target_journal_id
  )) or (journal_row.state in ('erasing', 'erased') and exists (
    select 1 from astro_diary_media_authorities authority
     where authority.journal_id = target_journal_id
       and authority.state <> 'deleted'
       and not exists (
         select 1 from astro_diary_journal_media_access_revocations revocation
          where revocation.media_id = authority.media_id
            and revocation.journal_id = authority.journal_id
       )
  )) then
    raise exception 'AstroDiary journal media revocation set is not exact for live journal authorities'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_timeline_revision_attachments revision_attachment
    left join astro_diary_entry_attachments binding
      on binding.media_id = revision_attachment.media_id
     and binding.item_id = revision_attachment.item_id
     and binding.journal_id = revision_attachment.journal_id
   where revision_attachment.journal_id = target_journal_id and binding.media_id is null
  ) or exists (
    select 1 from astro_diary_entry_attachments binding
   where binding.journal_id = target_journal_id
     and not exists (
       select 1 from astro_diary_timeline_revision_attachments revision_attachment
        where revision_attachment.media_id = binding.media_id
          and revision_attachment.item_id = binding.item_id
          and revision_attachment.journal_id = binding.journal_id
     )
  ) then
    raise exception 'AstroDiary attachment has a cross-journal reference or missing revision binding'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_context_snapshots snapshot
    left join astro_diary_timeline_item_revisions source
      on source.item_id = snapshot.item_id
     and source.revision = snapshot.source_item_revision
     and source.journal_id = snapshot.journal_id
     and source.source_digest = snapshot.source_item_digest
   where snapshot.journal_id = target_journal_id and source.item_id is null
  ) then
    raise exception 'AstroDiary context snapshot has a cross-journal reference or stale digest'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_context_snapshots snapshot
    left join astro_diary_context_displays display
      on display.context_id = snapshot.id
     and display.context_version = snapshot.version
     and display.journal_id = snapshot.journal_id
   where snapshot.journal_id = target_journal_id
     and ((snapshot.status in ('global_only', 'personal') and display.context_id is null)
       or (snapshot.status not in ('global_only', 'personal') and display.context_id is not null))
  ) then
    raise exception 'AstroDiary calculated context and immutable display evidence differ'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_context_displays display
    join astro_diary_context_snapshots snapshot
      on snapshot.id = display.context_id
     and snapshot.version = display.context_version
     and snapshot.journal_id = display.journal_id
   where display.journal_id = target_journal_id
     and (display.source_context_digest <> snapshot.context_digest
       or (snapshot.status = 'personal'
         and display.birth_profile_revision is distinct from snapshot.birth_profile_revision)
       or (snapshot.status = 'global_only' and display.birth_profile_revision is not null)
       or (snapshot.status = 'global_only' and exists (
         select 1 from astro_diary_context_display_personal_highlights highlight
          where highlight.context_id = display.context_id
            and highlight.context_version = display.context_version
       ))
       or (select count(*) from astro_diary_context_display_transits transit
            where transit.context_id = display.context_id
              and transit.context_version = display.context_version)
          <> coalesce((select max(transit.ordinal) + 1
                         from astro_diary_context_display_transits transit
                        where transit.context_id = display.context_id
                          and transit.context_version = display.context_version), 0)
       or (select count(*) from astro_diary_context_display_personal_highlights highlight
            where highlight.context_id = display.context_id
              and highlight.context_version = display.context_version)
          <> coalesce((select max(highlight.ordinal) + 1
                         from astro_diary_context_display_personal_highlights highlight
                        where highlight.context_id = display.context_id
                          and highlight.context_version = display.context_version), 0))
  ) then
    raise exception 'AstroDiary context display has stale digest, version, or personal evidence'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_read_cursors cursor_row
   where cursor_row.journal_id = target_journal_id
     and cursor_row.participant_user_id not in (
       journal_row.client_user_id, journal_row.astrologer_user_id
     )
  ) then
    raise exception 'AstroDiary read cursor participant does not match journal pair'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_read_cursors cursor_row
   where cursor_row.journal_id = target_journal_id
     and cursor_row.last_read_cursor > coalesce((
       select max(item.cursor) from astro_diary_timeline_items item
        where item.journal_id = target_journal_id
     ), 0)
  ) then
    raise exception 'AstroDiary read cursor cannot advance beyond the server cursor'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_events event
    left join astro_diary_cycles cycle
      on cycle.id = event.cycle_id and cycle.journal_id = event.journal_id
    left join astro_diary_timeline_items item
      on item.id = event.item_id and item.journal_id = event.journal_id
    left join astro_diary_context_snapshots context
      on context.id = event.context_id and context.journal_id = event.journal_id
    left join astro_diary_response_obligations obligation
      on obligation.id = event.obligation_id and obligation.journal_id = event.journal_id
    left join astro_diary_timeline_items response_item
      on response_item.id = event.response_item_id and response_item.journal_id = event.journal_id
    left join astro_diary_ai_commands ai_command
      on ai_command.id = event.command_id and ai_command.journal_id = event.journal_id
    left join astro_diary_export_commands export_command
      on export_command.id = event.command_id and export_command.journal_id = event.journal_id
    left join astro_diary_erasure_commands erasure_command
      on erasure_command.id = event.command_id and erasure_command.journal_id = event.journal_id
   where event.journal_id = target_journal_id
     and (event.journal_epoch_id <> journal_row.journal_epoch_id
       or (event.cycle_id is not null and cycle.id is null)
       or (event.item_id is not null and item.id is null)
       or (event.context_id is not null and context.id is null)
       or (event.obligation_id is not null and obligation.id is null)
       or (event.response_item_id is not null and response_item.id is null)
       or (event.event_type in (
         'astro_diary.ai_generation_requested.v1', 'astro_diary.ai_updated.v1'
       ) and ai_command.id is null)
       or (event.event_type in (
         'astro_diary.export_requested.v1', 'astro_diary.export_ready.v1',
         'astro_diary.export_failed.v1', 'astro_diary.export_invalidated.v1'
       ) and export_command.id is null)
       or (event.event_type in (
         'astro_diary.erasure_requested.v1', 'astro_diary.erasure_completed.v1'
       ) and erasure_command.id is null))
  ) then
    raise exception 'AstroDiary canonical event has a cross-journal reference'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_events event
    join astro_diary_timeline_items item
      on item.id = event.item_id and item.journal_id = event.journal_id
   where event.journal_id = target_journal_id
     and event.event_type in (
       'astro_diary.timeline_item_edited.v1', 'astro_diary.timeline_item_hidden.v1',
       'astro_diary.timeline_item_erased.v1'
     )
     and not exists (
       select 1 from astro_diary_events later
        where later.journal_id = event.journal_id and later.item_id = event.item_id
          and later.event_type in (
            'astro_diary.timeline_item_edited.v1', 'astro_diary.timeline_item_hidden.v1',
            'astro_diary.timeline_item_erased.v1'
          )
          and (later.occurred_at, later.event_id) > (event.occurred_at, event.event_id)
     )
     and not (
       (event.event_type = 'astro_diary.timeline_item_edited.v1'
         and item.current_revision > 1 and item.kind <> 'tombstone')
       or (event.event_type = 'astro_diary.timeline_item_hidden.v1'
         and item.kind = 'tombstone' and item.tombstone_reason = 'hidden_by_author')
       or (event.event_type = 'astro_diary.timeline_item_erased.v1'
         and item.kind = 'tombstone' and item.tombstone_reason = 'content_erased')
     )
  ) or exists (
    select 1 from astro_diary_events event
    join astro_diary_context_snapshots context
      on context.id = event.context_id and context.journal_id = event.journal_id
   where event.journal_id = target_journal_id
     and event.event_type in ('astro_diary.context_completed.v1', 'astro_diary.context_failed.v1')
     and not exists (
       select 1 from astro_diary_events later
        where later.journal_id = event.journal_id and later.context_id = event.context_id
          and later.event_type in ('astro_diary.context_completed.v1', 'astro_diary.context_failed.v1')
          and (later.occurred_at, later.event_id) > (event.occurred_at, event.event_id)
     )
     and not (
       (event.event_type = 'astro_diary.context_completed.v1'
         and context.status in ('global_only', 'personal'))
       or (event.event_type = 'astro_diary.context_failed.v1'
         and context.status in ('failed', 'source_stale'))
     )
  ) or exists (
    select 1 from astro_diary_events event
    join astro_diary_ai_commands command
      on command.id = event.command_id and command.journal_id = event.journal_id
   where event.journal_id = target_journal_id
     and event.event_type = 'astro_diary.ai_updated.v1'
     and command.state not in (
       'succeeded', 'known_failed', 'outcome_unknown', 'source_stale', 'cancelled', 'quarantined'
     )
  ) or exists (
    select 1 from astro_diary_ai_commands command
   where command.journal_id = target_journal_id
     and command.state in (
       'succeeded', 'known_failed', 'outcome_unknown', 'source_stale', 'cancelled', 'quarantined'
     )
     and (select count(*) from astro_diary_events event
           where event.journal_id = command.journal_id
             and event.cycle_id = command.cycle_id
             and event.command_id = command.id
             and event.event_type = 'astro_diary.ai_updated.v1') <> 1
  ) or exists (
    select 1 from astro_diary_events event
    join astro_diary_export_commands command
      on command.id = event.command_id and command.journal_id = event.journal_id
   where event.journal_id = target_journal_id
     and event.event_type in (
       'astro_diary.export_ready.v1', 'astro_diary.export_failed.v1',
       'astro_diary.export_invalidated.v1'
     )
     and not exists (
       select 1 from astro_diary_events later
        where later.journal_id = event.journal_id and later.command_id = event.command_id
          and later.event_type in (
            'astro_diary.export_ready.v1', 'astro_diary.export_failed.v1',
            'astro_diary.export_invalidated.v1'
          )
          and (later.occurred_at, later.event_id) > (event.occurred_at, event.event_id)
     )
     and command.status <> case event.event_type
       when 'astro_diary.export_ready.v1' then 'ready'
       when 'astro_diary.export_failed.v1' then 'failed'
       else 'invalidated'
     end
  ) or exists (
    select 1 from astro_diary_events event
    join astro_diary_erasure_commands command
      on command.id = event.command_id and command.journal_id = event.journal_id
   where event.journal_id = target_journal_id
     and event.event_type = 'astro_diary.erasure_completed.v1'
     and command.state <> 'completed'
  ) or exists (
    select 1 from astro_diary_events event
   where event.journal_id = target_journal_id
     and event.event_type = 'astro_diary.journal_activated.v1'
     and event.occurred_at <> journal_row.created_at
  ) then
    raise exception 'AstroDiary canonical state event does not match authoritative state'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_realtime_events event
    left join astro_diary_events source
      on source.event_id = event.source_event_id and source.journal_id = event.journal_id
    left join astro_diary_cycles cycle
      on cycle.id = event.cycle_id and cycle.journal_id = event.journal_id
    left join astro_diary_timeline_items item
      on item.id = event.item_id and item.journal_id = event.journal_id
    left join astro_diary_response_obligations obligation
      on obligation.id = event.obligation_id and obligation.journal_id = event.journal_id
    left join astro_diary_context_snapshots context
      on context.id = event.context_id and context.journal_id = event.journal_id
   where event.journal_id = target_journal_id
     and (source.event_id is null
       or (event.cycle_id is not null and cycle.id is null)
       or (event.item_id is not null and item.id is null)
       or (event.obligation_id is not null and obligation.id is null)
       or (event.context_id is not null and context.id is null)
       or not (
         (source.event_type in ('astro_diary.cycle_opened.v1', 'astro_diary.cycle_closed.v1')
           and event.type = 'cycle.updated'
           and event.cycle_id = source.cycle_id
           and event.item_id is null and event.obligation_id is null
           and event.context_id is null and event.command_id is null)
         or (source.event_type = 'astro_diary.timeline_item_published.v1'
           and event.type = 'timeline.item.published'
           and event.cycle_id = source.cycle_id and event.item_id = source.item_id
           and event.obligation_id is null and event.context_id is null
           and event.command_id is null)
         or (source.event_type = 'astro_diary.timeline_item_edited.v1'
           and event.type = 'timeline.item.updated'
           and event.cycle_id = source.cycle_id and event.item_id = source.item_id
           and event.obligation_id is null and event.context_id is null
           and event.command_id is null)
         or (source.event_type in (
             'astro_diary.timeline_item_hidden.v1', 'astro_diary.timeline_item_erased.v1'
           )
           and event.type = 'timeline.item.erased'
           and event.cycle_id = source.cycle_id and event.item_id = source.item_id
           and event.obligation_id is null and event.context_id is null
           and event.command_id is null)
         or (source.event_type in (
             'astro_diary.response_obligation_created.v1',
             'astro_diary.response_obligation_satisfied.v1',
             'astro_diary.response_obligation_overdue.v1'
           )
           and event.type = 'obligation.updated'
           and event.cycle_id = source.cycle_id
           and event.obligation_id = source.obligation_id
           and event.item_id is null and event.context_id is null
           and event.command_id is null)
         or (source.event_type in (
             'astro_diary.context_completed.v1', 'astro_diary.context_failed.v1'
           )
           and event.type = 'context.updated'
           and event.cycle_id = source.cycle_id and event.item_id = source.item_id
           and event.context_id = source.context_id and event.obligation_id is null
           and event.command_id is null)
         or (source.event_type = 'astro_diary.ai_updated.v1'
           and event.type = 'ai.updated'
           and event.cycle_id = source.cycle_id and event.command_id = source.command_id
           and event.item_id is null and event.obligation_id is null
           and event.context_id is null)
         or (source.event_type in (
             'astro_diary.export_ready.v1', 'astro_diary.export_failed.v1',
             'astro_diary.export_invalidated.v1'
           )
           and event.type = 'export.updated' and event.command_id = source.command_id
           and event.cycle_id is null and event.item_id is null
           and event.obligation_id is null and event.context_id is null)
         or (source.event_type = 'astro_diary.erasure_completed.v1'
           and event.type = 'erasure.updated' and event.command_id = source.command_id
           and event.cycle_id is null and event.item_id is null
           and event.obligation_id is null and event.context_id is null)
         or (source.event_type = 'astro_diary.journal_activated.v1'
           and event.type = 'journal.updated'
           and event.cycle_id is null and event.item_id is null
           and event.obligation_id is null and event.context_id is null
           and event.command_id is null)
       ))
  ) then
    raise exception 'AstroDiary realtime projection type does not exactly map its canonical visible event'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_realtime_events event
   where event.journal_id = target_journal_id
     and (select count(*) from astro_diary_event_application_receipts receipt
           where receipt.consumer = 'realtime_projection'
             and receipt.source_event_id = event.source_event_id
             and receipt.source_event_type = (
               select source.event_type from astro_diary_events source
                where source.event_id = event.source_event_id
             )
             and receipt.journal_id = event.journal_id
             and receipt.result_kind = 'applied'
             and receipt.result_code is null) <> 1
  ) then
    raise exception 'AstroDiary realtime projection lacks its exact application receipt'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_event_application_receipts receipt
    left join astro_diary_events source on source.event_id = receipt.source_event_id
    left join astro_diary_event_deliveries delivery
      on delivery.event_id = receipt.source_event_id and delivery.consumer = receipt.consumer
   where receipt.journal_id = target_journal_id
     and (source.event_id is null or delivery.id is null
       or source.journal_id <> receipt.journal_id
       or source.event_type <> receipt.source_event_type
       or source.event_digest <> receipt.source_event_digest)
  ) then
    raise exception 'AstroDiary application receipt source identity differs from its canonical event'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_ai_commands command
    left join astro_diary_timeline_item_revisions source
      on source.item_id = command.source_item_id
     and source.revision = command.source_item_revision
     and source.journal_id = command.journal_id
     and source.source_digest = command.source_digest
   where command.journal_id = target_journal_id
     and (command.requested_by_user_id <> journal_row.astrologer_user_id or source.item_id is null)
  ) then
    raise exception 'AstroDiary AI command authority or source binding is invalid'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_ai_commands command
    left join astro_diary_ai_drafts draft
      on draft.command_id = command.id
     and draft.journal_id = command.journal_id
     and draft.cycle_id = command.cycle_id
     and draft.source_digest = command.source_digest
   where command.journal_id = target_journal_id
     and ((command.state = 'succeeded' and (
       draft.id is null
       or (select count(*) from astro_diary_ai_attempts attempt
            where attempt.command_id = command.id
              and attempt.stage = 'generation' and attempt.state = 'succeeded') <> 1
       or (select count(*) from astro_diary_ai_attempts attempt
            where attempt.command_id = command.id
              and attempt.stage = 'review_refine' and attempt.state = 'succeeded') <> 1
     )) or (command.state <> 'succeeded' and draft.id is not null))
  ) then
    raise exception 'AstroDiary AI terminal command, attempts, and immutable draft differ'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_export_commands command
    left join media_assets media
      on media.id = command.artifact_media_id
     and media.owner_user_id = command.artifact_owner_user_id
     and media.owner_user_id = command.requested_by_user_id
     and media.purpose = 'astro_diary_export_pdf'
     and media.visibility = 'private'
     and media.status = 'ready'
   where command.journal_id = target_journal_id
     and (command.requested_by_user_id not in (
       journal_row.client_user_id, journal_row.astrologer_user_id
     ) or (command.status = 'ready' and media.id is null))
  ) then
    raise exception 'AstroDiary export artifact is not a private ready PDF owned by its requester'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_erasure_commands command
    left join astro_diary_timeline_item_revisions source
      on command.target_type = 'item'
     and source.item_id = command.target_id
     and source.revision = command.source_version
     and source.journal_id = command.journal_id
     and source.source_digest = command.source_digest
    left join astro_diary_derivative_commands derivative
      on derivative.id = command.derivative_command_id
     and derivative.journal_id = command.journal_id
     and derivative.item_id = command.target_id
     and derivative.source_revision = command.source_version
     and derivative.source_digest = command.source_digest
     and derivative.operation = 'redact'
   where command.journal_id = target_journal_id
     and command.target_type = 'item'
     and (source.item_id is null or derivative.id is null)
  ) then
    raise exception 'AstroDiary erasure command has a cross-journal reference or stale source'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_erasure_commands command
   where command.journal_id = target_journal_id
     and command.target_type = 'item' and command.state = 'completed'
     and (
       (select count(*) from astro_diary_derivative_redaction_receipts receipt
         where receipt.command_id = command.id and receipt.target = 'source') <> 1
       or (select count(*) from astro_diary_derivative_redaction_receipts receipt
            where receipt.command_id = command.id and receipt.target = 'derivative') <> 1
       or exists (
         select 1 from astro_diary_timeline_revision_attachments attachment
          where attachment.item_id = command.target_id
            and attachment.revision = command.source_version
            and attachment.journal_id = command.journal_id
            and not exists (
              select 1 from astro_diary_derivative_redaction_receipts receipt
               where receipt.command_id = command.id
                 and receipt.target = 'media'
                 and receipt.media_id = attachment.media_id
            )
       )
       or exists (
         select 1 from astro_diary_derivative_redaction_receipts receipt
          where receipt.command_id = command.id and receipt.target = 'media'
            and not exists (
              select 1 from astro_diary_timeline_revision_attachments attachment
               where attachment.item_id = command.target_id
                 and attachment.revision = command.source_version
                 and attachment.journal_id = command.journal_id
                 and attachment.media_id = receipt.media_id
            )
       )
     )
  ) then
    raise exception 'AstroDiary completed item erasure lacks its exact redaction receipt set'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_erasure_commands command
    left join astro_diary_cascade_commands cascade
      on cascade.cascade_request_id = command.cascade_request_id
     and cascade.journal_id = command.journal_id
   where command.journal_id = target_journal_id
     and command.target_type = 'journal' and cascade.cascade_request_id is null
  ) then
    raise exception 'AstroDiary journal erasure command lacks its same-journal cascade'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_erasure_commands command
    left join astro_diary_cascade_commands cascade
      on cascade.cascade_request_id = command.cascade_request_id
     and cascade.journal_id = command.journal_id
     and cascade.state = 'completed'
   where command.journal_id = target_journal_id
     and command.target_type = 'journal' and command.state = 'completed'
     and (journal_row.state <> 'erased' or cascade.cascade_request_id is null
       or exists (
         select required.subsystem from unnest(array[
           'timeline_revision', 'derivative', 'transcript', 'extraction',
           'embedding', 'ai_draft', 'export', 'media'
         ]) as required(subsystem)
         where not exists (
           select 1 from astro_diary_cascade_targets target
            where target.cascade_request_id = cascade.cascade_request_id
              and target.journal_id = cascade.journal_id
              and target.subsystem = required.subsystem
         )
       )
       or (select count(*) from astro_diary_cascade_targets target
            where target.cascade_request_id = cascade.cascade_request_id
              and target.journal_id = cascade.journal_id)
          <> (select count(*) from astro_diary_cascade_receipts receipt
               where receipt.cascade_request_id = cascade.cascade_request_id
                 and receipt.journal_id = cascade.journal_id))
  ) then
    raise exception 'AstroDiary completed journal erasure lacks its exact cascade target receipt set'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_command_receipts receipt
   where receipt.journal_id = target_journal_id
     and (select count(*) from astro_diary_command_preconditions precondition
           where precondition.journal_id = receipt.journal_id
             and precondition.idempotency_key = receipt.idempotency_key
             and precondition.aggregate = 'journal'
             and precondition.aggregate_id = receipt.journal_id) <> 1
  ) then
    raise exception 'AstroDiary command receipt lacks its exact journal CAS precondition'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_command_receipts receipt
    left join astro_diary_draft_version_facts fact
      on fact.draft_id = receipt.result_resource_id
     and fact.version = receipt.result_resource_version
     and fact.journal_id = receipt.journal_id
   where receipt.journal_id = target_journal_id
     and receipt.result_resource_type = 'draft'
     and fact.draft_id is null
  ) then
    raise exception 'AstroDiary command draft result lacks its exact immutable version fact'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_command_event_receipts receipt_event
    join astro_diary_events event on event.event_id = receipt_event.event_id
   where receipt_event.journal_id = target_journal_id
     and event.journal_id <> receipt_event.journal_id
  ) then
    raise exception 'AstroDiary command receipt event has a cross-journal reference'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_command_receipts receipt
   where receipt.journal_id = target_journal_id
     and ((select count(*) from astro_diary_command_event_receipts event_receipt
            where event_receipt.journal_id = receipt.journal_id
              and event_receipt.idempotency_key = receipt.idempotency_key)
       <> coalesce((select max(event_receipt.ordinal) + 1
                      from astro_diary_command_event_receipts event_receipt
                     where event_receipt.journal_id = receipt.journal_id
                       and event_receipt.idempotency_key = receipt.idempotency_key), 0)
       or (receipt.outcome = 'rejected' and exists (
         select 1 from astro_diary_command_event_receipts event_receipt
          where event_receipt.journal_id = receipt.journal_id
            and event_receipt.idempotency_key = receipt.idempotency_key
       )))
  ) then
    raise exception 'AstroDiary command event receipt ordinals are not contiguous'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_erasure_decision_facts fact
    left join astro_diary_cycles cycle
      on cycle.id = fact.cycle_id and cycle.journal_id = fact.journal_id
    left join astro_diary_response_obligations obligation
      on obligation.id = fact.obligation_id and obligation.journal_id = fact.journal_id
   where fact.journal_id = target_journal_id
     and ((fact.relationship_id is not null and fact.relationship_id <> journal_row.relationship_id)
       or (fact.journal_epoch_id is not null and fact.journal_epoch_id <> journal_row.journal_epoch_id)
       or (fact.cycle_id is not null and cycle.id is null)
       or (fact.obligation_id is not null and obligation.id is null))
  ) then
    raise exception 'AstroDiary erasure decision fact has a cross-journal reference'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger astro_diary_journals_graph_integrity
after insert or update or delete on astro_diary_journals
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_cycles_graph_integrity
after insert or update or delete on astro_diary_cycles
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_cycle_opening_allowance_facts_graph_integrity
after insert or update or delete on astro_diary_cycle_opening_allowance_facts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_obligations_graph_integrity
after insert or update or delete on astro_diary_response_obligations
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_response_obligation_weekdays_graph_integrity
after insert or update or delete on astro_diary_response_obligation_weekdays
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_timeline_items_graph_integrity
after insert or update or delete on astro_diary_timeline_items
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_timeline_revisions_graph_integrity
after insert or update or delete on astro_diary_timeline_item_revisions
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_timeline_revision_attachments_graph_integrity
after insert or update or delete on astro_diary_timeline_revision_attachments
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_drafts_graph_integrity
after insert or update or delete on astro_diary_drafts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_draft_version_facts_graph_integrity
after insert or update or delete on astro_diary_draft_version_facts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_draft_attachments_graph_integrity
after insert or update or delete on astro_diary_draft_attachments
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_media_authorities_graph_integrity
after insert or update or delete on astro_diary_media_authorities
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_entry_attachments_graph_integrity
after insert or update or delete on astro_diary_entry_attachments
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_media_access_revocations_graph_integrity
after insert or update or delete on astro_diary_media_access_revocations
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_journal_media_access_revocations_graph_integrity
after insert or update or delete on astro_diary_journal_media_access_revocations
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_item_read_access_revocations_graph_integrity
after insert or update or delete on astro_diary_item_read_access_revocations
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_context_snapshots_graph_integrity
after insert or update or delete on astro_diary_context_snapshots
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_context_displays_graph_integrity
after insert or update or delete on astro_diary_context_displays
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_context_display_transits_graph_integrity
after insert or update or delete on astro_diary_context_display_transits
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_context_display_personal_highlights_graph_integrity
after insert or update or delete on astro_diary_context_display_personal_highlights
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_context_invalidations_graph_integrity
after insert or update or delete on astro_diary_context_invalidations
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_read_cursors_graph_integrity
after insert or update or delete on astro_diary_read_cursors
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_events_graph_integrity
after insert or update or delete on astro_diary_events
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_realtime_events_graph_integrity
after insert or update or delete on astro_diary_realtime_events
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_ai_commands_graph_integrity
after insert or update or delete on astro_diary_ai_commands
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_ai_attempts_graph_integrity
after insert or update or delete on astro_diary_ai_attempts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_ai_drafts_graph_integrity
after insert or update or delete on astro_diary_ai_drafts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_export_commands_graph_integrity
after insert or update or delete on astro_diary_export_commands
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_erasure_commands_graph_integrity
after insert or update or delete on astro_diary_erasure_commands
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_derivative_commands_graph_integrity
after insert or update or delete on astro_diary_derivative_commands
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_derivative_redaction_receipts_graph_integrity
after insert or update or delete on astro_diary_derivative_redaction_receipts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_cascade_commands_graph_integrity
after insert or update or delete on astro_diary_cascade_commands
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_cascade_targets_graph_integrity
after insert or update or delete on astro_diary_cascade_targets
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_cascade_receipts_graph_integrity
after insert or update or delete on astro_diary_cascade_receipts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_erasure_decision_facts_graph_integrity
after insert or update or delete on astro_diary_erasure_decision_facts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_command_receipts_graph_integrity
after insert or update or delete on astro_diary_command_receipts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_command_preconditions_graph_integrity
after insert or update or delete on astro_diary_command_preconditions
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_command_event_receipts_graph_integrity
after insert or update or delete on astro_diary_command_event_receipts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();
create constraint trigger astro_diary_event_application_receipts_graph_integrity
after insert or update or delete on astro_diary_event_application_receipts
deferrable initially deferred for each row execute function astro_diary_validate_journal_graph();

create constraint trigger astro_diary_media_assets_authority_integrity
after insert or update or delete on media_assets
deferrable initially deferred for each row execute function astro_diary_validate_media_asset_authority();
create constraint trigger astro_diary_media_authorities_asset_integrity
after insert or update or delete on astro_diary_media_authorities
deferrable initially deferred for each row execute function astro_diary_validate_media_asset_authority();
`;

/** Every canonical event owns an exact consumer fanout; each consumer has independent delivery. */
export const astroDiaryOutboxIntegritySql = `
alter table outbox_events add constraint outbox_events_astro_diary_dispatch_payload_check check (
  event_type <> 'astro_diary.event_delivery.dispatch_requested.v1'
  or payload = jsonb_build_object(
    'schemaVersion', 'astro-diary-event-delivery-dispatch-request.v1',
    'deliveryId', aggregate_id::text
  )
);

create or replace function astro_diary_validate_event_delivery_graph()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  target_event_id uuid;
begin
  if tg_table_name = 'astro_diary_events' then
    target_event_id := coalesce(new.event_id, old.event_id);
  elsif tg_table_name = 'astro_diary_event_deliveries' then
    target_event_id := coalesce(new.event_id, old.event_id);
  elsif tg_table_name = 'outbox_events' then
    if coalesce(new.event_type, old.event_type) <> 'astro_diary.event_delivery.dispatch_requested.v1'
      then return null;
    end if;
    select delivery.event_id into target_event_id
      from astro_diary_event_deliveries delivery
     where delivery.id = coalesce(new.aggregate_id, old.aggregate_id);
    if target_event_id is null then
      raise exception 'AstroDiary outbox dispatch does not reference a delivery'
        using errcode = '23514';
    end if;
  end if;
  if target_event_id is null then return null; end if;

  if exists (
    with expected(consumer) as (
      select 'realtime_projection' where exists (
        select 1 from astro_diary_events event where event.event_id = target_event_id
          and event.event_type in (
            'astro_diary.cycle_opened.v1', 'astro_diary.timeline_item_published.v1',
            'astro_diary.timeline_item_edited.v1', 'astro_diary.timeline_item_hidden.v1',
            'astro_diary.timeline_item_erased.v1',
            'astro_diary.cycle_closed.v1', 'astro_diary.response_obligation_created.v1',
            'astro_diary.response_obligation_satisfied.v1',
            'astro_diary.response_obligation_overdue.v1',
            'astro_diary.context_completed.v1', 'astro_diary.context_failed.v1',
            'astro_diary.ai_updated.v1',
            'astro_diary.export_ready.v1', 'astro_diary.export_failed.v1',
            'astro_diary.export_invalidated.v1', 'astro_diary.erasure_completed.v1',
            'astro_diary.journal_activated.v1'
          )
      )
      union all select 'notification' where exists (
        select 1 from astro_diary_events event where event.event_id = target_event_id
          and event.event_type in (
            'astro_diary.cycle_opened.v1', 'astro_diary.timeline_item_published.v1',
            'astro_diary.response_obligation_created.v1',
            'astro_diary.response_obligation_satisfied.v1',
            'astro_diary.response_obligation_overdue.v1'
          )
      )
      union all select 'context_worker' where exists (
        select 1 from astro_diary_events event where event.event_id = target_event_id
          and event.event_type = 'astro_diary.context_generation_requested.v1'
      )
      union all select 'derivative_worker' where exists (
        select 1 from astro_diary_events event where event.event_id = target_event_id
          and event.event_type = 'astro_diary.derivative_generation_requested.v1'
      )
      union all select 'ai_worker' where exists (
        select 1 from astro_diary_events event where event.event_id = target_event_id
          and event.event_type = 'astro_diary.ai_generation_requested.v1'
      )
      union all select 'export_worker' where exists (
        select 1 from astro_diary_events event where event.event_id = target_event_id
          and event.event_type = 'astro_diary.export_requested.v1'
      )
      union all select 'erasure_worker' where exists (
        select 1 from astro_diary_events event where event.event_id = target_event_id
          and event.event_type = 'astro_diary.erasure_requested.v1'
      )
    )
    select 1 from expected
     full join (
       select scoped_delivery.* from astro_diary_event_deliveries scoped_delivery
        where scoped_delivery.event_id = target_event_id
     ) delivery on delivery.consumer = expected.consumer
    where expected.consumer is null or delivery.id is null
  ) then
    raise exception 'AstroDiary canonical event consumer fanout is not exact'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_event_deliveries delivery
   where delivery.event_id = target_event_id
     and (select count(*) from outbox_events outbox
           where outbox.event_type = 'astro_diary.event_delivery.dispatch_requested.v1'
             and outbox.aggregate_id = delivery.id
             and outbox.payload = jsonb_build_object(
               'schemaVersion', 'astro-diary-event-delivery-dispatch-request.v1',
               'deliveryId', delivery.id::text
             )) <> 1
  ) then
    raise exception 'AstroDiary event delivery lacks its IDs-only outbox dispatch'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from astro_diary_event_deliveries delivery
    join astro_diary_events source on source.event_id = delivery.event_id
   where delivery.event_id = target_event_id and delivery.state = 'published'
     and (select count(*) from astro_diary_event_application_receipts receipt
           where receipt.consumer = delivery.consumer
             and receipt.source_event_id = delivery.event_id
             and receipt.source_event_type = source.event_type
             and receipt.source_event_digest = source.event_digest
             and receipt.journal_id = source.journal_id
             and receipt.result_kind in ('applied', 'idempotent')) <> 1
  ) then
    raise exception 'AstroDiary published delivery lacks its exact application receipt'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger astro_diary_events_delivery_graph_integrity
after insert or update or delete on astro_diary_events
deferrable initially deferred for each row execute function astro_diary_validate_event_delivery_graph();
create constraint trigger astro_diary_event_deliveries_graph_integrity
after insert or update or delete on astro_diary_event_deliveries
deferrable initially deferred for each row execute function astro_diary_validate_event_delivery_graph();
create constraint trigger outbox_events_astro_diary_delivery_graph_integrity
after insert or update or delete on outbox_events
deferrable initially deferred for each row execute function astro_diary_validate_event_delivery_graph();
`;

/** 0041 forward correction for direct client consumption versus reserved prompt openings. */
export const astroDiaryOpeningAllowanceFactIntegritySql = `
create or replace function astro_diary_validate_cycle_opening_allowance_fact()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  target_cycle_id uuid;
  cycle_row astro_diary_cycles%rowtype;
  fact_row astro_diary_cycle_opening_allowance_facts%rowtype;
begin
  if tg_table_name = 'astro_diary_cycles' then
    target_cycle_id := coalesce(new.id, old.id);
  else
    target_cycle_id := coalesce(new.cycle_id, old.cycle_id);
  end if;
  select * into cycle_row from astro_diary_cycles where id = target_cycle_id for update;
  if not found then return null; end if;
  select * into fact_row from astro_diary_cycle_opening_allowance_facts
   where cycle_id = target_cycle_id;
  if not found then
    raise exception 'AstroDiary cycle lacks its immutable opening allowance source fact'
      using errcode = '23514';
  end if;
  if fact_row.opening_allowance_reservation_id is not null then
    if fact_row.opening_allowance_reservation_id <> cycle_row.opening_allowance_reservation_id
       or fact_row.opening_allowance_consumption_id is not null
       or (cycle_row.state = 'awaiting_client_entry'
         and cycle_row.opening_allowance_reservation_id is null) then
      raise exception 'AstroDiary reserved cycle opening fact does not match its reservation'
        using errcode = '23514';
    end if;
  elsif fact_row.opening_allowance_consumption_id is null
     or cycle_row.opening_allowance_reservation_id is not null
     or not exists (
       select 1 from client_subscription_allowance_consumptions consumption
        where consumption.id = fact_row.opening_allowance_consumption_id
          and consumption.period_id = cycle_row.opening_period_id
          and consumption.source = 'available'
     ) then
    raise exception 'AstroDiary direct client cycle opening fact does not match its consumption'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger astro_diary_cycles_opening_allowance_fact_integrity
after insert or update or delete on astro_diary_cycles
deferrable initially deferred for each row execute function astro_diary_validate_cycle_opening_allowance_fact();
create constraint trigger astro_diary_cycle_opening_allowance_facts_source_integrity
after insert or update or delete on astro_diary_cycle_opening_allowance_facts
deferrable initially deferred for each row execute function astro_diary_validate_cycle_opening_allowance_fact();
`;

/** Exact immutable source-event/transition/event graph for paid journal activation. */
export const astroDiarySubscriptionActivationIntegritySql = `
create or replace function astro_diary_guard_subscription_activation_immutable()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'AstroDiary subscription activation receipts are immutable'
    using errcode = '55000';
end;
$$;

create trigger astro_diary_subscription_activation_receipts_immutable
before update or delete on astro_diary_subscription_activation_receipts
for each row execute function astro_diary_guard_subscription_activation_immutable();

create trigger astro_diary_subscription_activation_receipts_no_truncate
before truncate on astro_diary_subscription_activation_receipts
for each statement execute function astro_diary_guard_subscription_activation_immutable();

create or replace function astro_diary_validate_subscription_activation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  receipt astro_diary_subscription_activation_receipts%rowtype;
begin
  select * into receipt
    from astro_diary_subscription_activation_receipts
   where id = coalesce(new.id, old.id);
  if not found then return null; end if;

  if not exists (
    select 1
      from astro_diary_journals journal
      join client_subscriptions subscription
        on subscription.id = receipt.subscription_id
       and subscription.contract_id = receipt.contract_id
       and subscription.relationship_id = receipt.relationship_id
       and subscription.journal_epoch_id = receipt.journal_epoch_id
      join client_subscription_transition_receipts transition
        on transition.transition_id = receipt.transition_id
       and transition.subscription_id = receipt.subscription_id
       and transition.contract_id = receipt.contract_id
       and transition.relationship_id = receipt.relationship_id
       and transition.journal_epoch_id = receipt.journal_epoch_id
       and transition.subscription_version = receipt.subscription_version
      join client_subscription_event_application_receipts application
        on application.source_event_id = receipt.source_event_id
       and application.source_event_digest = receipt.source_event_digest
       and application.evidence_id = receipt.evidence_id
       and application.subscription_id = receipt.subscription_id
       and application.result_kind = 'applied'
       and application.result_version = receipt.subscription_version
       and application.transition_id = receipt.transition_id
      join astro_diary_events event
        on event.event_id = receipt.activation_event_id
       and event.event_type = 'astro_diary.journal_activated.v1'
       and event.journal_id = receipt.journal_id
       and event.journal_epoch_id = receipt.journal_epoch_id
       and event.occurred_at = receipt.activated_at
     where journal.id = receipt.journal_id
       and journal.relationship_id = receipt.relationship_id
       and journal.journal_epoch_id = receipt.journal_epoch_id
       and journal.created_at = receipt.activated_at
       and transition.primary_event_type = 'client_subscription.activated.v1'
       and transition.state = 'active'
       and transition.entitlement_state = 'active'
       and transition.entitlement_scope = 'period'
       and transition.occurred_at = (
         select period.anchor_captured_at
           from client_subscription_periods period
          where period.id = transition.period_id
            and period.subscription_id = receipt.subscription_id
       )
  ) then
    raise exception 'AstroDiary activation evidence differs from its canonical capture transition graph'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger astro_diary_subscription_activation_graph_integrity
after insert or update or delete on astro_diary_subscription_activation_receipts
deferrable initially deferred for each row
execute function astro_diary_validate_subscription_activation();

create or replace function astro_diary_validate_activation_event_ownership()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  event_row astro_diary_events%rowtype;
begin
  select * into event_row
    from astro_diary_events
   where event_id = coalesce(new.event_id, old.event_id);
  if not found or event_row.event_type <> 'astro_diary.journal_activated.v1' then
    return null;
  end if;

  if not exists (
    select 1
      from astro_diary_subscription_activation_receipts receipt
     where receipt.activation_event_id = event_row.event_id
       and receipt.journal_id = event_row.journal_id
       and receipt.journal_epoch_id = event_row.journal_epoch_id
       and receipt.activated_at = event_row.occurred_at
  ) then
    raise exception 'AstroDiary journal activation event has no exact activation receipt owner'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger astro_diary_activation_event_ownership_integrity
after insert or update or delete on astro_diary_events
deferrable initially deferred for each row
execute function astro_diary_validate_activation_event_ownership();
`;

export const astroDiarySourceSqlAppendOrder = [
  astroDiaryImmutableEvidenceSql,
  astroDiaryDeferredGraphIntegritySql,
  astroDiaryOutboxIntegritySql,
  astroDiaryOpeningAllowanceFactIntegritySql,
  astroDiarySubscriptionActivationIntegritySql
] as const;
