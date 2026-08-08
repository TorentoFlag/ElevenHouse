create or replace function finance_require_economic_payment_head_evidence()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  latest_session finance_economic_payment_sessions%rowtype;
  current_intent finance_economic_payment_intents%rowtype;
  matching_transition_exists boolean;
  capture_exists boolean;
begin
  if new.state = 'created' then
    -- A deferred trigger fires once for the INSERT and again for the UPDATE that opens a
    -- checkout session. Ignore the stale INSERT event after the head has advanced.
    select * into current_intent from finance_economic_payment_intents where id = new.id;
    if current_intent.state <> 'created' or current_intent.version <> new.version then
      return null;
    end if;
    if exists (select 1 from finance_economic_payment_sessions where economic_payment_intent_id = new.id) then
      raise exception 'created payment cannot already have a session' using errcode = '23514';
    end if;
    if not exists (
      select 1 from finance_economic_payment_intent_creation_receipts receipt
      where receipt.economic_payment_intent_id = new.id
        and receipt.purpose = new.purpose
        and receipt.source_id = new.source_id
        and receipt.series_id = new.series_id
        and receipt.provider_account_id = new.provider_account_id
        and receipt.provider_identity_version = new.provider_identity_version
        and receipt.amount_minor = new.amount_minor
        and receipt.currency = new.currency
        and receipt.economic_payment_version = new.version
        and receipt.source_uniqueness_version = 1
    ) then
      raise exception 'created payment requires its DB-issued creation receipt' using errcode = '23514';
    end if;
    return null;
  end if;
  select * into latest_session from finance_economic_payment_sessions
    where economic_payment_intent_id = new.id
    order by intent_version_opened desc
    limit 1;
  if not found or latest_session.state <> new.state then
    raise exception 'economic payment head must match its latest session' using errcode = '23514';
  end if;
  if new.state = 'checkout_opened' then
    if latest_session.intent_version_opened <> new.version or latest_session.version <> 1
       or not exists (
         select 1 from finance_economic_payment_session_open_receipts receipt
          where receipt.economic_payment_intent_id = new.id
            and receipt.economic_payment_session_id = latest_session.id
            and receipt.series_id = new.series_id
            and receipt.provider_account_id = new.provider_account_id
            and receipt.provider_identity_version = new.provider_identity_version
            and receipt.economic_payment_version = new.version
            and receipt.economic_payment_session_version = latest_session.version
       ) then
      raise exception 'new payment session must match the committed intent version' using errcode = '23514';
    end if;
    return null;
  end if;
  select exists (
    select 1 from finance_payment_transition_facts transition_fact
    where transition_fact.economic_payment_intent_id = new.id
      and transition_fact.economic_payment_session_id = latest_session.id
      and transition_fact.intent_version_to = new.version
      and transition_fact.session_version_to = latest_session.version
      and transition_fact.to_state = new.state
  ) into matching_transition_exists;
  if not matching_transition_exists then
    raise exception 'economic payment head transition requires an immutable fact' using errcode = '23514';
  end if;
  if new.state = 'captured' then
    select exists (
      select 1 from finance_capture_facts capture
      where capture.economic_payment_intent_id = new.id
        and capture.economic_payment_session_id = latest_session.id
    ) into capture_exists;
    if not capture_exists then
      raise exception 'captured payment head requires one capture fact' using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;
