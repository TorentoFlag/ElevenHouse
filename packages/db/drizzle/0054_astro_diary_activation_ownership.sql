CREATE UNIQUE INDEX "astro_diary_events_one_activation_per_journal_epoch" ON "astro_diary_events" USING btree ("journal_id","journal_epoch_id") WHERE "astro_diary_events"."event_type" = 'astro_diary.journal_activated.v1';--> statement-breakpoint
create or replace function astro_diary_guard_subscription_activation_immutable()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'AstroDiary subscription activation receipts are immutable'
    using errcode = '55000';
end;
$$;--> statement-breakpoint
drop trigger astro_diary_subscription_activation_receipts_immutable
  on astro_diary_subscription_activation_receipts;--> statement-breakpoint
create trigger astro_diary_subscription_activation_receipts_immutable
before update or delete on astro_diary_subscription_activation_receipts
for each row execute function astro_diary_guard_subscription_activation_immutable();--> statement-breakpoint
create trigger astro_diary_subscription_activation_receipts_no_truncate
before truncate on astro_diary_subscription_activation_receipts
for each statement execute function astro_diary_guard_subscription_activation_immutable();--> statement-breakpoint
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
$$;--> statement-breakpoint
create constraint trigger astro_diary_activation_event_ownership_integrity
after insert or update or delete on astro_diary_events
deferrable initially deferred for each row
execute function astro_diary_validate_activation_event_ownership();--> statement-breakpoint
drop trigger "client_subscription_graph_integrity" on client_subscription_contracts;--> statement-breakpoint
create or replace function elevenhouse_assert_client_subscription_contract_creation_graph()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if (
    select count(*)
      from client_subscriptions created_head
      join client_subscription_slots created_slot
        on created_slot.relationship_id = created_head.relationship_id
       and created_slot.product_id = created_head.product_id
       and created_slot.current_subscription_id = created_head.id
      join client_subscription_creation_receipts creation_receipt
        on creation_receipt.subscription_id = created_head.id
       and creation_receipt.contract_id = new.id
       and creation_receipt.contract_digest = new.canonical_digest
       and creation_receipt.order_id = new.order_id
       and creation_receipt.relationship_id = new.relationship_id
       and creation_receipt.product_id = new.product_id
       and creation_receipt.result_kind = 'created'
       and creation_receipt.slot_effect = 'assign'
       and creation_receipt.result_slot_version = created_slot.version
       and creation_receipt.result_slot_version = creation_receipt.expected_slot_version + 1
     where created_head.contract_id = new.id
       and created_head.relationship_id = new.relationship_id
       and created_head.product_id = new.product_id
       and (
         (created_head.version = 1 and created_head.state = 'pending_initial_payment')
         or (
           created_head.version = 2
           and created_head.state = 'active'
           and exists (
             select 1
               from client_subscription_transition_receipts activation_transition
               join client_subscription_event_application_receipts activation_application
                 on activation_application.transition_id = activation_transition.transition_id
                and activation_application.subscription_id = created_head.id
                and activation_application.result_kind = 'applied'
                and activation_application.result_version = created_head.version
              where activation_transition.subscription_id = created_head.id
                and activation_transition.contract_id = new.id
                and activation_transition.relationship_id = new.relationship_id
                and activation_transition.journal_epoch_id = created_head.journal_epoch_id
                and activation_transition.subscription_version = created_head.version
                and activation_transition.primary_event_type = 'client_subscription.activated.v1'
                and activation_transition.state = 'active'
                and activation_transition.entitlement_state = 'active'
                and activation_transition.entitlement_scope = 'period'
           )
         )
       )
  ) <> 1 then
    raise exception 'Sealed subscription contract requires atomic creation graph'
      using errcode = '23514', constraint = 'client_subscription_graph_integrity';
  end if;
  return null;
end;
$$;--> statement-breakpoint
create constraint trigger "client_subscription_graph_integrity"
after insert or update or delete on client_subscription_contracts
deferrable initially deferred for each row
execute function elevenhouse_assert_client_subscription_contract_creation_graph();
