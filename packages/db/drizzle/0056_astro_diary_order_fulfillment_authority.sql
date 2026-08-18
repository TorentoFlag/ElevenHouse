CREATE TABLE "client_subscription_purchase_fulfillment_authorities" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"purchase_authority_digest" varchar(71) NOT NULL,
	"registry_key" varchar(200) NOT NULL,
	"registry_revision" numeric(38, 0) NOT NULL,
	"fulfillment_decision_digest" varchar(71) NOT NULL,
	"canonical_preimage" text DEFAULT '' NOT NULL,
	"canonical_digest" varchar(71) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_sub_purchase_fulfillment_exact_owner_unique" UNIQUE("order_id","purchase_authority_digest","registry_key","registry_revision","fulfillment_decision_digest","canonical_digest"),
	CONSTRAINT "client_sub_purchase_fulfillment_shape_check" CHECK ("client_subscription_purchase_fulfillment_authorities"."registry_key" = 'sub.sub.async.solo'
        and "client_subscription_purchase_fulfillment_authorities"."registry_revision" >= 1),
	CONSTRAINT "client_sub_purchase_fulfillment_digest_check" CHECK ("client_subscription_purchase_fulfillment_authorities"."purchase_authority_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "client_subscription_purchase_fulfillment_authorities"."fulfillment_decision_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "client_subscription_purchase_fulfillment_authorities"."canonical_digest" ~ '^sha256:[a-f0-9]{64}$'
        and length("client_subscription_purchase_fulfillment_authorities"."canonical_preimage") > 0)
);
--> statement-breakpoint
ALTER TABLE "client_subscription_purchase_fulfillment_authorities" ADD CONSTRAINT "client_sub_purchase_fulfillment_purchase_fk" FOREIGN KEY ("order_id","purchase_authority_digest") REFERENCES "public"."client_subscription_purchase_authorities"("order_id","canonical_digest") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_purchase_fulfillment_authorities" ADD CONSTRAINT "client_sub_purchase_fulfillment_decision_fk" FOREIGN KEY ("registry_key","registry_revision","fulfillment_decision_digest") REFERENCES "public"."finance_paid_product_fulfillment_decisions"("registry_key","registry_revision","canonical_digest") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION client_subscription_issue_purchase_fulfillment_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_subscription_purchase_fulfillment_authority$
BEGIN
  NEW.created_at := clock_timestamp();
  NEW.canonical_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'kind', 'client_subscription_purchase_fulfillment_authority',
    'schemaVersion', 1,
    'orderId', NEW.order_id::text,
    'purchaseAuthorityDigest', NEW.purchase_authority_digest,
    'fulfillmentDecision', jsonb_build_object(
      'registryKey', NEW.registry_key,
      'registryRevision', NEW.registry_revision,
      'canonicalDigest', NEW.fulfillment_decision_digest
    ),
    'createdAt', to_char(NEW.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ));
  NEW.canonical_digest := 'sha256:' || encode(digest(NEW.canonical_preimage, 'sha256'), 'hex');
  RETURN NEW;
END;
$client_subscription_purchase_fulfillment_authority$;
--> statement-breakpoint
CREATE TRIGGER "client_sub_purchase_fulfillment_issue"
BEFORE INSERT ON client_subscription_purchase_fulfillment_authorities
FOR EACH ROW
EXECUTE FUNCTION client_subscription_issue_purchase_fulfillment_authority();
--> statement-breakpoint
CREATE TRIGGER "client_sub_purchase_fulfillment_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_purchase_fulfillment_authorities
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_sub_purchase_fulfillment_no_truncate"
BEFORE TRUNCATE ON client_subscription_purchase_fulfillment_authorities
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_issue_client_checkout_authorization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $finance_client_checkout_authorization$
DECLARE
  order_row orders%rowtype;
  intent finance_economic_payment_intents%rowtype;
  session finance_economic_payment_sessions%rowtype;
  finance_policy finance_policies%rowtype;
  risk_policy finance_risk_policy_versions%rowtype;
  fulfillment finance_paid_product_fulfillment_decisions%rowtype;
  product_row products%rowtype;
  subscription_fulfillment client_subscription_purchase_fulfillment_authorities%rowtype;
  fulfillment_matches_order boolean;
