export const plansSql = `
  /* finance_inventory:plans */
  SELECT
    currency,
    count(*)::text AS row_count,
    coalesce(array_agg(id ORDER BY id), ARRAY[]::text[]) AS ids,
    coalesce(sum(monthly_price_minor::numeric), 0)::text AS monthly_amount_minor,
    coalesce(sum(yearly_price_minor::numeric), 0)::text AS yearly_amount_minor
  FROM platform_plans
  GROUP BY currency
  ORDER BY currency
`;

export const subscriptionsSql = `
  /* finance_inventory:subscriptions */
  SELECT
    count(*)::text AS row_count,
    coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids
  FROM platform_subscriptions
`;

export const currentSubscriptionsSql = `
  /* finance_inventory:current_subscriptions */
  SELECT id::text AS subscription_id, owner_user_id::text, status
  FROM platform_subscriptions
  WHERE is_current = true
  ORDER BY id
`;

export const invoicesSql = `
  /* finance_inventory:invoices */
  SELECT
    currency,
    count(*)::text AS row_count,
    coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids,
    coalesce(sum(amount_minor::numeric), 0)::text AS amount_minor
  FROM billing_invoices
  GROUP BY currency
  ORDER BY currency
`;

export const paidInvoicesSql = `
  /* finance_inventory:paid_invoices */
  SELECT id::text AS invoice_id, owner_user_id::text
  FROM billing_invoices
  WHERE status = $1
  ORDER BY id
`;

export const ordersSql = `
  /* finance_inventory:orders */
  SELECT
    orders.id::text AS order_id,
    orders.status AS order_status,
    CASE
      WHEN orders.status = ANY($1::text[])
        OR EXISTS (
          SELECT 1
          FROM payment_attempts captured_attempts
          WHERE captured_attempts.order_id = orders.id
            AND captured_attempts.status = ANY($3::text[])
        )
      THEN 'captured_like'
      ELSE 'authorized'
    END AS lifecycle_stage,
    orders.gross_currency AS currency,
    orders.gross_amount_minor::text AS gross_amount_minor,
    orders.platform_fee_amount_minor::text AS platform_fee_amount_minor,
    orders.astrologer_net_amount_minor::text AS astrologer_net_amount_minor
  FROM orders
  WHERE orders.status = ANY($1::text[])
     OR EXISTS (
       SELECT 1
       FROM payment_attempts selected_attempts
       WHERE selected_attempts.order_id = orders.id
         AND selected_attempts.status = ANY($2::text[])
     )
  ORDER BY orders.id
`;

export const paymentAttemptsSql = `
  /* finance_inventory:payment_attempts */
  SELECT
    id::text AS payment_attempt_id,
    order_id::text,
    status AS payment_status,
    CASE WHEN status = 'authorized' THEN 'authorized' ELSE 'captured_like' END AS lifecycle_stage,
    currency,
    amount_minor::text
  FROM payment_attempts
  WHERE status = ANY($1::text[])
  ORDER BY id
`;

export const refundsSql = `
  /* finance_inventory:refunds */
  SELECT
    currency,
    count(*)::text AS row_count,
    coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids,
    coalesce(sum(amount_minor::numeric), 0)::text AS amount_minor
  FROM refunds
  GROUP BY currency
  ORDER BY currency
`;

export const chargebacksSql = `
  /* finance_inventory:chargebacks */
  SELECT
    count(*)::text AS row_count,
    coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids
  FROM payment_provider_events
  WHERE type = $1
`;

export const chargebackReviewsSql = `
  /* finance_inventory:chargeback_reviews */
  SELECT
    count(*)::text AS row_count,
    coalesce(array_agg(reviews.id::text ORDER BY reviews.id), ARRAY[]::text[]) AS ids
  FROM payment_reversal_case_reviews reviews
  JOIN payment_provider_events events ON events.id = reviews.provider_event_id
  WHERE events.type = $1
`;

