ALTER TABLE "finance_webhook_semantic_commit_receipts" DROP CONSTRAINT "finance_webhook_semantic_commit_receipts_shape_check";--> statement-breakpoint
ALTER TABLE "finance_provider_semantic_facts" ALTER COLUMN "inbox_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_webhook_semantic_commit_receipts" ALTER COLUMN "inbox_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_webhook_semantic_commit_receipts" ALTER COLUMN "inbox_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_webhook_semantic_commit_receipts" ALTER COLUMN "checkpoint_sequence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_webhook_semantic_commit_receipts" ALTER COLUMN "processing_status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_webhook_semantic_commit_receipts" ADD CONSTRAINT "finance_webhook_semantic_commit_receipts_shape_check" CHECK ((
          ("inbox_item_id" is not null
            and "inbox_version" >= 2
            and "checkpoint_sequence" >= 1
            and "processing_status" in ('completed', 'quarantined'))
          or ("inbox_item_id" is null
            and "inbox_version" is null
            and "checkpoint_sequence" is null
            and "processing_status" is null
            and "effect_disposition" = 'applied_once')
        )
        and "semantic_source_kind" in ('payment_transition', 'refund', 'chargeback', 'settlement_entry')
        and "purpose" in ('client_order', 'platform_invoice', 'platform_card_setup')
        and "effect_disposition" in ('applied_once', 'quarantined_no_effect')
        and "canonical_fact_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "evidence_artifact_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "canonical_digest" ~ '^sha256:[a-f0-9]{64}$'
        and length("canonical_preimage") between 1 and 16000
        and "persistence_transaction_boundary_ref" ~ '^postgres-xid:[0-9]+$'
        and "committed_at" >= "semantic_fact_committed_at");--> statement-breakpoint
create or replace function finance_issue_webhook_semantic_commit_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  semantic finance_provider_semantic_facts%rowtype;
  inbox finance_webhook_inbox%rowtype;