BEGIN
  SELECT * INTO STRICT order_row FROM orders WHERE id = NEW.order_id FOR UPDATE;
  SELECT * INTO STRICT intent FROM finance_economic_payment_intents
    WHERE id = NEW.economic_payment_intent_id;
  SELECT * INTO STRICT session FROM finance_economic_payment_sessions
    WHERE id = NEW.economic_payment_session_id;
  SELECT * INTO STRICT finance_policy FROM finance_policies
    WHERE id = order_row.finance_policy_snapshot_id;
  SELECT * INTO STRICT risk_policy FROM finance_risk_policy_versions
    WHERE policy_id = NEW.risk_policy_id
      AND policy_version = NEW.risk_policy_version
      AND canonical_digest = NEW.risk_policy_digest;
  SELECT * INTO STRICT fulfillment FROM finance_paid_product_fulfillment_decisions
    WHERE registry_key = NEW.fulfillment_decision_id
      AND registry_revision = NEW.fulfillment_decision_version
      AND canonical_digest = NEW.fulfillment_decision_digest;
  IF fulfillment.registry_key = 'sub.sub.async.solo' THEN
    SELECT binding.* INTO STRICT subscription_fulfillment
      FROM client_subscription_purchase_fulfillment_authorities binding
      JOIN client_subscription_purchase_authorities purchase
        ON purchase.order_id = binding.order_id
       AND purchase.canonical_digest = binding.purchase_authority_digest
     WHERE binding.order_id = NEW.order_id
       AND binding.registry_key = fulfillment.registry_key
       AND binding.registry_revision = fulfillment.registry_revision
       AND binding.fulfillment_decision_digest = fulfillment.canonical_digest;
    fulfillment_matches_order := true;
  ELSE
    SELECT * INTO STRICT product_row FROM products WHERE id = order_row.product_id;
    fulfillment_matches_order := fulfillment.registry_key = concat_ws(
      '.',
      product_row.type,
      product_row.payment_model,
      product_row.execution_mode,
      product_row.participant_mode
    );
  END IF;
  IF order_row.client_user_id <> NEW.client_user_id
     OR order_row.status <> 'pending_payment'
     OR intent.purpose <> 'client_order'
     OR intent.source_id <> NEW.order_id::text
     OR session.economic_payment_intent_id <> intent.id
     OR session.state <> 'checkout_opened'
     OR intent.state <> 'checkout_opened'
     OR session.intent_version_opened <> intent.version
     OR risk_policy.policy_id <> order_row.finance_policy_snapshot_id::text
     OR risk_policy.policy_version <> finance_policy.policy_version
     OR risk_policy.effective_risk_tier <> order_row.finance_policy_risk_tier
     OR risk_policy.hold_duration_hours <> order_row.finance_policy_hold_duration_hours
     OR risk_policy.reserve_bps <> order_row.finance_policy_reserve_bps
     OR risk_policy.reserve_release_delay_days <> order_row.finance_policy_reserve_release_delay_days
     OR risk_policy.provider_settlement_required <> order_row.finance_policy_provider_settlement_required
     OR risk_policy.effective_at::timestamptz > clock_timestamp()
     OR NOT fulfillment_matches_order THEN
    RAISE EXCEPTION 'client checkout authorization does not match locked order and payment session'
      USING ERRCODE = '23514';
  END IF;
  NEW.order_snapshot_version := 1;
  NEW.committed_at := clock_timestamp();
  NEW.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  NEW.canonical_preimage := jsonb_build_object(
    'kind', 'client_order_checkout_authorization',
    'schemaVersion', 1,
    'authorityId', NEW.authority_id,
    'orderId', NEW.order_id::text,
    'clientUserId', NEW.client_user_id::text,
    'paymentCommandId', NEW.payment_command_id::text,
    'orderSnapshotVersion', NEW.order_snapshot_version::text,
    'economicPaymentIntentId', NEW.economic_payment_intent_id,
    'economicPaymentSessionId', NEW.economic_payment_session_id,
    'providerOperationIntentId', NEW.provider_operation_intent_id,
    'riskPolicyId', NEW.risk_policy_id,
    'riskPolicyVersion', NEW.risk_policy_version,
    'riskPolicyDigest', NEW.risk_policy_digest,
    'fulfillmentDecisionId', NEW.fulfillment_decision_id,
    'fulfillmentDecisionVersion', NEW.fulfillment_decision_version,
    'fulfillmentDecisionDigest', NEW.fulfillment_decision_digest,
    'persistenceTransactionBoundaryRef', NEW.persistence_transaction_boundary_ref,
    'committedAt', to_char(NEW.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  NEW.canonical_digest := 'sha256:' || encode(digest(NEW.canonical_preimage, 'sha256'), 'hex');
  RETURN NEW;
END;
$finance_client_checkout_authorization$;