export const ledgerAccountsSql = `
  /* finance_inventory:ledger_accounts */
  SELECT
    accounts.id::text AS account_id,
    accounts.account_type,
    accounts.astrologer_user_id::text,
    accounts.balance_bucket,
    coalesce(entries.currency, accounts.currency) AS currency,
    coalesce(sum(entries.amount_minor::numeric) FILTER (WHERE entries.entry_side = 'debit'), 0)::text AS debit_amount_minor,
    coalesce(sum(entries.amount_minor::numeric) FILTER (WHERE entries.entry_side = 'credit'), 0)::text AS credit_amount_minor
  FROM ledger_accounts accounts
  LEFT JOIN ledger_entries entries ON entries.account_id = accounts.id
  GROUP BY
    accounts.id,
    accounts.account_type,
    accounts.astrologer_user_id,
    accounts.balance_bucket,
    coalesce(entries.currency, accounts.currency)
  ORDER BY currency, accounts.account_type, accounts.id
`;

export const ledgerTransactionsSql = `
  /* finance_inventory:ledger_transactions */
  SELECT
    count(*)::text AS row_count,
    coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids
  FROM ledger_transactions
`;

export const ledgerEntriesSql = `
  /* finance_inventory:ledger_entries */
  SELECT
    currency,
    count(*)::text AS row_count,
    coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids,
    coalesce(sum(amount_minor::numeric), 0)::text AS amount_minor,
    coalesce(sum(amount_minor::numeric) FILTER (WHERE entry_side = 'debit'), 0)::text AS debit_amount_minor,
    coalesce(sum(amount_minor::numeric) FILTER (WHERE entry_side = 'credit'), 0)::text AS credit_amount_minor
  FROM ledger_entries
  GROUP BY currency
  ORDER BY currency
`;

export const unbalancedJournalsSql = `
  /* finance_inventory:unbalanced_journals */
  SELECT
    transactions.id::text AS transaction_id,
    coalesce(entries.currency, 'UNKNOWN') AS currency,
    coalesce(sum(entries.amount_minor::numeric) FILTER (WHERE entries.entry_side = 'debit'), 0)::text AS debit_amount_minor,
    coalesce(sum(entries.amount_minor::numeric) FILTER (WHERE entries.entry_side = 'credit'), 0)::text AS credit_amount_minor
  FROM ledger_transactions transactions
  LEFT JOIN ledger_entries entries ON entries.ledger_transaction_id = transactions.id
  GROUP BY transactions.id, coalesce(entries.currency, 'UNKNOWN')
  HAVING
    count(entries.id) = 0
    OR coalesce(sum(entries.amount_minor::numeric) FILTER (WHERE entries.entry_side = 'debit'), 0)
       <> coalesce(sum(entries.amount_minor::numeric) FILTER (WHERE entries.entry_side = 'credit'), 0)
  ORDER BY currency, transactions.id
`;

export const walletProjectionsSql = `
  /* finance_inventory:wallet_projections */
  SELECT
    wallets.astrologer_user_id::text,
    balances.balance_bucket,
    balances.currency,
    balances.amount_minor::text
  FROM wallet_balance_read_models wallets
  CROSS JOIN LATERAL (
    VALUES
      ('pending', wallets.pending_currency, wallets.pending_amount_minor),
      ('available', wallets.available_currency, wallets.available_amount_minor),
      ('reserved', wallets.reserved_currency, wallets.reserved_amount_minor),
      ('payout_pending', wallets.payout_pending_currency, wallets.payout_pending_amount_minor),
      ('negative_balance', wallets.negative_balance_currency, wallets.negative_balance_amount_minor)
  ) AS balances(balance_bucket, currency, amount_minor)
  ORDER BY wallets.astrologer_user_id, balances.balance_bucket
`;

export const openPayoutsSql = `
  /* finance_inventory:open_payouts */
  SELECT
    currency,
    count(*)::text AS row_count,
    coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids,
    coalesce(sum(amount_minor::numeric), 0)::text AS amount_minor
  FROM payout_requests
  WHERE status = ANY($1::text[])
  GROUP BY currency
  ORDER BY currency
`;

