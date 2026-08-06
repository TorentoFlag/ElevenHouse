/**
 * Baseline owner executes this DDL only after the normalized journal tables exist.
 * PostgreSQL constraint triggers are required because CHECK constraints cannot safely enforce
 * cross-row seal, balance, ownership and proof-mirror invariants.
 */
export const financeJournalIntegritySql = `
create extension if not exists pgcrypto;

create or replace function finance_canonical_instant(instant_value timestamptz)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select to_char(instant_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    || case
      when rtrim(to_char(instant_value at time zone 'UTC', 'US'), '0') = '' then ''
      else '.' || rtrim(to_char(instant_value at time zone 'UTC', 'US'), '0')
    end
    || 'Z'
$$;

create or replace function finance_journal_account_preimage(
  account_code text,
  provider_account_id varchar(160),
  bank_cash_pool_id varchar(160),
  astrologer_user_id uuid,
  refund_id varchar(160),
  payout_request_id varchar(160),
  account_currency text
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when provider_account_id is not null and bank_cash_pool_id is not null
         and astrologer_user_id is null and refund_id is null and payout_request_id is null then
      '{"arcProviderAccountId":' || to_json(provider_account_id)::text
        || ',"bankCashPoolId":' || to_json(bank_cash_pool_id)::text
        || ',"code":' || to_json(account_code)::text
        || ',"currency":' || to_json(account_currency)::text || '}'
    when provider_account_id is not null and bank_cash_pool_id is null
         and astrologer_user_id is null and refund_id is null and payout_request_id is null then
      '{"arcProviderAccountId":' || to_json(provider_account_id)::text
        || ',"code":' || to_json(account_code)::text
        || ',"currency":' || to_json(account_currency)::text || '}'
    when provider_account_id is null and bank_cash_pool_id is not null
         and astrologer_user_id is null and refund_id is null and payout_request_id is null then
      '{"bankCashPoolId":' || to_json(bank_cash_pool_id)::text
        || ',"code":' || to_json(account_code)::text
        || ',"currency":' || to_json(account_currency)::text || '}'
    when provider_account_id is null and bank_cash_pool_id is null
         and astrologer_user_id is not null and refund_id is null and payout_request_id is null then
      '{"astrologerUserId":' || to_json(astrologer_user_id::text)::text
        || ',"code":' || to_json(account_code)::text
        || ',"currency":' || to_json(account_currency)::text || '}'
    when provider_account_id is null and bank_cash_pool_id is null
         and astrologer_user_id is null and refund_id is not null and payout_request_id is not null then
      '{"code":' || to_json(account_code)::text
        || ',"currency":' || to_json(account_currency)::text
        || ',"payoutRequestId":' || to_json(payout_request_id)::text
        || ',"refundId":' || to_json(refund_id)::text || '}'
    when provider_account_id is null and bank_cash_pool_id is null
         and astrologer_user_id is null and refund_id is null and payout_request_id is null then
      '{"code":' || to_json(account_code)::text
        || ',"currency":' || to_json(account_currency)::text || '}'
    else null
  end
$$;

create or replace function finance_journal_transaction_preimage(transaction_id varchar(200))
returns text
language sql
stable
strict
set search_path = pg_catalog, public
as $$
  select '{"currency":' || to_json(journal_transaction.currency)::text
    || ',"entries":[' || (
      select string_agg(
        '{"account":' || finance_journal_account_preimage(
          account_row.code,
          account_row.provider_account_id,
          account_row.bank_cash_pool_id,
          account_row.astrologer_user_id,
          account_row.refund_id,
          account_row.payout_request_id,
          account_row.currency
        )
        || ',"amount":{"amountMinor":' || entry_row.amount_minor::text
        || ',"currency":' || to_json(entry_row.currency)::text || '}'
        || ',"links":{"componentId":' || coalesce(to_json(entry_row.component_id)::text, 'null')
        || ',"originalSaleId":' || coalesce(to_json(entry_row.original_sale_id)::text, 'null')
        || ',"payableLotId":' || coalesce(to_json(entry_row.payable_lot_id)::text, 'null')
        || ',"payoutAllocationId":' || coalesce(to_json(entry_row.payout_allocation_id)::text, 'null') || '}'
        || ',"side":' || to_json(entry_row.side)::text || '}',
        ',' order by entry_row.entry_index
      )
      from finance_journal_entries entry_row
      join finance_accounts account_row on account_row.id = entry_row.account_id
      where entry_row.journal_transaction_id = journal_transaction.id
    ) || ']'
    || ',"id":' || to_json(journal_transaction.id)::text
    || ',"occurredAt":' || to_json(finance_canonical_instant(journal_transaction.occurred_at))::text
    || ',"postedAt":' || to_json(finance_canonical_instant(journal_transaction.posted_at))::text
    || ',"reversesTransactionId":'
    || coalesce(to_json(journal_transaction.reverses_journal_transaction_id)::text, 'null')
    || ',"sourceKey":{"kind":' || to_json(source_identity.source_kind)::text
    || ',"operation":' || to_json(source_identity.source_operation_key)::text
    || ',"sourceId":' || to_json(source_identity.source_id)::text || '}'
    || ',"totalCreditMinor":' || to_json((
      select sum(entry_row.amount_minor)::text
      from finance_journal_entries entry_row
      where entry_row.journal_transaction_id = journal_transaction.id
        and entry_row.side = 'credit'
    ))::text
    || ',"totalDebitMinor":' || to_json((
      select sum(entry_row.amount_minor)::text
      from finance_journal_entries entry_row
      where entry_row.journal_transaction_id = journal_transaction.id
        and entry_row.side = 'debit'
    ))::text || '}'
  from finance_journal_transactions journal_transaction
  join finance_source_identities source_identity
    on source_identity.id = journal_transaction.source_identity_id
  where journal_transaction.id = transaction_id
$$;

create or replace function finance_journal_receipt_preimage(
  receipt_id varchar(200),
  source_identity_id uuid,
  journal_transaction_id varchar(200),
  proof_record_id uuid,
  proof_digest text,
  persistence_boundary varchar(200)
)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select jsonb_build_array(
    'finance_journal_persistence_receipt',
    1,
    receipt_id,
    source_identity_id::text,
    journal_transaction_id,
    proof_record_id::text,
    proof_digest,
    persistence_boundary
  )::text
$$;

create or replace function finance_assert_journal_commit_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  transaction_row finance_journal_transactions%rowtype;
  source_row finance_source_identities%rowtype;
  original_source_row finance_source_identities%rowtype;
  proof_row finance_allocation_link_proofs%rowtype;
  receipt_row finance_persistence_commit_receipts%rowtype;
  actual_entry_count integer;
  actual_debit numeric(38, 0);
  actual_credit numeric(38, 0);
begin
  -- A deferred INSERT trigger retains the INSERT tuple even after a later seal UPDATE. Always
  -- validate the current row so the intended source-first/unsealed-first writer can commit.
  select * into strict transaction_row
  from finance_journal_transactions
  where id = new.id;

  if transaction_row.sealed_at is null then
    raise exception 'finance journal transaction must be sealed before commit'
      using errcode = '23514';
  end if;

  if transaction_row.canonical_preimage is distinct from
       finance_journal_transaction_preimage(transaction_row.id)
     or transaction_row.canonical_digest is distinct from
       'sha256:' || encode(digest(transaction_row.canonical_preimage, 'sha256'), 'hex') then
    raise exception 'finance journal canonical transaction digest is invalid'
      using errcode = '23514';
  end if;

  select * into strict source_row
  from finance_source_identities
  where id = transaction_row.source_identity_id;

  if exists (
    select 1
    from finance_journal_entries entry_row
    join finance_accounts account_row on account_row.id = entry_row.account_id
    where entry_row.journal_transaction_id = transaction_row.id
      and (
        (
          account_row.provider_account_version_id is not null
          and (
            account_row.provider_account_version_id is distinct from source_row.provider_account_version_id
            or account_row.provider_account_series_id is distinct from source_row.provider_account_series_id
            or account_row.provider_account_id is distinct from source_row.provider_account_id
            or account_row.provider_identity_version is distinct from source_row.provider_identity_version
          )
        )
        or (
          account_row.bank_cash_pool_id is not null
          and account_row.bank_cash_pool_id is distinct from source_row.bank_cash_pool_id
        )
        or (
          account_row.astrologer_user_id is not null
          and account_row.astrologer_user_id is distinct from source_row.astrologer_user_id
        )
        or (
          account_row.refund_id is not null
          and (
            account_row.refund_id is distinct from source_row.refund_id
            or account_row.payout_request_id is distinct from source_row.payout_request_id
          )
        )
      )
  ) then
    raise exception 'finance journal entry account scope does not match source identity'
      using errcode = '23514';
  end if;

  select count(*)::integer,
         coalesce(sum(amount_minor) filter (where side = 'debit'), 0),
         coalesce(sum(amount_minor) filter (where side = 'credit'), 0)
    into actual_entry_count, actual_debit, actual_credit
  from finance_journal_entries
  where journal_transaction_id = transaction_row.id;

  if actual_entry_count < 2
     or actual_entry_count <> transaction_row.entry_count
     or actual_debit <> actual_credit
     or actual_debit <> transaction_row.total_debit_minor
     or actual_credit <> transaction_row.total_credit_minor
     or exists (
       select 1
       from finance_journal_entries
       where journal_transaction_id = transaction_row.id
         and currency <> transaction_row.currency
     ) then
    raise exception 'finance journal transaction is not balanced per currency'
      using errcode = '23514';
  end if;

  -- Subsequent v2 online-wallet mutations have their own immutable source-consumption and
  -- commitment graph. Requiring a legacy allocation-link proof here would recreate v1 as a
  -- second monetary authority. The mutation is required in this same transaction and owns the
  -- exact sealed journal through its unique foreign key.
  if to_regclass('public.finance_online_wallet_mutations') is not null
     and exists (
       select 1 from finance_online_wallet_mutations mutation
        where mutation.journal_transaction_id = transaction_row.id
     ) then
    if (select count(*) from finance_online_wallet_mutations mutation
            where mutation.journal_transaction_id = transaction_row.id
              and mutation.xmin = pg_current_xact_id()::xid) <> 1
       or exists (
         select 1 from finance_allocation_link_proofs legacy_proof
          where legacy_proof.journal_transaction_id = transaction_row.id
       )
       or (
         source_row.source_kind = 'reserve'
         and source_row.source_operation_key = 'hold_released'
         and not exists (
           select 1
             from finance_online_wallet_mutations mutation
             join finance_online_payable_source_consumptions consumption
               on consumption.mutation_id = mutation.mutation_id
             join finance_online_wallet_hold_release_evidence evidence
               on evidence.mutation_id = mutation.mutation_id
            where mutation.journal_transaction_id = transaction_row.id
              and mutation.operation_kind = 'hold_release'
              and consumption.source_kind = 'root'
              and consumption.root_lot_id = source_row.source_id
              and evidence.root_lot_id = source_row.source_id
         )
       )
       or (
         source_row.source_kind = 'payout'
         and source_row.source_operation_key = 'requested'
         and not exists (
           select 1
             from finance_online_wallet_mutations mutation
             join finance_online_payout_requests payout
               on payout.wallet_mutation_id = mutation.mutation_id
            where mutation.journal_transaction_id = transaction_row.id
              and mutation.operation_kind = 'payout_requested'
              and payout.id = source_row.source_id
         )
       )
       or (
         source_row.source_kind = 'payout'
         and source_row.source_operation_key = 'released'
         and not exists (
           select 1
             from finance_online_wallet_mutations mutation
             join finance_online_payout_requests payout
               on payout.wallet_id = mutation.wallet_id
             join finance_online_payout_request_allocations mapping
               on mapping.payout_request_id = payout.id
             join finance_online_payable_source_consumptions consumption
               on consumption.mutation_id = mutation.mutation_id
              and consumption.source_kind = 'allocation'
              and consumption.source_allocation_id = mapping.payout_pending_allocation_id
            where mutation.journal_transaction_id = transaction_row.id
              and mutation.operation_kind = 'payout_returned_reserved'
              and payout.id = source_row.source_id
         )
       )
       or (
         source_row.source_kind = 'payout'
         and source_row.source_operation_key = 'paid'
         and not exists (
           select 1
             from finance_online_wallet_mutations mutation
             join finance_online_payout_paid_receipts paid_receipt
               on paid_receipt.wallet_mutation_id = mutation.mutation_id
              and paid_receipt.journal_transaction_id = mutation.journal_transaction_id
            where mutation.journal_transaction_id = transaction_row.id
              and mutation.operation_kind = 'payout_paid'
              and paid_receipt.payout_request_id = source_row.source_id
         )
       )
       or (
         source_row.source_kind = 'refund'
         and source_row.source_operation_key = 'approved'
         and not exists (
           select 1
             from finance_online_wallet_mutations mutation
             join finance_online_wallet_refund_cases refund_case
               on refund_case.approval_wallet_mutation_id = mutation.mutation_id
              and refund_case.approval_journal_transaction_id = mutation.journal_transaction_id
            where mutation.journal_transaction_id = transaction_row.id
              and mutation.operation_kind = 'refund_approved'
              and refund_case.refund_case_id = source_row.source_id
              and refund_case.status = 'approved'
              and refund_case.xmin = pg_current_xact_id()::xid
         )
       )
       or (
         source_row.source_kind = 'refund'
         and source_row.source_operation_key = 'confirmed'
         and not exists (
           select 1
             from finance_online_wallet_mutations mutation
             join finance_online_wallet_refund_applications application
               on application.wallet_mutation_id = mutation.mutation_id
              and application.journal_transaction_id = mutation.journal_transaction_id
            where mutation.journal_transaction_id = transaction_row.id
              and mutation.operation_kind = 'refund_confirmed'
              and application.outcome = 'applied'
              and application.xmin = pg_current_xact_id()::xid
              and (
                application.provider_refund_id = source_row.source_id
                or exists (
                  select 1
                    from finance_online_wallet_refund_cases refund_case
                   where refund_case.terminal_application_id = application.id
                     and refund_case.refund_case_id = source_row.source_id
                     and refund_case.provider_refund_id = application.provider_refund_id
                     and refund_case.status = 'succeeded'
                     and refund_case.xmin = pg_current_xact_id()::xid
                )
              )
         )
       )
       or not (
         (source_row.source_kind = 'reserve' and source_row.source_operation_key = 'hold_released')
         or (source_row.source_kind = 'payout' and source_row.source_operation_key = 'requested')
         or (source_row.source_kind = 'payout' and source_row.source_operation_key = 'released')
         or (source_row.source_kind = 'payout' and source_row.source_operation_key = 'paid')
         or (source_row.source_kind = 'refund' and source_row.source_operation_key = 'approved')
         or (source_row.source_kind = 'refund' and source_row.source_operation_key = 'confirmed')
       ) then
      raise exception 'finance online-wallet mutation journal proof is incomplete or cross-wired'
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- A chargeback principal notice is deliberately not a wallet mutation: its principal remains
  -- in provider-facing suspense until an authorised allocation decision exists. Its immutable
  -- case row is therefore the sole same-transaction proof for the sealed journal.
  if to_regclass('public.finance_online_wallet_chargeback_cases') is not null
     and exists (
       select 1 from finance_online_wallet_chargeback_cases chargeback
        where chargeback.journal_transaction_id = transaction_row.id
     ) then
    if not (
         source_row.source_kind = 'chargeback'
         and source_row.source_operation_key = 'confirmed'
       )
       or (
         select count(*)
           from finance_online_wallet_chargeback_cases chargeback
          where chargeback.journal_transaction_id = transaction_row.id
            and chargeback.status = 'provisional_loss'
            and chargeback.xmin = pg_current_xact_id()::xid
       ) <> 1
       or exists (
         select 1 from finance_allocation_link_proofs legacy_proof
          where legacy_proof.journal_transaction_id = transaction_row.id
       ) then
      raise exception 'finance online-wallet chargeback journal proof is incomplete or cross-wired'
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- Terminal V2 outcomes are append-only facts separate from the immutable provisional case.
  if to_regclass('public.finance_online_wallet_chargeback_resolutions') is not null
     and exists (select 1 from finance_online_wallet_chargeback_resolutions resolution where resolution.journal_transaction_id = transaction_row.id) then
    if not (source_row.source_kind = 'chargeback' and source_row.source_operation_key in ('won', 'principal_allocated'))
       or (select count(*) from finance_online_wallet_chargeback_resolutions resolution where resolution.journal_transaction_id = transaction_row.id and resolution.xmin = pg_current_xact_id()::xid) <> 1
       or exists (select 1 from finance_allocation_link_proofs legacy_proof where legacy_proof.journal_transaction_id = transaction_row.id) then
      raise exception 'finance online-wallet chargeback resolution journal proof is incomplete or cross-wired' using errcode = '23514';
    end if;
    return new;
  end if;

  -- Online-sale capture v2 deliberately owns a separate, bounded proof graph. It cannot be
  -- forced through v1 allocation-link proofs without reintroducing the legacy wallet contract.
  -- The alternative proof is still required to mirror every sealed journal entry and to be
  -- bound to one current-transaction online application before this generic journal can commit.
  if to_regclass('public.finance_online_sale_capture_journal_proofs') is not null then
    if exists (
      select 1
      from finance_online_sale_capture_journal_proofs online_proof
      where online_proof.journal_transaction_id = transaction_row.id
    ) then
    if source_row.source_kind <> 'order'
       or source_row.source_operation_key <> 'sale_captured'
       or (select count(*)
             from finance_online_sale_capture_journal_proofs online_proof
            where online_proof.journal_transaction_id = transaction_row.id
              and online_proof.journal_transaction_digest = transaction_row.canonical_digest
           ) <> 1
       or exists (
         select 1
         from finance_allocation_link_proofs legacy_proof
         where legacy_proof.journal_transaction_id = transaction_row.id
       )
       or not exists (
         select 1
         from finance_online_sale_capture_journal_proofs online_proof
         join finance_online_sale_capture_receipts online_receipt
           on online_receipt.receipt_id = online_proof.receipt_id
         join finance_online_sale_capture_applications application
           on application.online_sale_receipt_id = online_receipt.receipt_id
          and application.online_sale_journal_proof_id = online_proof.proof_id
         where online_proof.journal_transaction_id = transaction_row.id
           and online_receipt.order_id = source_row.source_id
           and application.xmin = pg_current_xact_id()::xid
       )
       or (select count(*)
             from finance_online_sale_capture_journal_proof_entries online_entry
             join finance_online_sale_capture_journal_proofs online_proof
               on online_proof.proof_id = online_entry.proof_id
            where online_proof.journal_transaction_id = transaction_row.id
           ) <> actual_entry_count
       or exists (
         select 1
         from finance_journal_entries entry_row
         left join finance_online_sale_capture_journal_proof_entries online_entry
           on online_entry.journal_entry_id = entry_row.id
         left join finance_online_sale_capture_journal_proofs online_proof
           on online_proof.proof_id = online_entry.proof_id
          and online_proof.journal_transaction_id = transaction_row.id
         where entry_row.journal_transaction_id = transaction_row.id
           and (online_entry.journal_entry_id is null or online_entry.entry_index <> entry_row.entry_index)
       ) then
      raise exception 'finance online-sale journal proof is incomplete or cross-wired'
        using errcode = '23514';
    end if;
      return new;
    end if;
  end if;

  select * into strict proof_row
  from finance_allocation_link_proofs
  where journal_transaction_id = transaction_row.id;

  if proof_row.journal_source_kind <> source_row.source_kind
     or proof_row.journal_source_id <> source_row.source_id
     or proof_row.journal_source_operation_key <> source_row.source_operation_key
     or (
       select count(*)
       from finance_allocation_link_proof_entries
       where proof_record_id = proof_row.id
     ) <> actual_entry_count
     or exists (
       select 1
       from finance_journal_entries entry_row
       left join finance_allocation_link_proof_entries proof_entry
         on proof_entry.journal_entry_id = entry_row.id
        and proof_entry.proof_record_id = proof_row.id
       where entry_row.journal_transaction_id = transaction_row.id
         and (
           proof_entry.id is null
           or proof_entry.entry_index is distinct from entry_row.entry_index
           or proof_entry.account_id is distinct from entry_row.account_id
           or proof_entry.side is distinct from entry_row.side
           or proof_entry.amount_minor is distinct from entry_row.amount_minor
           or proof_entry.currency is distinct from entry_row.currency
           or proof_entry.original_sale_id is distinct from entry_row.original_sale_id
           or proof_entry.component_id is distinct from entry_row.component_id
           or proof_entry.payable_lot_id is distinct from entry_row.payable_lot_id
           or proof_entry.payout_allocation_id is distinct from entry_row.payout_allocation_id
         )
     ) then
    raise exception 'finance allocation proof does not strictly mirror journal entries'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from finance_persistence_commit_receipts receipt
    where receipt.source_identity_id = source_row.id
      and receipt.journal_transaction_id = transaction_row.id
      and receipt.proof_record_id = proof_row.id
      and receipt.receipt_kind = 'sealed_journal_transaction'
      and receipt.issued_at >= transaction_row.sealed_at
      and receipt.canonical_preimage = finance_journal_receipt_preimage(
        receipt.receipt_id,
        receipt.source_identity_id,
        receipt.journal_transaction_id,
        receipt.proof_record_id,
        proof_row.proof_digest,
        receipt.persistence_transaction_boundary_ref
      )
      and receipt.canonical_digest = 'sha256:' || encode(
        digest(receipt.canonical_preimage, 'sha256'),
        'hex'
      )
  ) then
    raise exception 'finance journal persistence receipt is missing'
      using errcode = '23514';
  end if;

  select * into strict receipt_row
  from finance_persistence_commit_receipts
  where source_identity_id = source_row.id
    and journal_transaction_id = transaction_row.id
    and proof_record_id = proof_row.id;

  if (
    source_row.source_kind = 'correction'
    and source_row.source_operation_key = 'reversal'
  ) <> (transaction_row.reverses_journal_transaction_id is not null) then
    raise exception 'only a typed correction reversal may reference an original transaction'
      using errcode = '23514';
  end if;

  if transaction_row.reverses_journal_transaction_id is not null then
    if source_row.source_id <> transaction_row.reverses_journal_transaction_id then
      raise exception 'finance correction reversal must identify the original transaction'
        using errcode = '23514';
    end if;

    select original_source.* into strict original_source_row
    from finance_journal_transactions original_transaction
    join finance_source_identities original_source
      on original_source.id = original_transaction.source_identity_id
    where original_transaction.id = transaction_row.reverses_journal_transaction_id
      and original_transaction.sealed_at is not null;

    if source_row.source_scope_kind is distinct from original_source_row.source_scope_kind
       or source_row.provider_account_version_id is distinct from original_source_row.provider_account_version_id
       or source_row.provider_account_series_id is distinct from original_source_row.provider_account_series_id
       or source_row.provider_account_id is distinct from original_source_row.provider_account_id
       or source_row.provider_identity_version is distinct from original_source_row.provider_identity_version
       or source_row.bank_cash_pool_id is distinct from original_source_row.bank_cash_pool_id
       or source_row.astrologer_user_id is distinct from original_source_row.astrologer_user_id
       or source_row.refund_id is distinct from original_source_row.refund_id
       or source_row.payout_request_id is distinct from original_source_row.payout_request_id then
      raise exception 'finance correction reversal must preserve the original source scope'
        using errcode = '23514';
    end if;

    if actual_entry_count <> (
         select count(*)
         from finance_journal_entries
         where journal_transaction_id = transaction_row.reverses_journal_transaction_id
       )
       or exists (
         select 1
         from finance_journal_entries reversal_entry
         left join finance_journal_entries original_entry
           on original_entry.journal_transaction_id = transaction_row.reverses_journal_transaction_id
          and original_entry.entry_index = reversal_entry.entry_index
         where reversal_entry.journal_transaction_id = transaction_row.id
           and (
             original_entry.id is null
             or reversal_entry.account_id is distinct from original_entry.account_id
             or reversal_entry.side = original_entry.side
             or reversal_entry.amount_minor is distinct from original_entry.amount_minor
             or reversal_entry.currency is distinct from original_entry.currency
             or reversal_entry.original_sale_id is distinct from original_entry.original_sale_id
             or reversal_entry.component_id is distinct from original_entry.component_id
             or reversal_entry.payable_lot_id is distinct from original_entry.payable_lot_id
             or reversal_entry.payout_allocation_id is distinct from original_entry.payout_allocation_id
           )
       ) then
      raise exception 'finance correction reversal must preserve the original entries'
        using errcode = '23514';
    end if;
  end if;

  if source_row.source_kind = 'correction' and (
    select count(*)
    from finance_source_identities paired_source
    join finance_journal_transactions paired_transaction
      on paired_transaction.source_identity_id = paired_source.id
    join finance_persistence_commit_receipts paired_receipt
      on paired_receipt.source_identity_id = paired_source.id
     and paired_receipt.journal_transaction_id = paired_transaction.id
    where paired_source.source_kind = 'correction'
      and paired_source.source_id = source_row.source_id
      and paired_source.source_operation_key = case
        when source_row.source_operation_key = 'reversal' then 'replacement'
        else 'reversal'
      end
      and paired_transaction.sealed_at is not null
      and paired_receipt.persistence_transaction_boundary_ref =
          receipt_row.persistence_transaction_boundary_ref
      and (
        (
          source_row.source_operation_key = 'reversal'
          and transaction_row.reverses_journal_transaction_id = source_row.source_id
          and paired_transaction.reverses_journal_transaction_id is null
        )
        or (
          source_row.source_operation_key = 'replacement'
          and transaction_row.reverses_journal_transaction_id is null
          and paired_transaction.reverses_journal_transaction_id = source_row.source_id
        )
      )
  ) <> 1 then
    raise exception 'finance correction reversal and replacement must commit as one pair'
      using errcode = '23514';
  end if;

  return transaction_row;
exception
  when no_data_found or too_many_rows then
    raise exception 'finance journal commit graph is incomplete or ambiguous'
      using errcode = '23514';
end;
$$;

create or replace function finance_assert_source_identity_owned()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (select count(*) from finance_journal_transactions where source_identity_id = new.id) <> 1 then
    raise exception 'finance source identity must own exactly one journal transaction'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function finance_assert_account_used()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from finance_journal_entries where account_id = new.id) then
    raise exception 'finance account must be created with its first journal posting'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function finance_guard_journal_transaction_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' or old.sealed_at is not null then
    raise exception 'sealed finance journal transactions are immutable'
      using errcode = '55000';
  end if;
  if new.id is distinct from old.id
     or new.source_identity_id is distinct from old.source_identity_id
     or new.occurred_at is distinct from old.occurred_at
     or new.posted_at is distinct from old.posted_at
     or new.reverses_journal_transaction_id is distinct from old.reverses_journal_transaction_id
     or new.currency is distinct from old.currency
     or new.created_at is distinct from old.created_at
     or new.sealed_at is null
     or new.entry_count < 2
     or new.total_debit_minor is null
     or new.total_credit_minor is null
     or new.canonical_preimage is not null
     or new.canonical_digest is not null then
    raise exception 'unsealed finance journal may only transition once to sealed'
      using errcode = '55000';
  end if;
  -- The caller requests the one-way seal transition but cannot choose its audit timestamp.
  new.canonical_preimage := finance_journal_transaction_preimage(new.id);
  if new.canonical_preimage is null then
    raise exception 'finance journal canonical transaction preimage is incomplete'
      using errcode = '23514';
  end if;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  new.sealed_at := statement_timestamp();
  return new;
end;
$$;

create or replace function finance_guard_journal_entry_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'finance journal entries are immutable'
      using errcode = '55000';
  end if;
  if not exists (
    select 1 from finance_journal_transactions
    where id = new.journal_transaction_id and sealed_at is null
  ) then
    raise exception 'finance journal entries may only be inserted while the parent is unsealed'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function finance_guard_link_proof_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  parent_transaction_id varchar(200);
begin
  if tg_op <> 'INSERT' then
    raise exception 'finance allocation link proofs are immutable'
      using errcode = '55000';
  end if;
  if tg_table_name = 'finance_allocation_link_proofs' then
    parent_transaction_id := new.journal_transaction_id;
  else
    select journal_transaction_id into strict parent_transaction_id
    from finance_allocation_link_proofs
    where id = new.proof_record_id;
  end if;
  if not exists (
    select 1 from finance_journal_transactions
    where id = parent_transaction_id and sealed_at is null
  ) then
    raise exception 'finance allocation proof may only be inserted while the parent is unsealed'
      using errcode = '55000';
  end if;
  return new;
exception
  when no_data_found or too_many_rows then
    raise exception 'finance allocation proof parent is missing or ambiguous'
      using errcode = '23503';
end;
$$;

create or replace function finance_guard_commit_receipt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'finance persistence commit receipts are immutable'
      using errcode = '55000';
  end if;
  -- Receipt issuance is database authority; ignore any caller-supplied timestamp.
  new.issued_at := statement_timestamp();
  if not exists (
    select 1
    from finance_journal_transactions journal_transaction
    join finance_source_identities source_identity
      on source_identity.id = journal_transaction.source_identity_id
    join finance_allocation_link_proofs proof
      on proof.journal_transaction_id = journal_transaction.id
    where journal_transaction.id = new.journal_transaction_id
      and journal_transaction.source_identity_id = new.source_identity_id
      and journal_transaction.sealed_at is not null
      and new.issued_at >= journal_transaction.sealed_at
      and proof.id = new.proof_record_id
      and proof.journal_source_kind = source_identity.source_kind
      and proof.journal_source_id = source_identity.source_id
      and proof.journal_source_operation_key = source_identity.source_operation_key
      and new.canonical_preimage = finance_journal_receipt_preimage(
        new.receipt_id,
        new.source_identity_id,
        new.journal_transaction_id,
        new.proof_record_id,
        proof.proof_digest,
        new.persistence_transaction_boundary_ref
      )
      and new.canonical_digest = 'sha256:' || encode(
        digest(new.canonical_preimage, 'sha256'),
        'hex'
      )
      and (
        select count(*)
        from finance_allocation_link_proof_entries
        where proof_record_id = proof.id
      ) = (
        select count(*)
        from finance_journal_entries
        where journal_transaction_id = journal_transaction.id
      )
      and not exists (
        select 1
        from finance_journal_entries entry_row
        left join finance_allocation_link_proof_entries proof_entry
          on proof_entry.journal_entry_id = entry_row.id
         and proof_entry.proof_record_id = proof.id
        where entry_row.journal_transaction_id = journal_transaction.id
          and (
            proof_entry.id is null
            or proof_entry.entry_index is distinct from entry_row.entry_index
            or proof_entry.account_id is distinct from entry_row.account_id
            or proof_entry.side is distinct from entry_row.side
            or proof_entry.amount_minor is distinct from entry_row.amount_minor
            or proof_entry.currency is distinct from entry_row.currency
            or proof_entry.original_sale_id is distinct from entry_row.original_sale_id
            or proof_entry.component_id is distinct from entry_row.component_id
            or proof_entry.payable_lot_id is distinct from entry_row.payable_lot_id
            or proof_entry.payout_allocation_id is distinct from entry_row.payout_allocation_id
          )
      )
  ) then
    raise exception 'finance journal persistence receipt is cross-wired'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function finance_reject_immutable_finance_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'immutable finance history cannot be changed'
    using errcode = '55000';
end;
$$;

create or replace function finance_reject_history_truncate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'immutable finance history cannot be truncated'
    using errcode = '55000';
end;
$$;

create constraint trigger finance_journal_commit_integrity
after insert or update on finance_journal_transactions
deferrable initially deferred for each row
execute function finance_assert_journal_commit_integrity();

create constraint trigger finance_source_identity_owned
after insert on finance_source_identities
deferrable initially deferred for each row
execute function finance_assert_source_identity_owned();

create constraint trigger finance_account_used
after insert on finance_accounts
deferrable initially deferred for each row
execute function finance_assert_account_used();

create trigger finance_accounts_immutable_update_delete
before update or delete on finance_accounts
for each row execute function finance_reject_immutable_finance_history_mutation();

create trigger finance_source_identities_immutable_update_delete
before update or delete on finance_source_identities
for each row execute function finance_reject_immutable_finance_history_mutation();

create trigger finance_journal_transactions_protected_update_delete
before update or delete on finance_journal_transactions
for each row execute function finance_guard_journal_transaction_mutation();

create trigger finance_journal_entries_immutable_mutation
before insert or update or delete on finance_journal_entries
for each row execute function finance_guard_journal_entry_mutation();

create trigger finance_allocation_link_proofs_immutable_mutation
before insert or update or delete on finance_allocation_link_proofs
for each row execute function finance_guard_link_proof_mutation();

create trigger finance_allocation_link_proof_entries_immutable_mutation
before insert or update or delete on finance_allocation_link_proof_entries
for each row execute function finance_guard_link_proof_mutation();

create trigger finance_persistence_commit_receipts_immutable_mutation
before insert or update or delete on finance_persistence_commit_receipts
for each row execute function finance_guard_commit_receipt_mutation();

create trigger finance_accounts_immutable_truncate
before truncate on finance_accounts
for each statement execute function finance_reject_history_truncate();

create trigger finance_source_identities_immutable_truncate
before truncate on finance_source_identities
for each statement execute function finance_reject_history_truncate();

create trigger finance_journal_transactions_immutable_truncate
before truncate on finance_journal_transactions
for each statement execute function finance_reject_history_truncate();

create trigger finance_journal_entries_immutable_truncate
before truncate on finance_journal_entries
for each statement execute function finance_reject_history_truncate();

create trigger finance_allocation_link_proofs_immutable_truncate
before truncate on finance_allocation_link_proofs
for each statement execute function finance_reject_history_truncate();

create trigger finance_allocation_link_proof_entries_immutable_truncate
before truncate on finance_allocation_link_proof_entries
for each statement execute function finance_reject_history_truncate();

create trigger finance_persistence_commit_receipts_immutable_truncate
before truncate on finance_persistence_commit_receipts
for each statement execute function finance_reject_history_truncate();
`;
