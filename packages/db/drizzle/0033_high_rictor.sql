ALTER TABLE "finance_readiness_evidence_versions" DROP CONSTRAINT "finance_readiness_evidence_requirement_check";--> statement-breakpoint
ALTER TABLE "finance_readiness_evidence_versions" DROP CONSTRAINT "finance_readiness_evidence_scope_check";--> statement-breakpoint
ALTER TABLE "finance_provider_accounts" DROP CONSTRAINT "finance_provider_accounts_environment_check";--> statement-breakpoint
ALTER TABLE "finance_webhook_inbox" DROP CONSTRAINT "finance_webhook_inbox_signature_check";--> statement-breakpoint
ALTER TABLE "finance_webhook_stored_receipts" DROP CONSTRAINT "finance_webhook_stored_receipts_shape_check";--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_environment_check";--> statement-breakpoint
ALTER TABLE "payment_provider_events" DROP CONSTRAINT "payment_provider_events_environment_check";--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_environment_check";--> statement-breakpoint
ALTER TABLE "reconciliation_records" DROP CONSTRAINT "reconciliation_records_environment_check";--> statement-breakpoint
DROP INDEX "finance_readiness_evidence_current_lookup_idx";--> statement-breakpoint
DROP INDEX "finance_provider_accounts_readiness_lookup_idx";--> statement-breakpoint
DROP INDEX "payment_attempts_provider_payment_unique";--> statement-breakpoint
DROP INDEX "payment_attempts_provider_status_idx";--> statement-breakpoint
DROP INDEX "payment_provider_events_webhook_unique";--> statement-breakpoint
DROP INDEX "payment_provider_events_payment_idx";--> statement-breakpoint
DROP INDEX "refunds_provider_refund_unique";--> statement-breakpoint
DROP INDEX "reconciliation_records_provider_payment_idx";--> statement-breakpoint
DROP INDEX "reconciliation_records_provider_payout_idx";--> statement-breakpoint
CREATE INDEX "finance_readiness_evidence_current_lookup_idx" ON "finance_readiness_evidence_versions" USING btree ("is_current","requirement_code","transaction_category","effective_at");--> statement-breakpoint
CREATE INDEX "finance_provider_accounts_readiness_lookup_idx" ON "finance_provider_accounts" USING btree ("series_id","provider_account_id","identity_version");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_payment_unique" ON "payment_attempts" USING btree ("provider","provider_payment_id") WHERE "payment_attempts"."provider_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "payment_attempts_provider_status_idx" ON "payment_attempts" USING btree ("provider","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_events_webhook_unique" ON "payment_provider_events" USING btree ("provider","provider_webhook_id");--> statement-breakpoint
CREATE INDEX "payment_provider_events_payment_idx" ON "payment_provider_events" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_refund_unique" ON "refunds" USING btree ("provider","provider_refund_id") WHERE "refunds"."provider_refund_id" is not null;--> statement-breakpoint
CREATE INDEX "reconciliation_records_provider_payment_idx" ON "reconciliation_records" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "reconciliation_records_provider_payout_idx" ON "reconciliation_records" USING btree ("provider","provider_payout_id");--> statement-breakpoint
ALTER TABLE "finance_readiness_evidence_versions" DROP COLUMN "environment";--> statement-breakpoint
ALTER TABLE "finance_provider_accounts" DROP COLUMN "environment";--> statement-breakpoint
ALTER TABLE "finance_webhook_inbox" DROP COLUMN "receiving_environment";--> statement-breakpoint
ALTER TABLE "finance_webhook_stored_receipts" DROP COLUMN "receiving_environment";--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP COLUMN "environment";--> statement-breakpoint
ALTER TABLE "payment_provider_events" DROP COLUMN "environment";--> statement-breakpoint
ALTER TABLE "refunds" DROP COLUMN "environment";--> statement-breakpoint
ALTER TABLE "reconciliation_records" DROP COLUMN "environment";--> statement-breakpoint
ALTER TABLE "finance_readiness_evidence_versions" DISABLE TRIGGER "finance_readiness_evidence_versions_immutable";--> statement-breakpoint
DELETE FROM "finance_readiness_evidence_versions" WHERE "requirement_code" = 'arc_pay_environment';--> statement-breakpoint
UPDATE "finance_readiness_evidence_versions"
SET "scope_key" = "requirement_code" || ':' || coalesce("transaction_category", 'global')
WHERE "scope_key" <> "requirement_code" || ':' || coalesce("transaction_category", 'global');--> statement-breakpoint
ALTER TABLE "finance_readiness_evidence_versions" ENABLE TRIGGER "finance_readiness_evidence_versions_immutable";--> statement-breakpoint
ALTER TABLE "finance_readiness_evidence_versions" ADD CONSTRAINT "finance_readiness_evidence_requirement_check" CHECK ("finance_readiness_evidence_versions"."requirement_code" in ('legal_accounting_client_purchase', 'legal_accounting_platform_subscription', 'commercial_tariff', 'capability_enforcement', 'billing_operations_policy', 'risk_policy', 'product_fulfillment', 'refund_chargeback_principal_policy', 'finance_step_up', 'payout_recipient_policy', 'bank_liquidity_policy')
        and "finance_readiness_evidence_versions"."status" in ('active', 'revoked'));--> statement-breakpoint
ALTER TABLE "finance_readiness_evidence_versions" ADD CONSTRAINT "finance_readiness_evidence_scope_check" CHECK ("finance_readiness_evidence_versions"."scope_key" = "finance_readiness_evidence_versions"."requirement_code" || ':' || coalesce("finance_readiness_evidence_versions"."transaction_category", 'global')
        and (
          ("finance_readiness_evidence_versions"."requirement_code" in ('legal_accounting_client_purchase', 'legal_accounting_platform_subscription')
            and "finance_readiness_evidence_versions"."transaction_category" in ('client_purchase', 'platform_subscription'))
          or ("finance_readiness_evidence_versions"."requirement_code" not in ('legal_accounting_client_purchase', 'legal_accounting_platform_subscription')
            and "finance_readiness_evidence_versions"."transaction_category" is null)
        ));--> statement-breakpoint
ALTER TABLE "finance_webhook_inbox" ADD CONSTRAINT "finance_webhook_inbox_signature_check" CHECK ("finance_webhook_inbox"."provider" in ('arc_pay')
        and "finance_webhook_inbox"."signature_status" = 'verified'
        and "finance_webhook_inbox"."raw_body_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "finance_webhook_inbox"."signature_evidence_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "finance_webhook_inbox"."verified_at" <= "finance_webhook_inbox"."received_at");--> statement-breakpoint
ALTER TABLE "finance_webhook_stored_receipts" ADD CONSTRAINT "finance_webhook_stored_receipts_shape_check" CHECK ("finance_webhook_stored_receipts"."inbox_version" = 1
        and "finance_webhook_stored_receipts"."provider" in ('arc_pay')
        and "finance_webhook_stored_receipts"."signature_status" = 'verified'
        and "finance_webhook_stored_receipts"."raw_body_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "finance_webhook_stored_receipts"."signature_evidence_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "finance_webhook_stored_receipts"."canonical_digest" ~ '^sha256:[a-f0-9]{64}$'
        and length("finance_webhook_stored_receipts"."canonical_preimage") between 1 and 16000
        and "finance_webhook_stored_receipts"."persistence_transaction_boundary_ref" ~ '^postgres-xid:[0-9]+$'
        and "finance_webhook_stored_receipts"."verified_at" <= "finance_webhook_stored_receipts"."received_at"
        and "finance_webhook_stored_receipts"."stored_at" >= "finance_webhook_stored_receipts"."received_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_protect_readiness_evidence_version()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF tg_op = 'DELETE' THEN
    RAISE EXCEPTION 'finance readiness evidence versions are append-only' USING errcode = '55000';
  END IF;
  IF tg_op = 'INSERT' THEN
    PERFORM 1 FROM finance_readiness_evidence_versions WHERE evidence_id = new.evidence_id FOR UPDATE;
    IF NOT FOUND THEN
      IF new.evidence_version <> 1 THEN
        RAISE EXCEPTION 'readiness evidence version must start at one' USING errcode = '23514';
      END IF;
      RETURN new;
    END IF;
    IF new.evidence_version <> (SELECT max(evidence_version) + 1 FROM finance_readiness_evidence_versions WHERE evidence_id = new.evidence_id) THEN
      RAISE EXCEPTION 'readiness evidence version must advance by one' USING errcode = '40001';
    END IF;
    RETURN new;
  END IF;
  IF new.evidence_id <> old.evidence_id
     OR new.evidence_version <> old.evidence_version
     OR new.requirement_code <> old.requirement_code
     OR new.transaction_category IS DISTINCT FROM old.transaction_category
     OR new.scope_key <> old.scope_key
     OR new.status <> old.status
     OR new.effective_at <> old.effective_at
     OR new.expires_at IS DISTINCT FROM old.expires_at
     OR new.safe_digest <> old.safe_digest
     OR new.created_at <> old.created_at
     OR old.is_current <> true
     OR new.is_current <> false THEN
    RAISE EXCEPTION 'readiness evidence may only retire a current version' USING errcode = '55000';
  END IF;
  RETURN new;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_issue_webhook_stored_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE inbox finance_webhook_inbox%rowtype;
BEGIN
  SELECT * INTO STRICT inbox FROM finance_webhook_inbox WHERE id = new.inbox_item_id;
  new.inbox_version := inbox.version;
  new.series_id := inbox.series_id;
  new.provider_account_id := inbox.provider_account_id;
  new.provider_identity_version := inbox.provider_identity_version;
  new.provider := inbox.provider;
  new.transport_event_id := inbox.transport_event_id;
  new.provider_event_type := inbox.provider_event_type;
  new.artifact_id := inbox.artifact_id;
  new.raw_body_digest := inbox.raw_body_digest;
  new.signature_status := inbox.signature_status;
  new.signature_scheme := inbox.signature_scheme;
  new.verifier_contract_version := inbox.verifier_contract_version;
  new.webhook_signing_key_version_id := inbox.webhook_signing_key_version_id;
  new.signed_timestamp := inbox.signed_timestamp;
  new.signature_evidence_digest := inbox.signature_evidence_digest;
  new.verified_at := inbox.verified_at;
  new.received_at := inbox.received_at;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.stored_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'webhook_stored_before_ack_receipt', 'schemaVersion', 1,
    'receiptId', new.id::text, 'inboxItemId', new.inbox_item_id, 'inboxVersion', new.inbox_version::text,
    'seriesId', new.series_id, 'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version, 'provider', new.provider,
    'transportEventId', new.transport_event_id, 'providerEventType', new.provider_event_type,
    'artifactId', new.artifact_id, 'rawBodyDigest', new.raw_body_digest,
    'signatureStatus', new.signature_status, 'signatureScheme', new.signature_scheme,
    'verifierContractVersion', new.verifier_contract_version,
    'webhookSigningKeyVersionId', new.webhook_signing_key_version_id,
    'signedTimestamp', to_char(new.signed_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'signatureEvidenceDigest', new.signature_evidence_digest,
    'verifiedAt', to_char(new.verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'receivedAt', to_char(new.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'storedAt', to_char(new.stored_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  RETURN new;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_validate_webhook_inbox_head()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.received_at := clock_timestamp(); new.available_at := new.received_at; new.updated_at := new.received_at;
    IF new.version <> 1 OR new.processing_status <> 'stored' OR new.processing_attempts <> 0 OR new.lease_fence <> 0
       OR new.lease_owner_id IS NOT NULL OR new.lease_expires_at IS NOT NULL OR new.claimed_at IS NOT NULL OR new.last_checkpoint_sequence <> 0 THEN
      RAISE EXCEPTION 'webhook inbox must start stored at version one' USING errcode = '23514';
    END IF;
    RETURN new;
  END IF;
  new.updated_at := clock_timestamp();
  IF new.id <> old.id OR new.series_id <> old.series_id OR new.provider_account_id <> old.provider_account_id
     OR new.provider_identity_version <> old.provider_identity_version OR new.provider <> old.provider
     OR new.transport_event_id <> old.transport_event_id OR new.provider_event_type <> old.provider_event_type
     OR new.artifact_id <> old.artifact_id OR new.raw_body_digest <> old.raw_body_digest
     OR new.signature_status <> old.signature_status OR new.signature_scheme <> old.signature_scheme
     OR new.verifier_contract_version <> old.verifier_contract_version
     OR new.webhook_signing_key_version_id <> old.webhook_signing_key_version_id
     OR new.signed_timestamp <> old.signed_timestamp OR new.signature_evidence_digest <> old.signature_evidence_digest
     OR new.verified_at <> old.verified_at OR new.received_at <> old.received_at THEN
    RAISE EXCEPTION 'webhook ingress identity and signature evidence are immutable' USING errcode = '55000';
  END IF;
  IF new.version <> old.version + 1 THEN RAISE EXCEPTION 'webhook inbox version conflict' USING errcode = '40001'; END IF;
  IF old.processing_status IN ('completed', 'quarantined') THEN RAISE EXCEPTION 'terminal webhook inbox cannot transition' USING errcode = '23514'; END IF;
  IF old.processing_status = 'stored' THEN
    IF new.processing_status <> 'processing' OR new.processing_attempts <> old.processing_attempts + 1 OR new.lease_fence <> old.lease_fence + 1 THEN
      RAISE EXCEPTION 'stored webhook may only be claimed with a new fence' USING errcode = '23514';
    END IF;
  ELSIF new.processing_status = 'processing' THEN
    IF NOT ((new.lease_fence = old.lease_fence AND new.processing_attempts = old.processing_attempts)
      OR (new.lease_fence = old.lease_fence + 1 AND new.processing_attempts = old.processing_attempts + 1)) THEN
      RAISE EXCEPTION 'webhook renew or reclaim fence is invalid' USING errcode = '40001';
    END IF;
  ELSIF new.processing_status IN ('stored', 'completed', 'quarantined') THEN
    IF new.lease_fence <> old.lease_fence OR new.processing_attempts <> old.processing_attempts THEN
      RAISE EXCEPTION 'webhook completion cannot change the issued fence' USING errcode = '40001';
    END IF;
  ELSE RAISE EXCEPTION 'webhook transition is not allowed' USING errcode = '23514'; END IF;
  RETURN new;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_validate_webhook_artifact()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE artifact finance_artifacts%rowtype; provider_account finance_provider_accounts%rowtype;
BEGIN
  SELECT * INTO artifact FROM finance_artifacts WHERE id = new.artifact_id;
  SELECT * INTO provider_account FROM finance_provider_accounts
    WHERE series_id = new.series_id AND provider_account_id = new.provider_account_id AND identity_version = new.provider_identity_version;
  IF artifact.artifact_class <> 'provider_webhook' OR artifact.binding_kind <> 'provider'
     OR artifact.series_id <> new.series_id OR artifact.provider_account_id <> new.provider_account_id
     OR artifact.provider_identity_version <> new.provider_identity_version OR artifact.sha256_digest <> new.raw_body_digest
     OR provider_account.provider <> new.provider THEN
    RAISE EXCEPTION 'webhook artifact or transport scope mismatch' USING errcode = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM finance_webhook_stored_receipts receipt
    WHERE receipt.inbox_item_id = new.id AND receipt.inbox_version = 1
      AND receipt.series_id = new.series_id AND receipt.provider_account_id = new.provider_account_id
      AND receipt.provider_identity_version = new.provider_identity_version AND receipt.provider = new.provider
      AND receipt.transport_event_id = new.transport_event_id AND receipt.provider_event_type = new.provider_event_type
      AND receipt.artifact_id = new.artifact_id AND receipt.raw_body_digest = new.raw_body_digest
      AND receipt.signature_status = new.signature_status AND receipt.signature_scheme = new.signature_scheme
      AND receipt.verifier_contract_version = new.verifier_contract_version
      AND receipt.webhook_signing_key_version_id = new.webhook_signing_key_version_id
      AND receipt.signed_timestamp = new.signed_timestamp AND receipt.signature_evidence_digest = new.signature_evidence_digest
      AND receipt.verified_at = new.verified_at AND receipt.received_at = new.received_at) THEN
    RAISE EXCEPTION 'webhook ingress requires its DB-issued stored-before-ack receipt' USING errcode = '23514';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_validate_webhook_stored_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE inbox finance_webhook_inbox%rowtype;
BEGIN
  SELECT * INTO STRICT inbox FROM finance_webhook_inbox WHERE id = new.inbox_item_id;
  IF inbox.version <> 1 OR inbox.processing_status <> 'stored' OR inbox.provider <> new.provider
     OR inbox.transport_event_id <> new.transport_event_id OR inbox.provider_event_type <> new.provider_event_type
     OR inbox.signature_status <> new.signature_status OR inbox.signature_scheme <> new.signature_scheme
     OR inbox.verifier_contract_version <> new.verifier_contract_version
     OR inbox.webhook_signing_key_version_id <> new.webhook_signing_key_version_id
     OR inbox.signed_timestamp <> new.signed_timestamp OR inbox.verified_at <> new.verified_at
     OR inbox.received_at <> new.received_at THEN
    RAISE EXCEPTION 'webhook stored receipt is cross-wired' USING errcode = '23514';
  END IF;
  RETURN NULL;
END;
$$;