export const settlementEntriesSql = `
  /* finance_inventory:settlement_entries */
  SELECT
    count(*)::text AS row_count,
    coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids
  FROM reconciliation_records
  WHERE provider_settlement_id IS NOT NULL
`;

export const monetaryControlsSql = `
  /* finance_inventory:monetary_controls */
  WITH captured_orders AS (
    SELECT gross_currency AS currency, sum(gross_amount_minor::numeric) AS amount_minor
    FROM orders
    WHERE status = ANY($1::text[])
    GROUP BY gross_currency
  ), captured_attempts AS (
    SELECT currency, sum(amount_minor::numeric) AS amount_minor
    FROM payment_attempts
    WHERE status = ANY($2::text[])
    GROUP BY currency
  )
  SELECT
    coalesce(captured_orders.currency, captured_attempts.currency) AS currency,
    coalesce(captured_orders.amount_minor, 0)::text AS expected_amount_minor,
    coalesce(captured_attempts.amount_minor, 0)::text AS observed_amount_minor
  FROM captured_orders
  FULL JOIN captured_attempts ON captured_attempts.currency = captured_orders.currency
  ORDER BY currency
`;

/**
 * Current-baseline inventory sources. These names deliberately differ from the
 * legacy projections above: a current finance report must never infer
 * availability from pre-reset `orders`, `ledger_*`, or `payout_requests`.
 */
export const canonicalPlansSql = `
  /* finance_inventory:canonical_plans */
  SELECT currency, count(*)::text AS row_count,
    coalesce(array_agg((tariff_series_id || ':' || version::text) ORDER BY tariff_series_id, version), ARRAY[]::text[]) AS ids,
    coalesce(sum(monthly_price_minor::numeric), 0)::text AS monthly_amount_minor,
    coalesce(sum(yearly_price_minor::numeric), 0)::text AS yearly_amount_minor
  FROM platform_tariff_versions
  GROUP BY currency ORDER BY currency
`;

export const canonicalSubscriptionsSql = `
  /* finance_inventory:canonical_subscriptions */
  SELECT count(*)::text AS row_count, coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids
  FROM platform_tariff_subscriptions
`;

export const canonicalCurrentSubscriptionsSql = `
  /* finance_inventory:canonical_current_subscriptions */
  SELECT id::text AS subscription_id, owner_user_id::text, state AS status
  FROM platform_tariff_subscriptions
  WHERE state IN ('incomplete_setup', 'awaiting_initial_payment', 'active', 'past_due')
  ORDER BY id
`;

export const canonicalInvoicesSql = `
  /* finance_inventory:canonical_invoices */
  SELECT currency, count(*)::text AS row_count,
    coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids,
    coalesce(sum(amount_minor::numeric), 0)::text AS amount_minor
  FROM platform_tariff_invoices
  GROUP BY currency ORDER BY currency
`;

export const canonicalPaidInvoicesSql = `
  /* finance_inventory:canonical_paid_invoices */
  SELECT id::text AS invoice_id, owner_user_id::text
  FROM platform_tariff_invoices WHERE state = 'captured' ORDER BY id
`;

