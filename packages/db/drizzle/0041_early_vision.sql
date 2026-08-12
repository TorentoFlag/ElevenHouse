ALTER TABLE "astro_diary_cycle_opening_allowance_facts" DROP CONSTRAINT "astro_diary_cycle_opening_allowance_facts_recorded_check";--> statement-breakpoint
ALTER TABLE "astro_diary_cycle_opening_allowance_facts" ALTER COLUMN "opening_allowance_reservation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "astro_diary_cycle_opening_allowance_facts" ADD COLUMN "opening_allowance_consumption_id" uuid;--> statement-breakpoint
ALTER TABLE "astro_diary_cycle_opening_allowance_facts" ADD CONSTRAINT "astro_diary_cycle_opening_allowance_facts_consumption_fk" FOREIGN KEY ("opening_period_id","opening_allowance_consumption_id") REFERENCES "public"."client_subscription_allowance_consumptions"("period_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_cycle_opening_allowance_facts" ADD CONSTRAINT "astro_diary_cycle_opening_allowance_facts_recorded_check" CHECK ("astro_diary_cycle_opening_allowance_facts"."recorded_at" is not null
        and (("astro_diary_cycle_opening_allowance_facts"."opening_allowance_reservation_id" is null) <> ("astro_diary_cycle_opening_allowance_facts"."opening_allowance_consumption_id" is null)));--> statement-breakpoint
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

--> statement-breakpoint
CREATE OR REPLACE FUNCTION astro_diary_validate_cycle_opening_allowance_fact()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  target_cycle_id uuid;
  cycle_row astro_diary_cycles%ROWTYPE;
  fact_row astro_diary_cycle_opening_allowance_facts%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'astro_diary_cycles' THEN
    target_cycle_id := COALESCE(NEW.id, OLD.id);
  ELSE
    target_cycle_id := COALESCE(NEW.cycle_id, OLD.cycle_id);
  END IF;
  SELECT * INTO cycle_row FROM astro_diary_cycles WHERE id = target_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO fact_row FROM astro_diary_cycle_opening_allowance_facts
   WHERE cycle_id = target_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AstroDiary cycle lacks its immutable opening allowance source fact'
      USING ERRCODE = '23514';
  END IF;
  IF fact_row.opening_allowance_reservation_id IS NOT NULL THEN
    IF fact_row.opening_allowance_reservation_id <> cycle_row.opening_allowance_reservation_id
       OR fact_row.opening_allowance_consumption_id IS NOT NULL
       OR (cycle_row.state = 'awaiting_client_entry'
         AND cycle_row.opening_allowance_reservation_id IS NULL) THEN
      RAISE EXCEPTION 'AstroDiary reserved cycle opening fact does not match its reservation'
        USING ERRCODE = '23514';
    END IF;
  ELSIF fact_row.opening_allowance_consumption_id IS NULL
     OR cycle_row.opening_allowance_reservation_id IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM client_subscription_allowance_consumptions consumption
        WHERE consumption.id = fact_row.opening_allowance_consumption_id
          AND consumption.period_id = cycle_row.opening_period_id
          AND consumption.source = 'available'
     ) THEN
    RAISE EXCEPTION 'AstroDiary direct client cycle opening fact does not match its consumption'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

--> statement-breakpoint
CREATE CONSTRAINT TRIGGER astro_diary_cycles_opening_allowance_fact_integrity
AFTER INSERT OR UPDATE OR DELETE ON astro_diary_cycles
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION astro_diary_validate_cycle_opening_allowance_fact();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER astro_diary_cycle_opening_allowance_facts_source_integrity
AFTER INSERT OR UPDATE OR DELETE ON astro_diary_cycle_opening_allowance_facts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION astro_diary_validate_cycle_opening_allowance_fact();