begin
  select * into strict semantic from finance_provider_semantic_facts
    where id = new.semantic_fact_id;
  new.inbox_item_id := semantic.inbox_item_id;
  if semantic.inbox_item_id is null then
    new.inbox_version := null;
    new.checkpoint_sequence := null;
    new.processing_status := null;
  else
    select * into strict inbox from finance_webhook_inbox
      where id = semantic.inbox_item_id;
    new.inbox_version := inbox.version;
    new.checkpoint_sequence := inbox.last_checkpoint_sequence;
    new.processing_status := inbox.processing_status;
  end if;
  new.series_id := semantic.series_id;
  new.provider_account_id := semantic.provider_account_id;
  new.provider_identity_version := semantic.provider_identity_version;
  new.economic_payment_intent_id := semantic.economic_payment_intent_id;
  new.economic_payment_session_id := semantic.economic_payment_session_id;
  new.semantic_source_kind := semantic.semantic_source_kind;
  new.semantic_source_id := semantic.semantic_source_id;
  new.provider_payment_id := semantic.provider_payment_id;
  new.amount_minor := semantic.amount_minor;
  new.currency := semantic.currency;
  new.purpose := semantic.purpose;
  new.canonical_fact_digest := semantic.canonical_fact_digest;
  new.evidence_artifact_id := semantic.evidence_artifact_id;
  new.evidence_artifact_digest := semantic.evidence_artifact_digest;
  new.effect_disposition := semantic.effect_disposition;
  new.observed_at := semantic.observed_at;
  new.semantic_fact_committed_at := semantic.committed_at;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'webhook_semantic_commit_receipt',
    'schemaVersion', 1,
    'sourceDelivery', case when new.inbox_item_id is null then 'provider_canonical_read' else 'webhook' end,
    'receiptId', new.id::text,
    'semanticFactId', new.semantic_fact_id,
    'inboxItemId', new.inbox_item_id,
    'inboxVersion', new.inbox_version::text,
    'checkpointSequence', new.checkpoint_sequence::text,
    'processingStatus', new.processing_status,
    'seriesId', new.series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'economicPaymentSessionId', new.economic_payment_session_id,
    'semanticSourceKind', new.semantic_source_kind,
    'semanticSourceId', new.semantic_source_id,
    'providerPaymentId', new.provider_payment_id,
    'amountMinor', new.amount_minor::text,
    'currency', new.currency,
    'purpose', new.purpose,
    'canonicalFactDigest', new.canonical_fact_digest,
    'evidenceArtifactId', new.evidence_artifact_id,
    'evidenceArtifactDigest', new.evidence_artifact_digest,
    'effectDisposition', new.effect_disposition,
    'observedAt', to_char(new.observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'semanticFactCommittedAt', to_char(new.semantic_fact_committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;--> statement-breakpoint
create or replace function finance_validate_webhook_semantic_commit_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  semantic finance_provider_semantic_facts%rowtype;
  inbox finance_webhook_inbox%rowtype;
begin
  select * into strict semantic from finance_provider_semantic_facts where id = new.semantic_fact_id;
  if new.inbox_item_id is not null then
    select * into strict inbox from finance_webhook_inbox where id = new.inbox_item_id;
  end if;
  if semantic.economic_payment_session_id is distinct from new.economic_payment_session_id
     or semantic.provider_payment_id is distinct from new.provider_payment_id
     or semantic.amount_minor is distinct from new.amount_minor
     or semantic.currency is distinct from new.currency
     or (new.inbox_item_id is not null and (
       inbox.processing_status <> new.processing_status
       or inbox.version <> new.inbox_version
       or inbox.last_checkpoint_sequence <> new.checkpoint_sequence
     ))
     or (new.inbox_item_id is null and (
       semantic.inbox_item_id is not null
       or new.inbox_version is not null
       or new.checkpoint_sequence is not null
       or new.processing_status is not null
     ))
     or (new.inbox_item_id is not null
       and new.effect_disposition = 'applied_once'
       and new.processing_status <> 'completed')
     or (new.inbox_item_id is not null
       and new.effect_disposition = 'quarantined_no_effect'
       and new.processing_status <> 'quarantined') then
    raise exception 'webhook semantic commit receipt is cross-wired' using errcode = '23514';
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create or replace function finance_validate_payment_transition_heads()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  intent_head finance_economic_payment_intents%rowtype;
  session_head finance_economic_payment_sessions%rowtype;
  artifact finance_artifacts%rowtype;
  authority_matches boolean;
begin
  select * into intent_head from finance_economic_payment_intents where id = new.economic_payment_intent_id;
  select * into session_head from finance_economic_payment_sessions where id = new.economic_payment_session_id;
  select * into artifact from finance_artifacts where id = new.evidence_artifact_id;
  if intent_head.version <> new.intent_version_to or intent_head.state <> new.to_state
     or session_head.version <> new.session_version_to or session_head.state <> new.to_state then
    raise exception 'payment transition fact must match committed heads' using errcode = '23514';
  end if;
  if artifact.binding_kind <> 'provider'
     or artifact.series_id <> new.series_id
     or artifact.provider_account_id <> new.provider_account_id
     or artifact.provider_identity_version <> new.provider_identity_version
     or artifact.sha256_digest <> new.evidence_artifact_digest then
    raise exception 'payment transition artifact binding mismatch' using errcode = '23514';
  end if;
  if new.authority_kind = 'provider_operation_result' then
    select exists (
      select 1
      from finance_provider_operation_results authority
      join finance_provider_operation_result_commit_receipts receipt
        on receipt.provider_operation_result_id = authority.id
       and receipt.provider_operation_intent_id = authority.provider_operation_intent_id
       and receipt.provider_operation_intent_version = authority.provider_operation_intent_version
       and receipt.series_id = authority.series_id
       and receipt.provider_account_id = authority.provider_account_id
       and receipt.provider_identity_version = authority.provider_identity_version
       and receipt.outcome = authority.outcome
       and receipt.evidence_artifact_id = authority.evidence_artifact_id
       and receipt.evidence_artifact_digest = authority.evidence_artifact_digest
      join finance_provider_operation_intents operation
        on operation.id = authority.provider_operation_intent_id
      where authority.id = new.authority_id
        and authority.series_id = new.series_id
        and authority.provider_account_id = new.provider_account_id
        and authority.provider_identity_version = new.provider_identity_version
        and authority.evidence_artifact_id = new.evidence_artifact_id
        and authority.evidence_artifact_digest = new.evidence_artifact_digest
        and operation.economic_payment_intent_id = new.economic_payment_intent_id
        and operation.economic_payment_session_id = new.economic_payment_session_id
        and (
          (new.evidence_kind = 'ambiguous_provider_result' and authority.outcome = 'ambiguous')
          or (new.evidence_kind = 'canonical_provider_result' and authority.outcome in ('succeeded', 'failed'))
        )
    ) into authority_matches;
  else
    select exists (
      select 1
      from finance_provider_semantic_facts authority
      join finance_webhook_semantic_commit_receipts receipt
        on receipt.semantic_fact_id = authority.id
       and receipt.inbox_item_id is not distinct from authority.inbox_item_id
       and receipt.series_id = authority.series_id
       and receipt.provider_account_id = authority.provider_account_id
       and receipt.provider_identity_version = authority.provider_identity_version
       and receipt.economic_payment_intent_id = authority.economic_payment_intent_id
       and receipt.economic_payment_session_id is not distinct from authority.economic_payment_session_id
       and receipt.canonical_fact_digest = authority.canonical_fact_digest
       and receipt.evidence_artifact_id = authority.evidence_artifact_id
       and receipt.evidence_artifact_digest = authority.evidence_artifact_digest
       and receipt.effect_disposition = authority.effect_disposition
      where authority.id = new.authority_id
        and authority.series_id = new.series_id
        and authority.provider_account_id = new.provider_account_id
        and authority.provider_identity_version = new.provider_identity_version
        and authority.semantic_source_kind = 'payment_transition'
        and authority.economic_payment_intent_id = new.economic_payment_intent_id
        and authority.economic_payment_session_id = new.economic_payment_session_id
        and authority.evidence_artifact_id = new.evidence_artifact_id
        and authority.evidence_artifact_digest = new.evidence_artifact_digest
        and authority.effect_disposition = 'applied_once'
        and new.evidence_kind = 'canonical_provider_result'
    ) into authority_matches;
  end if;
  if not authority_matches then
    raise exception 'payment transition authority is missing or mismatched' using errcode = '23514';
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create or replace function finance_validate_economic_payment_capture()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  intent_head finance_economic_payment_intents%rowtype;
  session_head finance_economic_payment_sessions%rowtype;
  matching_transition finance_payment_transition_facts%rowtype;
  provider_capture_matches boolean;
begin
  select * into intent_head from finance_economic_payment_intents where id = new.economic_payment_intent_id;
  select * into session_head from finance_economic_payment_sessions where id = new.economic_payment_session_id;
  select * into matching_transition from finance_payment_transition_facts transition_fact
    where transition_fact.economic_payment_intent_id = new.economic_payment_intent_id
      and transition_fact.economic_payment_session_id = new.economic_payment_session_id
      and transition_fact.to_state = 'captured'
      and transition_fact.authority_kind = new.evidence_authority_kind
      and transition_fact.authority_id = new.evidence_authority_id
      and transition_fact.evidence_artifact_id = new.evidence_artifact_id
      and transition_fact.evidence_artifact_digest = new.evidence_artifact_digest;
  if intent_head.state <> 'captured' or session_head.state <> 'captured'
     or intent_head.series_id <> new.series_id
     or intent_head.provider_account_id <> new.provider_account_id
     or intent_head.provider_identity_version <> new.provider_identity_version
     or intent_head.amount_minor <> new.amount_minor
     or intent_head.currency <> new.currency
     or not found then
    raise exception 'capture must exactly match intent, session and transition authority' using errcode = '23514';
  end if;
  if (intent_head.purpose = 'platform_card_setup' and new.amount_minor <> 0)
     or (intent_head.purpose <> 'platform_card_setup' and new.amount_minor <= 0) then
    raise exception 'capture amount does not match payment purpose' using errcode = '23514';
  end if;
  if new.evidence_authority_kind = 'provider_operation_result' then
    select exists (
      select 1
      from finance_provider_operation_results result
      join finance_provider_operation_result_commit_receipts receipt
        on receipt.provider_operation_result_id = result.id
       and receipt.provider_operation_intent_id = result.provider_operation_intent_id
       and receipt.provider_operation_intent_version = result.provider_operation_intent_version
       and receipt.series_id = result.series_id
       and receipt.provider_account_id = result.provider_account_id
       and receipt.provider_identity_version = result.provider_identity_version
       and receipt.outcome = result.outcome
       and receipt.evidence_artifact_id = result.evidence_artifact_id
       and receipt.evidence_artifact_digest = result.evidence_artifact_digest
      join finance_provider_operation_intents operation
        on operation.id = result.provider_operation_intent_id
      where result.id = new.evidence_authority_id
        and result.outcome = 'succeeded'
        and result.provider_payment_id = new.provider_payment_id
        and (
          (intent_head.purpose = 'platform_card_setup'
            and ((result.amount_minor is null and result.currency is null)
              or (result.amount_minor = 0 and result.currency = new.currency)))
          or (intent_head.purpose <> 'platform_card_setup'
            and result.amount_minor = new.amount_minor
            and result.currency = new.currency)
        )
        and operation.economic_payment_intent_id = new.economic_payment_intent_id
        and operation.economic_payment_session_id = new.economic_payment_session_id
    ) into provider_capture_matches;
    if not provider_capture_matches then
      raise exception 'capture does not match the verified provider result' using errcode = '23514';
    end if;
  else
    select exists (
      select 1
      from finance_provider_semantic_facts semantic
      join finance_webhook_semantic_commit_receipts receipt
        on receipt.semantic_fact_id = semantic.id
       and receipt.inbox_item_id is not distinct from semantic.inbox_item_id
       and receipt.series_id = semantic.series_id
       and receipt.provider_account_id = semantic.provider_account_id
       and receipt.provider_identity_version = semantic.provider_identity_version
       and receipt.economic_payment_intent_id = semantic.economic_payment_intent_id
       and receipt.economic_payment_session_id is not distinct from semantic.economic_payment_session_id
       and receipt.canonical_fact_digest = semantic.canonical_fact_digest
       and receipt.evidence_artifact_id = semantic.evidence_artifact_id
       and receipt.evidence_artifact_digest = semantic.evidence_artifact_digest
       and receipt.effect_disposition = semantic.effect_disposition
      where semantic.id = new.evidence_authority_id
        and semantic.semantic_source_kind = 'payment_transition'
        and semantic.effect_disposition = 'applied_once'
        and semantic.economic_payment_intent_id = new.economic_payment_intent_id
        and semantic.economic_payment_session_id = new.economic_payment_session_id
        and semantic.series_id = new.series_id
        and semantic.provider_account_id = new.provider_account_id
        and semantic.provider_identity_version = new.provider_identity_version
        and semantic.provider_payment_id = new.provider_payment_id
        and semantic.amount_minor = new.amount_minor
        and semantic.currency = new.currency
        and semantic.evidence_artifact_id = new.evidence_artifact_id
        and semantic.evidence_artifact_digest = new.evidence_artifact_digest
    ) into provider_capture_matches;
    if not provider_capture_matches then
      raise exception 'capture does not match the verified provider semantic fact' using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create or replace function finance_validate_webhook_semantic_artifact()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  artifact finance_artifacts%rowtype;
  economic_intent finance_economic_payment_intents%rowtype;
begin
  select * into artifact from finance_artifacts where id = new.evidence_artifact_id;
  select * into economic_intent from finance_economic_payment_intents
    where id = new.economic_payment_intent_id;
  if artifact.artifact_class not in ('provider_webhook', 'provider_canonical_read')
     or artifact.binding_kind <> 'provider'
     or artifact.series_id <> new.series_id
     or artifact.provider_account_id <> new.provider_account_id
     or artifact.provider_identity_version <> new.provider_identity_version
     or artifact.sha256_digest <> new.evidence_artifact_digest
     or economic_intent.purpose <> new.purpose
     or (new.semantic_source_kind = 'payment_transition'
       and (new.amount_minor <> economic_intent.amount_minor
         or new.currency <> economic_intent.currency)) then
    raise exception 'webhook semantic artifact binding mismatch' using errcode = '23514';
  end if;
  if not exists (
    select 1 from finance_webhook_semantic_commit_receipts receipt
    where receipt.semantic_fact_id = new.id
      and receipt.inbox_item_id is not distinct from new.inbox_item_id
      and receipt.series_id = new.series_id
      and receipt.provider_account_id = new.provider_account_id
      and receipt.provider_identity_version = new.provider_identity_version
      and receipt.economic_payment_intent_id = new.economic_payment_intent_id
      and receipt.economic_payment_session_id is not distinct from new.economic_payment_session_id
      and receipt.semantic_source_kind = new.semantic_source_kind
      and receipt.semantic_source_id = new.semantic_source_id
      and receipt.provider_payment_id is not distinct from new.provider_payment_id
      and receipt.amount_minor is not distinct from new.amount_minor
      and receipt.currency is not distinct from new.currency
      and receipt.purpose = new.purpose
      and receipt.canonical_fact_digest = new.canonical_fact_digest
      and receipt.evidence_artifact_id = new.evidence_artifact_id
      and receipt.evidence_artifact_digest = new.evidence_artifact_digest
      and receipt.effect_disposition = new.effect_disposition
      and receipt.observed_at = new.observed_at
      and receipt.semantic_fact_committed_at = new.committed_at
  ) then
    raise exception 'provider semantic fact requires its DB-issued commit receipt' using errcode = '23514';
  end if;
  return null;
end;
$$;