export const canonicalCountSql = {
  chargebacks: `/* finance_inventory:canonical_chargebacks */ SELECT count(*)::text AS row_count, coalesce(array_agg(id ORDER BY id), ARRAY[]::text[]) AS ids FROM finance_provider_semantic_facts WHERE semantic_source_kind = 'chargeback'`,
  chargebackReviews: `/* finance_inventory:canonical_chargeback_reviews */ SELECT count(*)::text AS row_count, coalesce(array_agg(id ORDER BY id), ARRAY[]::text[]) AS ids FROM finance_provider_semantic_facts WHERE semantic_source_kind = 'chargeback' AND effect_disposition = 'quarantined_no_effect'`,
  journalTransactions: `/* finance_inventory:canonical_journal_transactions */ SELECT count(*)::text AS row_count, coalesce(array_agg(id ORDER BY id), ARRAY[]::text[]) AS ids FROM finance_journal_transactions`,
  settlementEntries: `/* finance_inventory:canonical_settlement_entries */ SELECT count(*)::text AS row_count, coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids FROM finance_settlement_ledger_entries`,
  settlementCursors: `/* finance_inventory:canonical_settlement_cursors */ SELECT count(*)::text AS row_count, coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids FROM finance_settlement_cursors`,
  bankCashSnapshots: `/* finance_inventory:canonical_bank_cash_snapshots */ SELECT count(*)::text AS row_count, coalesce(array_agg(snapshot_id ORDER BY snapshot_id), ARRAY[]::text[]) AS ids FROM finance_bank_liquidity_snapshots`,
  bankStatements: `/* finance_inventory:canonical_bank_statements */ SELECT count(*)::text AS row_count, coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids FROM finance_bank_statement_imports`,
  bankExposures: `/* finance_inventory:canonical_bank_exposures */ SELECT count(*)::text AS row_count, coalesce(array_agg(exposure_id ORDER BY exposure_id), ARRAY[]::text[]) AS ids FROM finance_bank_exposures`,
  providerAccounts: `/* finance_inventory:canonical_provider_accounts */ SELECT count(*)::text AS row_count, coalesce(array_agg(provider_account_id ORDER BY provider_account_id), ARRAY[]::text[]) AS ids FROM finance_provider_accounts`,
  bankCashPools: `/* finance_inventory:canonical_bank_cash_pools */ SELECT count(*)::text AS row_count, coalesce(array_agg(id ORDER BY id), ARRAY[]::text[]) AS ids FROM finance_bank_cash_pools`
} as const;

export const canonicalJournalAccountsSql = `
  /* finance_inventory:canonical_journal_accounts */
  SELECT accounts.id::text AS account_id, accounts.code AS account_type,
    accounts.astrologer_user_id::text, NULL::text AS balance_bucket,
    accounts.currency,
    coalesce(sum(entries.amount_minor::numeric) FILTER (WHERE entries.side = 'debit'), 0)::text AS debit_amount_minor,
    coalesce(sum(entries.amount_minor::numeric) FILTER (WHERE entries.side = 'credit'), 0)::text AS credit_amount_minor
  FROM finance_accounts accounts
  LEFT JOIN finance_journal_entries entries ON entries.account_id = accounts.id
  GROUP BY accounts.id, accounts.code, accounts.astrologer_user_id, accounts.currency
  ORDER BY accounts.currency, accounts.code, accounts.id
`;

export const canonicalJournalEntriesSql = `
  /* finance_inventory:canonical_journal_entries */
  SELECT currency, count(*)::text AS row_count,
    coalesce(array_agg(id::text ORDER BY id), ARRAY[]::text[]) AS ids,
    coalesce(sum(amount_minor::numeric), 0)::text AS amount_minor,
    coalesce(sum(amount_minor::numeric) FILTER (WHERE side = 'debit'), 0)::text AS debit_amount_minor,
    coalesce(sum(amount_minor::numeric) FILTER (WHERE side = 'credit'), 0)::text AS credit_amount_minor
  FROM finance_journal_entries GROUP BY currency ORDER BY currency
`;

/**
 * Provider control joins the account balance recorded by the sealed journal to
 * the most recent immutable ArcPay ledger position for the same provider
 * identity and currency. A provider account without a `balance_after` fact is
 * intentionally absent: the domain inventory gate then reports it as missing
 * rather than treating a configured account as a zero-balance control.
 */
export const canonicalProviderControlsSql = `
  /* finance_inventory:canonical_provider_controls */
  WITH latest_provider_evidence AS (
    SELECT DISTINCT ON (
      provider_account_series_id,
      provider_account_id,
      provider_identity_version,
      currency
    )
      provider_account_series_id,
      provider_account_id,
      provider_identity_version,
      currency,
      balance_after_minor
    FROM finance_settlement_ledger_entries
    WHERE balance_after_minor IS NOT NULL
    ORDER BY
      provider_account_series_id,
      provider_account_id,
      provider_identity_version,
      currency,
      occurred_at::timestamptz DESC NULLS LAST,
      first_seen_at DESC,
      provider_entry_id DESC
  ), internal_clearing AS (
    SELECT
      accounts.provider_account_series_id,
      accounts.provider_account_id,
      accounts.provider_identity_version,
      accounts.currency,
      coalesce(
        sum(
          CASE entries.side
            WHEN 'debit' THEN entries.amount_minor::numeric
            WHEN 'credit' THEN -entries.amount_minor::numeric
          END
        ),
        0
      )::text AS internal_amount_minor
    FROM finance_accounts accounts
    LEFT JOIN finance_journal_entries entries ON entries.account_id = accounts.id
    WHERE accounts.code = 'arc_provider_clearing'
      AND accounts.scope_kind = 'arc_provider_account'
    GROUP BY
      accounts.provider_account_series_id,
      accounts.provider_account_id,
      accounts.provider_identity_version,
      accounts.currency
  )
  SELECT
    evidence.provider_account_id,
    evidence.currency,
    coalesce(internal_clearing.internal_amount_minor, '0') AS internal_amount_minor,
    evidence.balance_after_minor::text AS provider_evidence_amount_minor
  FROM latest_provider_evidence evidence
  LEFT JOIN internal_clearing
    ON internal_clearing.provider_account_series_id = evidence.provider_account_series_id
   AND internal_clearing.provider_account_id = evidence.provider_account_id
   AND internal_clearing.provider_identity_version = evidence.provider_identity_version
   AND internal_clearing.currency = evidence.currency
  ORDER BY evidence.provider_account_id, evidence.currency
`;

export const canonicalUnbalancedJournalsSql = `
  /* finance_inventory:canonical_unbalanced_journals */
  SELECT id AS transaction_id, currency,
    coalesce(total_debit_minor, 0)::text AS debit_amount_minor,
    coalesce(total_credit_minor, 0)::text AS credit_amount_minor
  FROM finance_journal_transactions
  WHERE sealed_at IS NULL OR total_debit_minor <> total_credit_minor
  ORDER BY currency, id
`;

export const canonicalWalletProjectionsSql = `
  /* finance_inventory:canonical_wallet_projections */
  SELECT astrologer_user_id::text, balances.balance_bucket, heads.currency, balances.amount_minor::text
  FROM finance_wallet_heads heads
  CROSS JOIN LATERAL (VALUES
    ('pending', heads.pending_minor), ('available', heads.available_minor),
    ('reserved', heads.reserved_minor), ('payout_pending', heads.payout_pending_minor),
    ('refund_pending', heads.refund_pending_minor), ('recovery_receivable', heads.recovery_receivable_minor)
  ) AS balances(balance_bucket, amount_minor)
  ORDER BY heads.astrologer_user_id, balances.balance_bucket
`;

export const canonicalSourceLotsSql = `
  /* finance_inventory:canonical_source_lots */
  SELECT astrologer_user_id::text, bucket AS balance_bucket, currency, sum(amount_minor::numeric)::text AS amount_minor
  FROM finance_payable_lots GROUP BY astrologer_user_id, bucket, currency
  ORDER BY astrologer_user_id, bucket, currency
`;

export const canonicalOpenPayoutsSql = `
  /* finance_inventory:canonical_open_payouts */
  SELECT currency, count(*)::text AS row_count,
    coalesce(array_agg(id ORDER BY id), ARRAY[]::text[]) AS ids,
    coalesce(sum(immutable_amount_minor::numeric), 0)::text AS amount_minor
  FROM finance_payout_requests WHERE status = 'requested'
  GROUP BY currency ORDER BY currency
`;

export const canonicalRefundsSql = `
  /* finance_inventory:canonical_refunds */
  SELECT currency, count(*)::text AS row_count,
    coalesce(array_agg(id ORDER BY id), ARRAY[]::text[]) AS ids,
    coalesce(sum(approved_cumulative_refunded_minor - previous_cumulative_refunded_minor), 0)::text AS amount_minor
  FROM finance_refund_cases GROUP BY currency ORDER BY currency
`;
