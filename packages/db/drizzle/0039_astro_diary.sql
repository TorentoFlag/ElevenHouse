CREATE TABLE "client_subscription_contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"purchase_authority_digest" varchar(71) NOT NULL,
	"product_id" uuid NOT NULL,
	"product_revision" integer NOT NULL,
	"relationship_id" uuid NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"cadence" text NOT NULL,
	"billing_order_id" varchar(200) NOT NULL,
	"billing_economics_digest" varchar(71) NOT NULL,
	"billing_astrologer_user_id" uuid NOT NULL,
	"billing_plan_id" varchar(200) NOT NULL,
	"billing_plan_version_id" varchar(200) NOT NULL,
	"billing_gross_amount_minor" bigint NOT NULL,
	"billing_gross_currency" text NOT NULL,
	"billing_commission_amount_minor" bigint NOT NULL,
	"billing_commission_currency" text NOT NULL,
	"billing_payable_amount_minor" bigint NOT NULL,
	"billing_payable_currency" text NOT NULL,
	"billing_commission_bps" integer NOT NULL,
	"billing_allocation_revision" text NOT NULL,
	"access_grants" jsonb NOT NULL,
	"delivery_formats" jsonb NOT NULL,
	"required_client_data" jsonb NOT NULL,
	"methods" jsonb NOT NULL,
	"modifiers" jsonb NOT NULL,
	"astro_diary_config" jsonb NOT NULL,
	"canonical_preimage" text NOT NULL,
	"canonical_digest" varchar(71) NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "client_subscription_contracts_order_unique" UNIQUE("order_id"),
	CONSTRAINT "client_subscription_contracts_exact_identity_unique" UNIQUE("id","relationship_id","product_id","client_user_id","astrologer_user_id"),
	CONSTRAINT "client_subscription_contracts_subscription_scope_unique" UNIQUE("id","relationship_id","product_id"),
	CONSTRAINT "client_subscription_contracts_positive_rub_check" CHECK ("client_subscription_contracts"."price_minor" > 0 and "client_subscription_contracts"."currency" = 'RUB'),
	CONSTRAINT "client_subscription_contracts_cadence_check" CHECK ("client_subscription_contracts"."cadence" in ('week', 'month', 'year')),
	CONSTRAINT "client_subscription_contracts_product_revision_check" CHECK ("client_subscription_contracts"."product_revision" >= 1),
	CONSTRAINT "client_subscription_contracts_billing_identity_check" CHECK ("client_subscription_contracts"."billing_order_id" = "client_subscription_contracts"."order_id"::text
        and "client_subscription_contracts"."billing_astrologer_user_id" = "client_subscription_contracts"."astrologer_user_id"
        and "client_subscription_contracts"."billing_gross_amount_minor" = "client_subscription_contracts"."price_minor"
        and "client_subscription_contracts"."billing_gross_currency" = "client_subscription_contracts"."currency"
        and length("client_subscription_contracts"."billing_plan_id") between 1 and 200
        and "client_subscription_contracts"."billing_plan_id" = trim("client_subscription_contracts"."billing_plan_id")
        and length("client_subscription_contracts"."billing_plan_version_id") between 1 and 200
        and "client_subscription_contracts"."billing_plan_version_id" = trim("client_subscription_contracts"."billing_plan_version_id")
        and "client_subscription_contracts"."billing_economics_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "client_subscription_contracts_billing_allocation_check" CHECK ("client_subscription_contracts"."billing_gross_amount_minor" > 0
        and "client_subscription_contracts"."billing_gross_amount_minor" <= 9007199254740991
        and "client_subscription_contracts"."billing_commission_amount_minor" >= 0
        and "client_subscription_contracts"."billing_commission_amount_minor" <= 9007199254740991
        and "client_subscription_contracts"."billing_payable_amount_minor" >= 0
        and "client_subscription_contracts"."billing_payable_amount_minor" <= 9007199254740991
        and "client_subscription_contracts"."billing_commission_currency" = "client_subscription_contracts"."billing_gross_currency"
        and "client_subscription_contracts"."billing_payable_currency" = "client_subscription_contracts"."billing_gross_currency"
        and "client_subscription_contracts"."billing_commission_bps" between 0 and 10000
        and "client_subscription_contracts"."billing_allocation_revision" = 'bps_half_up_v1'
        and "client_subscription_contracts"."billing_gross_amount_minor" = "client_subscription_contracts"."billing_commission_amount_minor" + "client_subscription_contracts"."billing_payable_amount_minor"
        and "client_subscription_contracts"."billing_commission_amount_minor" = floor(
          ("client_subscription_contracts"."billing_gross_amount_minor" * "client_subscription_contracts"."billing_commission_bps" + 5000) / 10000
        )),
	CONSTRAINT "client_subscription_contracts_exact_diary_shape_check" CHECK ("client_subscription_contracts"."access_grants" = '["journal"]'::jsonb
        and "client_subscription_contracts"."delivery_formats" = '["chat","audio","file"]'::jsonb
        and "client_subscription_contracts"."required_client_data" = '[]'::jsonb
        and "client_subscription_contracts"."methods" = '[]'::jsonb
        and "client_subscription_contracts"."modifiers" = '[]'::jsonb
        and jsonb_typeof("client_subscription_contracts"."astro_diary_config") = 'object'),
	CONSTRAINT "client_subscription_contracts_digest_check" CHECK ("client_subscription_contracts"."canonical_digest" ~ '^sha256:[a-f0-9]{64}$' and length("client_subscription_contracts"."canonical_preimage") > 0),
	CONSTRAINT "client_subscription_contracts_created_at_check" CHECK ("client_subscription_contracts"."created_at" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{0,8}[1-9])?Z$')
);
--> statement-breakpoint
CREATE TABLE "client_subscription_purchase_authorities" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"product_revision" integer NOT NULL,
	"relationship_id" uuid NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"cadence" text NOT NULL,
	"billing_economics_order_id" varchar(200) NOT NULL,
	"billing_economics_digest" varchar(71) NOT NULL,
	"access_grants" jsonb NOT NULL,
	"delivery_formats" jsonb NOT NULL,
	"required_client_data" jsonb NOT NULL,
	"methods" jsonb NOT NULL,
	"modifiers" jsonb NOT NULL,
	"astro_diary_config" jsonb NOT NULL,
	"canonical_preimage" text NOT NULL,
	"canonical_digest" varchar(71) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscription_purchase_authorities_order_digest_unique" UNIQUE("order_id","canonical_digest"),
	CONSTRAINT "client_subscription_purchase_authorities_terms_check" CHECK ("client_subscription_purchase_authorities"."product_revision" >= 1
        and "client_subscription_purchase_authorities"."price_minor" > 0
        and "client_subscription_purchase_authorities"."currency" = 'RUB'
        and "client_subscription_purchase_authorities"."cadence" in ('week', 'month', 'year')
        and "client_subscription_purchase_authorities"."access_grants" = '["journal"]'::jsonb
        and "client_subscription_purchase_authorities"."delivery_formats" = '["chat","audio","file"]'::jsonb
        and "client_subscription_purchase_authorities"."required_client_data" = '[]'::jsonb
        and "client_subscription_purchase_authorities"."methods" = '[]'::jsonb
        and "client_subscription_purchase_authorities"."modifiers" = '[]'::jsonb
        and jsonb_typeof("client_subscription_purchase_authorities"."astro_diary_config") = 'object'),
	CONSTRAINT "client_subscription_purchase_authorities_digest_check" CHECK ("client_subscription_purchase_authorities"."billing_economics_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "client_subscription_purchase_authorities"."billing_economics_order_id" = "client_subscription_purchase_authorities"."order_id"::text
        and "client_subscription_purchase_authorities"."canonical_digest" ~ '^sha256:[a-f0-9]{64}$'
        and length("client_subscription_purchase_authorities"."canonical_preimage") > 0)
);
--> statement-breakpoint
CREATE TABLE "client_subscription_slots" (
	"relationship_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"current_subscription_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscription_slots_relationship_product_pk" PRIMARY KEY("relationship_id","product_id"),
	CONSTRAINT "client_subscription_slots_exact_identity_unique" UNIQUE("relationship_id","product_id","client_user_id","astrologer_user_id"),
	CONSTRAINT "client_subscription_slots_version_check" CHECK ("client_subscription_slots"."version" >= 0),
	CONSTRAINT "client_subscription_slots_current_version_check" CHECK ("client_subscription_slots"."current_subscription_id" is null or "client_subscription_slots"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "client_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"journal_epoch_id" uuid NOT NULL,
	"state" text NOT NULL,
	"version" integer NOT NULL,
	"cancellation_effective_at" timestamp with time zone,
	"renewal_stopped_at" timestamp with time zone,
	"renewal_request_id" uuid,
	"current_period_id" uuid,
	"future_period_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscriptions_contract_unique" UNIQUE("contract_id"),
	CONSTRAINT "client_subscriptions_epoch_unique" UNIQUE("journal_epoch_id"),
	CONSTRAINT "client_subscriptions_exact_identity_unique" UNIQUE("id","contract_id","relationship_id","product_id","journal_epoch_id"),
	CONSTRAINT "client_subscriptions_id_contract_unique" UNIQUE("id","contract_id"),
	CONSTRAINT "client_subscriptions_projection_scope_unique" UNIQUE("id","contract_id","relationship_id","journal_epoch_id"),
	CONSTRAINT "client_subscriptions_state_check" CHECK ("client_subscriptions"."state" in ('pending_initial_payment', 'active', 'cancel_at_period_end', 'ended', 'revoked')),
	CONSTRAINT "client_subscriptions_version_check" CHECK ("client_subscriptions"."version" >= 1),
	CONSTRAINT "client_subscriptions_state_pointer_shape_check" CHECK ((
        "client_subscriptions"."state" = 'pending_initial_payment'
        and "client_subscriptions"."current_period_id" is null
        and "client_subscriptions"."future_period_id" is null
        and "client_subscriptions"."cancellation_effective_at" is null
        and "client_subscriptions"."renewal_stopped_at" is null
        and "client_subscriptions"."renewal_request_id" is null
      ) or (
        "client_subscriptions"."state" = 'active'
        and "client_subscriptions"."current_period_id" is not null
        and "client_subscriptions"."cancellation_effective_at" is null
        and "client_subscriptions"."renewal_stopped_at" is null
      ) or (
        "client_subscriptions"."state" = 'cancel_at_period_end'
        and "client_subscriptions"."current_period_id" is not null
        and "client_subscriptions"."cancellation_effective_at" is not null
        and "client_subscriptions"."renewal_stopped_at" is not null
      ) or (
        "client_subscriptions"."state" = 'ended'
        and "client_subscriptions"."current_period_id" is null
        and "client_subscriptions"."future_period_id" is null
        and "client_subscriptions"."cancellation_effective_at" is null
      ) or (
        "client_subscriptions"."state" = 'revoked'
        and "client_subscriptions"."current_period_id" is null
        and "client_subscriptions"."future_period_id" is null
        and "client_subscriptions"."cancellation_effective_at" is null
        and "client_subscriptions"."renewal_stopped_at" is null
        and "client_subscriptions"."renewal_request_id" is null
      )),
	CONSTRAINT "client_subscriptions_distinct_period_pointers_check" CHECK ("client_subscriptions"."future_period_id" is null or "client_subscriptions"."future_period_id" <> "client_subscriptions"."current_period_id")
);
--> statement-breakpoint
CREATE TABLE "client_subscription_periods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"anchor_captured_at" timestamp with time zone NOT NULL,
	"anchor_service_timezone" text NOT NULL,
	"anchor_origin_sequence" integer NOT NULL,
	"anchor_local_date_time" text NOT NULL,
	"resolved_start_local" text NOT NULL,
	"resolved_start_offset" text NOT NULL,
	"resolved_end_local" text NOT NULL,
	"resolved_end_offset" text NOT NULL,
	"capture_evidence_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscription_periods_subscription_sequence_unique" UNIQUE("subscription_id","sequence"),
	CONSTRAINT "client_subscription_periods_exact_identity_unique" UNIQUE("id","subscription_id","contract_id","sequence"),
	CONSTRAINT "client_subscription_periods_id_subscription_unique" UNIQUE("id","subscription_id"),
	CONSTRAINT "client_subscription_periods_allowance_scope_unique" UNIQUE("id","subscription_id","ends_at"),
	CONSTRAINT "client_subscription_periods_id_subscription_bounds_unique" UNIQUE("id","subscription_id","starts_at","ends_at"),
	CONSTRAINT "client_subscription_periods_entitlement_scope_unique" UNIQUE("id","subscription_id","contract_id","starts_at","ends_at"),
	CONSTRAINT "client_subscription_periods_capture_evidence_unique" UNIQUE("subscription_id","capture_evidence_id"),
	CONSTRAINT "client_subscription_periods_sequence_check" CHECK ("client_subscription_periods"."sequence" >= 1),
	CONSTRAINT "client_subscription_periods_half_open_range_check" CHECK ("client_subscription_periods"."starts_at" < "client_subscription_periods"."ends_at"),
	CONSTRAINT "client_subscription_periods_anchor_check" CHECK ("client_subscription_periods"."anchor_origin_sequence" >= 1
        and ((
          "client_subscription_periods"."anchor_origin_sequence" = "client_subscription_periods"."sequence"
          and "client_subscription_periods"."anchor_captured_at" = "client_subscription_periods"."starts_at"
        ) or (
          "client_subscription_periods"."anchor_origin_sequence" < "client_subscription_periods"."sequence"
          and "client_subscription_periods"."anchor_captured_at" < "client_subscription_periods"."starts_at"
        ))
        and length(trim("client_subscription_periods"."anchor_service_timezone")) between 1 and 100
        and length(trim("client_subscription_periods"."anchor_local_date_time")) > 0
        and length(trim("client_subscription_periods"."resolved_start_local")) > 0
        and length(trim("client_subscription_periods"."resolved_end_local")) > 0
        and "client_subscription_periods"."resolved_start_offset" ~ '^[+-][0-9]{2}:[0-9]{2}$'
        and "client_subscription_periods"."resolved_end_offset" ~ '^[+-][0-9]{2}:[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "client_subscription_renewal_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"source_period_id" uuid NOT NULL,
	"intended_period_id" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscription_renewal_requests_exact_identity_unique" UNIQUE("id","subscription_id","intended_period_id"),
	CONSTRAINT "client_subscription_renewal_requests_subscription_intended_unique" UNIQUE("subscription_id","intended_period_id")
);
--> statement-breakpoint
CREATE TABLE "client_subscription_lifecycle_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transition_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"subscription_version" integer NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "client_subscription_lifecycle_events_transition_type_unique" UNIQUE("transition_id","event_type"),
	CONSTRAINT "client_subscription_lifecycle_events_type_check" CHECK ("client_subscription_lifecycle_events"."event_type" in (
        'client_subscription.initial_payment_ended.v1',
        'client_subscription.renewal_charge_requested.v1',
        'client_subscription.activated.v1',
        'client_subscription.period_renewed.v1',
        'client_subscription.cancellation_scheduled.v1',
        'client_subscription.cancellation_revoked.v1',
        'client_subscription.renewal_failed.v1',
        'client_subscription.period_ended.v1',
        'client_subscription.revoked.v1',
        'client_subscription.entitlement_changed.v1'
      )),
	CONSTRAINT "client_subscription_lifecycle_events_schema_version_check" CHECK ("client_subscription_lifecycle_events"."schema_version" = 1),
	CONSTRAINT "client_subscription_lifecycle_events_envelope_check" CHECK (jsonb_typeof("client_subscription_lifecycle_events"."data") = 'object'
        and "client_subscription_lifecycle_events"."data"->>'subscriptionId' = "client_subscription_lifecycle_events"."subscription_id"::text
        and "client_subscription_lifecycle_events"."data"->>'contractId' = "client_subscription_lifecycle_events"."contract_id"::text),
	CONSTRAINT "client_subscription_lifecycle_events_data_shape_check" CHECK ((
        "client_subscription_lifecycle_events"."event_type" = 'client_subscription.initial_payment_ended.v1'
        and "client_subscription_lifecycle_events"."data"->>'reason' in ('checkout_expired', 'payment_failed')
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'financeEvidenceId') = 'string'
        and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','financeEvidenceId','reason']::text[] = '{}'::jsonb
      ) or (
        "client_subscription_lifecycle_events"."event_type" = 'client_subscription.renewal_charge_requested.v1'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'sourcePeriodId') = 'string'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'intendedPeriodId') = 'string'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'renewalRequestId') = 'string'
        and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','sourcePeriodId','intendedPeriodId','renewalRequestId']::text[] = '{}'::jsonb
      ) or (
        "client_subscription_lifecycle_events"."event_type" in (
          'client_subscription.activated.v1',
          'client_subscription.period_renewed.v1',
          'client_subscription.cancellation_scheduled.v1',
          'client_subscription.cancellation_revoked.v1',
          'client_subscription.period_ended.v1'
        )
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'periodId') = 'string'
        and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','periodId']::text[] = '{}'::jsonb
      ) or (
        "client_subscription_lifecycle_events"."event_type" = 'client_subscription.renewal_failed.v1'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'renewalRequestId') = 'string'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'intendedPeriodId') = 'string'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'renewalAttemptId') = 'string'
        and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','renewalRequestId','intendedPeriodId','renewalAttemptId']::text[] = '{}'::jsonb
      ) or (
        "client_subscription_lifecycle_events"."event_type" = 'client_subscription.revoked.v1'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'periodId') = 'string'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'financeEvidenceId') = 'string'
        and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','periodId','financeEvidenceId']::text[] = '{}'::jsonb
      ) or (
        "client_subscription_lifecycle_events"."event_type" = 'client_subscription.entitlement_changed.v1'
        and "client_subscription_lifecycle_events"."data"->>'scope' in ('period', 'subscription_all')
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'relationshipId') = 'string'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'journalEpochId') = 'string'
        and (
          ("client_subscription_lifecycle_events"."data"->>'scope' = 'period'
            and jsonb_typeof("client_subscription_lifecycle_events"."data"->'periodId') = 'string'
            and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','scope','relationshipId','journalEpochId','periodId']::text[] = '{}'::jsonb)
          or ("client_subscription_lifecycle_events"."data"->>'scope' = 'subscription_all'
            and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','scope','relationshipId','journalEpochId']::text[] = '{}'::jsonb)
        )
      ))
);
--> statement-breakpoint
CREATE TABLE "client_subscription_transition_receipts" (
	"transition_id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"journal_epoch_id" uuid NOT NULL,
	"subscription_version" integer NOT NULL,
	"state" text NOT NULL,
	"entitlement_state" text NOT NULL,
	"entitlement_scope" text NOT NULL,
	"primary_event_type" text NOT NULL,
	"slot_effect" text NOT NULL,
	"period_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscription_transition_receipts_subscription_version_unique" UNIQUE("subscription_id","subscription_version"),
	CONSTRAINT "client_subscription_transition_receipts_exact_identity_unique" UNIQUE("transition_id","subscription_id","contract_id","subscription_version"),
	CONSTRAINT "client_subscription_transition_receipts_subscription_identity_unique" UNIQUE("transition_id","subscription_id"),
	CONSTRAINT "client_subscription_transition_receipts_projection_source_unique" UNIQUE("transition_id","subscription_id","subscription_version"),
	CONSTRAINT "client_subscription_transition_receipts_version_check" CHECK ("client_subscription_transition_receipts"."subscription_version" >= 2),
	CONSTRAINT "client_subscription_transition_receipts_state_check" CHECK ("client_subscription_transition_receipts"."state" in ('active', 'cancel_at_period_end', 'ended', 'revoked')),
	CONSTRAINT "client_subscription_transition_receipts_entitlement_check" CHECK ("client_subscription_transition_receipts"."entitlement_state" in ('active', 'ended', 'revoked')
        and "client_subscription_transition_receipts"."entitlement_scope" in ('none', 'period', 'subscription_all')
        and (
          ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.initial_payment_ended.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'none'
            and "client_subscription_transition_receipts"."period_id" is null
            and "client_subscription_transition_receipts"."entitlement_state" = 'ended'
            and "client_subscription_transition_receipts"."state" = 'ended'
            and "client_subscription_transition_receipts"."slot_effect" = 'release')
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.renewal_charge_requested.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'none'
            and "client_subscription_transition_receipts"."period_id" is not null
            and "client_subscription_transition_receipts"."entitlement_state" = 'active'
            and "client_subscription_transition_receipts"."state" = 'active'
            and "client_subscription_transition_receipts"."slot_effect" = 'retain')
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.cancellation_scheduled.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'none'
            and "client_subscription_transition_receipts"."period_id" is not null
            and "client_subscription_transition_receipts"."entitlement_state" = 'active'
            and "client_subscription_transition_receipts"."state" = 'cancel_at_period_end'
            and "client_subscription_transition_receipts"."slot_effect" = 'retain')
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.cancellation_revoked.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'none'
            and "client_subscription_transition_receipts"."period_id" is not null
            and "client_subscription_transition_receipts"."entitlement_state" = 'active'
            and "client_subscription_transition_receipts"."state" = 'active'
            and "client_subscription_transition_receipts"."slot_effect" = 'retain')
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.renewal_failed.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'none'
            and "client_subscription_transition_receipts"."period_id" is not null
            and "client_subscription_transition_receipts"."entitlement_state" = 'active'
            and "client_subscription_transition_receipts"."state" in ('active', 'cancel_at_period_end')
            and "client_subscription_transition_receipts"."slot_effect" = 'retain')
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.activated.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'period'
            and "client_subscription_transition_receipts"."period_id" is not null
            and "client_subscription_transition_receipts"."entitlement_state" = 'active'
            and "client_subscription_transition_receipts"."state" = 'active')
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.period_renewed.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'period'
            and "client_subscription_transition_receipts"."period_id" is not null
            and "client_subscription_transition_receipts"."entitlement_state" = 'active'
            and "client_subscription_transition_receipts"."state" in ('active', 'cancel_at_period_end'))
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.period_ended.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'period'
            and "client_subscription_transition_receipts"."period_id" is not null
            and "client_subscription_transition_receipts"."entitlement_state" = 'ended'
            and "client_subscription_transition_receipts"."state" in ('active', 'cancel_at_period_end', 'ended'))
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.revoked.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'subscription_all'
            and "client_subscription_transition_receipts"."period_id" is null
            and "client_subscription_transition_receipts"."entitlement_state" = 'revoked')
        )),
	CONSTRAINT "client_subscription_transition_receipts_primary_event_check" CHECK ("client_subscription_transition_receipts"."primary_event_type" in (
        'client_subscription.initial_payment_ended.v1',
        'client_subscription.renewal_charge_requested.v1',
        'client_subscription.activated.v1',
        'client_subscription.period_renewed.v1',
        'client_subscription.cancellation_scheduled.v1',
        'client_subscription.cancellation_revoked.v1',
        'client_subscription.renewal_failed.v1',
        'client_subscription.period_ended.v1',
        'client_subscription.revoked.v1'
      )),
	CONSTRAINT "client_subscription_transition_receipts_slot_effect_check" CHECK ("client_subscription_transition_receipts"."slot_effect" in ('retain', 'release')
        and ("client_subscription_transition_receipts"."slot_effect" = 'retain' or "client_subscription_transition_receipts"."state" in ('ended', 'revoked')))
);
--> statement-breakpoint
CREATE TABLE "client_subscription_command_receipts" (
	"subscription_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_hash" varchar(71) NOT NULL,
	"result_kind" text NOT NULL,
	"result" jsonb NOT NULL,
	"result_snapshot" jsonb,
	"result_version" integer NOT NULL,
	"transition_id" uuid,
	"slot_effect" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscription_command_receipts_scope_key_unique" UNIQUE("subscription_id","idempotency_key"),
	CONSTRAINT "client_subscription_command_receipts_request_hash_check" CHECK ("client_subscription_command_receipts"."request_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "client_subscription_command_receipts_result_check" CHECK ("client_subscription_command_receipts"."result_kind" in ('applied', 'idempotent', 'rejected')
        and jsonb_typeof("client_subscription_command_receipts"."result") = 'object'
        and "client_subscription_command_receipts"."expected_version" >= 1
        and (
          ("client_subscription_command_receipts"."result_kind" = 'applied' and "client_subscription_command_receipts"."result_version" = "client_subscription_command_receipts"."expected_version" + 1)
          or ("client_subscription_command_receipts"."result_kind" in ('idempotent', 'rejected') and "client_subscription_command_receipts"."result_version" = "client_subscription_command_receipts"."expected_version")
        )
        and (
          ("client_subscription_command_receipts"."result_kind" = 'applied'
            and "client_subscription_command_receipts"."transition_id" is not null
            and "client_subscription_command_receipts"."slot_effect" in ('retain', 'release')
            and jsonb_typeof("client_subscription_command_receipts"."result_snapshot") = 'object'
            and "client_subscription_command_receipts"."result_snapshot"->>'outcome' = 'applied'
            and "client_subscription_command_receipts"."result_snapshot"->'subscription'->>'id' = "client_subscription_command_receipts"."subscription_id"::text
            and ("client_subscription_command_receipts"."result_snapshot"->'subscription'->>'version')::integer = "client_subscription_command_receipts"."result_version"
            and "client_subscription_command_receipts"."result_snapshot"->'receipt'->>'transitionId' = "client_subscription_command_receipts"."transition_id"::text
            and jsonb_typeof("client_subscription_command_receipts"."result_snapshot"->'events') = 'array'
            and "client_subscription_command_receipts"."result" = jsonb_build_object(
              'outcome', 'applied',
              'slotEffect', "client_subscription_command_receipts"."slot_effect",
              'subscriptionVersion', "client_subscription_command_receipts"."result_version",
              'transitionId', "client_subscription_command_receipts"."transition_id"::text
            ))
          or ("client_subscription_command_receipts"."result_kind" = 'idempotent'
            and "client_subscription_command_receipts"."transition_id" is null
            and "client_subscription_command_receipts"."slot_effect" is null
            and jsonb_typeof("client_subscription_command_receipts"."result_snapshot") = 'object'
            and "client_subscription_command_receipts"."result_snapshot"->>'outcome' = 'idempotent'
            and "client_subscription_command_receipts"."result_snapshot"->'subscription'->>'id' = "client_subscription_command_receipts"."subscription_id"::text
            and ("client_subscription_command_receipts"."result_snapshot"->'subscription'->>'version')::integer = "client_subscription_command_receipts"."result_version"
            and "client_subscription_command_receipts"."result_snapshot"->'events' = '[]'::jsonb
            and "client_subscription_command_receipts"."result" = jsonb_build_object(
              'outcome', 'idempotent',
              'subscriptionVersion', "client_subscription_command_receipts"."result_version"
            ))
          or ("client_subscription_command_receipts"."result_kind" = 'rejected'
            and "client_subscription_command_receipts"."transition_id" is null
            and "client_subscription_command_receipts"."slot_effect" is null
            and "client_subscription_command_receipts"."result_snapshot" is null
            and jsonb_typeof("client_subscription_command_receipts"."result"->'code') = 'string'
            and "client_subscription_command_receipts"."result" - ARRAY['outcome', 'code']::text[] = '{}'::jsonb
            and "client_subscription_command_receipts"."result"->>'outcome' = 'rejected')
        ))
);
--> statement-breakpoint
CREATE TABLE "client_subscription_creation_receipts" (
	"order_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_hash" varchar(71) NOT NULL,
	"expected_slot_version" integer NOT NULL,
	"slot_effect" text NOT NULL,
	"result_kind" text NOT NULL,
	"result" jsonb NOT NULL,
	"result_snapshot" jsonb,
	"result_slot_version" integer NOT NULL,
	"subscription_id" uuid,
	"contract_id" uuid,
	"contract_digest" varchar(71),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscription_creation_receipts_order_key_unique" UNIQUE("order_id","idempotency_key"),
	CONSTRAINT "client_subscription_creation_receipts_request_hash_check" CHECK ("client_subscription_creation_receipts"."request_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "client_subscription_creation_receipts_version_check" CHECK ("client_subscription_creation_receipts"."expected_slot_version" >= 0 and "client_subscription_creation_receipts"."result_slot_version" >= "client_subscription_creation_receipts"."expected_slot_version"),
	CONSTRAINT "client_subscription_creation_receipts_result_check" CHECK ("client_subscription_creation_receipts"."result_kind" in ('created', 'rejected')
        and jsonb_typeof("client_subscription_creation_receipts"."result") = 'object'
        and (
          ("client_subscription_creation_receipts"."result_kind" = 'created'
            and "client_subscription_creation_receipts"."slot_effect" = 'assign'
            and "client_subscription_creation_receipts"."subscription_id" is not null
            and "client_subscription_creation_receipts"."contract_id" is not null
            and "client_subscription_creation_receipts"."contract_digest" ~ '^sha256:[a-f0-9]{64}$'
            and jsonb_typeof("client_subscription_creation_receipts"."result_snapshot") = 'object'
            and "client_subscription_creation_receipts"."result_snapshot"->>'outcome' = 'created'
            and "client_subscription_creation_receipts"."result_snapshot"->'contract'->>'id' = "client_subscription_creation_receipts"."contract_id"::text
            and "client_subscription_creation_receipts"."result_snapshot"->'contract'->>'orderId' = "client_subscription_creation_receipts"."order_id"::text
            and "client_subscription_creation_receipts"."result_snapshot"->'contract'->>'productId' = "client_subscription_creation_receipts"."product_id"::text
            and "client_subscription_creation_receipts"."result_snapshot"->'contract'->>'relationshipId' = "client_subscription_creation_receipts"."relationship_id"::text
            and "client_subscription_creation_receipts"."result_snapshot"->'contract'->>'canonicalDigest' = "client_subscription_creation_receipts"."contract_digest"
            and "client_subscription_creation_receipts"."result_snapshot"->'subscription'->>'id' = "client_subscription_creation_receipts"."subscription_id"::text
            and ("client_subscription_creation_receipts"."result_snapshot"->'subscription'->>'version')::integer = 1
            and "client_subscription_creation_receipts"."result_snapshot"->'subscription'->>'state' = 'pending_initial_payment'
            and "client_subscription_creation_receipts"."result_snapshot"->'subscription'->'contract' = "client_subscription_creation_receipts"."result_snapshot"->'contract'
            and "client_subscription_creation_receipts"."result" = jsonb_build_object(
              'outcome', 'created',
              'subscriptionId', "client_subscription_creation_receipts"."subscription_id"::text,
              'contractId', "client_subscription_creation_receipts"."contract_id"::text,
              'contractDigest', "client_subscription_creation_receipts"."contract_digest"
            )
            and "client_subscription_creation_receipts"."result_slot_version" = "client_subscription_creation_receipts"."expected_slot_version" + 1)
          or ("client_subscription_creation_receipts"."result_kind" = 'rejected'
            and "client_subscription_creation_receipts"."slot_effect" = 'retain'
            and "client_subscription_creation_receipts"."subscription_id" is null
            and "client_subscription_creation_receipts"."contract_id" is null
            and "client_subscription_creation_receipts"."contract_digest" is null
            and "client_subscription_creation_receipts"."result_snapshot" is null
            and "client_subscription_creation_receipts"."result_slot_version" = "client_subscription_creation_receipts"."expected_slot_version"
            and jsonb_typeof("client_subscription_creation_receipts"."result"->'code') = 'string'
            and "client_subscription_creation_receipts"."result"->>'outcome' = 'rejected'
            and "client_subscription_creation_receipts"."result" - ARRAY['outcome', 'code']::text[] = '{}'::jsonb)
        ))
);
--> statement-breakpoint
CREATE TABLE "client_subscription_event_application_receipts" (
	"source_event_id" uuid PRIMARY KEY NOT NULL,
	"source_event_digest" varchar(71) NOT NULL,
	"evidence_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"result_kind" text NOT NULL,
	"result" jsonb NOT NULL,
	"result_snapshot" jsonb,
	"result_version" integer NOT NULL,
	"transition_id" uuid,
	"slot_effect" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscription_event_applications_source_unique" UNIQUE("source_event_id","source_event_digest"),
	CONSTRAINT "client_subscription_event_applications_evidence_unique" UNIQUE("evidence_id"),
	CONSTRAINT "client_subscription_event_applications_digest_check" CHECK ("client_subscription_event_application_receipts"."source_event_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "client_subscription_event_applications_result_check" CHECK ("client_subscription_event_application_receipts"."result_kind" in ('applied', 'idempotent', 'rejected')
        and jsonb_typeof("client_subscription_event_application_receipts"."result") = 'object'
        and "client_subscription_event_application_receipts"."result_version" >= 1
        and (
          ("client_subscription_event_application_receipts"."result_kind" = 'applied'
            and "client_subscription_event_application_receipts"."transition_id" is not null
            and "client_subscription_event_application_receipts"."slot_effect" in ('retain', 'release')
            and jsonb_typeof("client_subscription_event_application_receipts"."result_snapshot") = 'object'
            and "client_subscription_event_application_receipts"."result_snapshot"->>'outcome' = 'applied'
            and "client_subscription_event_application_receipts"."result_snapshot"->'subscription'->>'id' = "client_subscription_event_application_receipts"."subscription_id"::text
            and ("client_subscription_event_application_receipts"."result_snapshot"->'subscription'->>'version')::integer = "client_subscription_event_application_receipts"."result_version"
            and "client_subscription_event_application_receipts"."result_snapshot"->'receipt'->>'transitionId' = "client_subscription_event_application_receipts"."transition_id"::text
            and jsonb_typeof("client_subscription_event_application_receipts"."result_snapshot"->'events') = 'array'
            and "client_subscription_event_application_receipts"."result" = jsonb_build_object(
              'outcome', 'applied',
              'slotEffect', "client_subscription_event_application_receipts"."slot_effect",
              'subscriptionVersion', "client_subscription_event_application_receipts"."result_version",
              'transitionId', "client_subscription_event_application_receipts"."transition_id"::text
            ))
          or ("client_subscription_event_application_receipts"."result_kind" = 'idempotent'
            and "client_subscription_event_application_receipts"."transition_id" is null
            and "client_subscription_event_application_receipts"."slot_effect" is null
            and jsonb_typeof("client_subscription_event_application_receipts"."result_snapshot") = 'object'
            and "client_subscription_event_application_receipts"."result_snapshot"->>'outcome' = 'idempotent'
            and "client_subscription_event_application_receipts"."result_snapshot"->'subscription'->>'id' = "client_subscription_event_application_receipts"."subscription_id"::text
            and ("client_subscription_event_application_receipts"."result_snapshot"->'subscription'->>'version')::integer = "client_subscription_event_application_receipts"."result_version"
            and "client_subscription_event_application_receipts"."result_snapshot"->'events' = '[]'::jsonb
            and "client_subscription_event_application_receipts"."result" = jsonb_build_object(
              'outcome', 'idempotent',
              'subscriptionVersion', "client_subscription_event_application_receipts"."result_version"
            ))
          or ("client_subscription_event_application_receipts"."result_kind" = 'rejected'
            and "client_subscription_event_application_receipts"."transition_id" is null
            and "client_subscription_event_application_receipts"."slot_effect" is null
            and "client_subscription_event_application_receipts"."result_snapshot" is null
            and jsonb_typeof("client_subscription_event_application_receipts"."result"->'code') = 'string'
            and "client_subscription_event_application_receipts"."result" - ARRAY['outcome', 'code']::text[] = '{}'::jsonb
            and "client_subscription_event_application_receipts"."result"->>'outcome' = 'rejected')
        ))
);
--> statement-breakpoint
CREATE TABLE "client_subscription_allowance_command_effects" (
	"period_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"before_version" integer NOT NULL,
	"before_available" integer NOT NULL,
	"before_reserved" integer NOT NULL,
	"before_consumed" integer NOT NULL,
	"before_released" integer NOT NULL,
	"after_version" integer NOT NULL,
	"after_available" integer NOT NULL,
	"after_reserved" integer NOT NULL,
	"after_consumed" integer NOT NULL,
	"after_released" integer NOT NULL,
	"operation" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reservation_id" uuid,
	"reservation_state_before" text,
	"reservation_state_after" text,
	"consumption_id" uuid,
	CONSTRAINT "client_subscription_allowance_command_effects_receipt_unique" UNIQUE("period_id","idempotency_key"),
	CONSTRAINT "client_subscription_allowance_command_effects_version_unique" UNIQUE("period_id","after_version"),
	CONSTRAINT "client_subscription_allowance_command_effects_version_check" CHECK ("client_subscription_allowance_command_effects"."before_version" >= 1 and "client_subscription_allowance_command_effects"."after_version" = "client_subscription_allowance_command_effects"."before_version" + 1),
	CONSTRAINT "client_subscription_allowance_command_effects_nonnegative_check" CHECK ("client_subscription_allowance_command_effects"."before_available" >= 0
        and "client_subscription_allowance_command_effects"."before_reserved" >= 0
        and "client_subscription_allowance_command_effects"."before_consumed" >= 0
        and "client_subscription_allowance_command_effects"."before_released" >= 0
        and "client_subscription_allowance_command_effects"."after_available" >= 0
        and "client_subscription_allowance_command_effects"."after_reserved" >= 0
        and "client_subscription_allowance_command_effects"."after_consumed" >= 0
        and "client_subscription_allowance_command_effects"."after_released" >= 0),
	CONSTRAINT "client_subscription_allowance_command_effects_total_check" CHECK ("client_subscription_allowance_command_effects"."before_available" + "client_subscription_allowance_command_effects"."before_reserved" + "client_subscription_allowance_command_effects"."before_consumed" + "client_subscription_allowance_command_effects"."before_released"
        = "client_subscription_allowance_command_effects"."after_available" + "client_subscription_allowance_command_effects"."after_reserved" + "client_subscription_allowance_command_effects"."after_consumed" + "client_subscription_allowance_command_effects"."after_released"),
	CONSTRAINT "client_subscription_allowance_command_effects_operation_check" CHECK ((
        "client_subscription_allowance_command_effects"."operation" = 'reserve'
        and "client_subscription_allowance_command_effects"."after_available" = "client_subscription_allowance_command_effects"."before_available" - 1
        and "client_subscription_allowance_command_effects"."after_reserved" = "client_subscription_allowance_command_effects"."before_reserved" + 1
        and "client_subscription_allowance_command_effects"."after_consumed" = "client_subscription_allowance_command_effects"."before_consumed"
        and "client_subscription_allowance_command_effects"."after_released" = "client_subscription_allowance_command_effects"."before_released"
      ) or (
        "client_subscription_allowance_command_effects"."operation" = 'consume_available'
        and "client_subscription_allowance_command_effects"."after_available" = "client_subscription_allowance_command_effects"."before_available" - 1
        and "client_subscription_allowance_command_effects"."after_reserved" = "client_subscription_allowance_command_effects"."before_reserved"
        and "client_subscription_allowance_command_effects"."after_consumed" = "client_subscription_allowance_command_effects"."before_consumed" + 1
        and "client_subscription_allowance_command_effects"."after_released" = "client_subscription_allowance_command_effects"."before_released"
      ) or (
        "client_subscription_allowance_command_effects"."operation" = 'consume_reserved'
        and "client_subscription_allowance_command_effects"."after_available" = "client_subscription_allowance_command_effects"."before_available"
        and "client_subscription_allowance_command_effects"."after_reserved" = "client_subscription_allowance_command_effects"."before_reserved" - 1
        and "client_subscription_allowance_command_effects"."after_consumed" = "client_subscription_allowance_command_effects"."before_consumed" + 1
        and "client_subscription_allowance_command_effects"."after_released" = "client_subscription_allowance_command_effects"."before_released"
      ) or (
        "client_subscription_allowance_command_effects"."operation" = 'release_reserved'
        and "client_subscription_allowance_command_effects"."after_reserved" = "client_subscription_allowance_command_effects"."before_reserved" - 1
        and "client_subscription_allowance_command_effects"."after_consumed" = "client_subscription_allowance_command_effects"."before_consumed"
        and (
          ("client_subscription_allowance_command_effects"."after_available" = "client_subscription_allowance_command_effects"."before_available" + 1
            and "client_subscription_allowance_command_effects"."after_released" = "client_subscription_allowance_command_effects"."before_released")
          or ("client_subscription_allowance_command_effects"."after_available" = "client_subscription_allowance_command_effects"."before_available"
            and "client_subscription_allowance_command_effects"."after_released" = "client_subscription_allowance_command_effects"."before_released" + 1)
        )
      ) or (
        "client_subscription_allowance_command_effects"."operation" = 'forfeit_reserved'
        and "client_subscription_allowance_command_effects"."after_available" = "client_subscription_allowance_command_effects"."before_available"
        and "client_subscription_allowance_command_effects"."after_reserved" = "client_subscription_allowance_command_effects"."before_reserved" - 1
        and "client_subscription_allowance_command_effects"."after_consumed" = "client_subscription_allowance_command_effects"."before_consumed"
        and "client_subscription_allowance_command_effects"."after_released" = "client_subscription_allowance_command_effects"."before_released" + 1
      ) or (
        "client_subscription_allowance_command_effects"."operation" = 'expire_available'
        and "client_subscription_allowance_command_effects"."after_available" = 0
        and "client_subscription_allowance_command_effects"."after_reserved" = "client_subscription_allowance_command_effects"."before_reserved"
        and "client_subscription_allowance_command_effects"."after_consumed" = "client_subscription_allowance_command_effects"."before_consumed"
        and "client_subscription_allowance_command_effects"."after_released" = "client_subscription_allowance_command_effects"."before_released" + "client_subscription_allowance_command_effects"."before_available"
      )),
	CONSTRAINT "client_subscription_allowance_command_effects_fact_transition_check" CHECK ((
        "client_subscription_allowance_command_effects"."operation" = 'reserve'
        and "client_subscription_allowance_command_effects"."reservation_id" is not null
        and "client_subscription_allowance_command_effects"."reservation_state_before" is null
        and "client_subscription_allowance_command_effects"."reservation_state_after" = 'reserved'
        and "client_subscription_allowance_command_effects"."consumption_id" is null
      ) or (
        "client_subscription_allowance_command_effects"."operation" = 'consume_available'
        and "client_subscription_allowance_command_effects"."reservation_id" is null
        and "client_subscription_allowance_command_effects"."reservation_state_before" is null
        and "client_subscription_allowance_command_effects"."reservation_state_after" is null
        and "client_subscription_allowance_command_effects"."consumption_id" is not null
      ) or (
        "client_subscription_allowance_command_effects"."operation" = 'consume_reserved'
        and "client_subscription_allowance_command_effects"."reservation_id" is not null
        and "client_subscription_allowance_command_effects"."reservation_state_before" = 'reserved'
        and "client_subscription_allowance_command_effects"."reservation_state_after" = 'consumed'
        and "client_subscription_allowance_command_effects"."consumption_id" = "client_subscription_allowance_command_effects"."reservation_id"
      ) or (
        "client_subscription_allowance_command_effects"."operation" in ('release_reserved', 'forfeit_reserved')
        and "client_subscription_allowance_command_effects"."reservation_id" is not null
        and "client_subscription_allowance_command_effects"."reservation_state_before" = 'reserved'
        and "client_subscription_allowance_command_effects"."reservation_state_after" = 'released'
        and "client_subscription_allowance_command_effects"."consumption_id" is null
      ) or (
        "client_subscription_allowance_command_effects"."operation" = 'expire_available'
        and "client_subscription_allowance_command_effects"."reservation_id" is null
        and "client_subscription_allowance_command_effects"."reservation_state_before" is null
        and "client_subscription_allowance_command_effects"."reservation_state_after" is null
        and "client_subscription_allowance_command_effects"."consumption_id" is null
      ))
);
--> statement-breakpoint
CREATE TABLE "client_subscription_allowance_command_receipts" (
	"period_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_hash" varchar(71) NOT NULL,
	"command" jsonb NOT NULL,
	"result_kind" text NOT NULL,
	"result" jsonb NOT NULL,
	"result_version" integer NOT NULL,
	CONSTRAINT "client_subscription_allowance_receipts_period_key_unique" UNIQUE("period_id","idempotency_key"),
	CONSTRAINT "client_subscription_allowance_receipts_hash_check" CHECK ("client_subscription_allowance_command_receipts"."request_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "client_subscription_allowance_receipts_command_check" CHECK (jsonb_typeof("client_subscription_allowance_command_receipts"."command") = 'object'
        and "client_subscription_allowance_command_receipts"."command"->>'operation' in (
          'reserve',
          'consume_available',
          'consume_reserved',
          'release_reserved',
          'forfeit_reserved',
          'expire_available'
        )),
	CONSTRAINT "client_subscription_allowance_receipts_result_check" CHECK ("client_subscription_allowance_command_receipts"."result_kind" in ('applied', 'rejected')
        and jsonb_typeof("client_subscription_allowance_command_receipts"."result") = 'object'
        and "client_subscription_allowance_command_receipts"."expected_version" >= 1
        and (
          ("client_subscription_allowance_command_receipts"."result_kind" = 'applied' and "client_subscription_allowance_command_receipts"."result_version" = "client_subscription_allowance_command_receipts"."expected_version" + 1)
          or ("client_subscription_allowance_command_receipts"."result_kind" = 'rejected' and "client_subscription_allowance_command_receipts"."result_version" = "client_subscription_allowance_command_receipts"."expected_version")
        )
        and (
          ("client_subscription_allowance_command_receipts"."result_kind" = 'applied'
            and "client_subscription_allowance_command_receipts"."result" = jsonb_build_object('outcome', 'applied'))
          or ("client_subscription_allowance_command_receipts"."result_kind" = 'rejected'
            and "client_subscription_allowance_command_receipts"."result"->>'outcome' = 'rejected'
            and jsonb_typeof("client_subscription_allowance_command_receipts"."result"->'decision') = 'object'
            and "client_subscription_allowance_command_receipts"."result"->'decision' = jsonb_build_object(
              'outcome', "client_subscription_allowance_command_receipts"."result"->'decision'->>'outcome'
            )
            and "client_subscription_allowance_command_receipts"."result"->'decision'->>'outcome' in (
              'allowance_exhausted',
              'period_ended',
              'paid_access_not_ended',
              'reservation_already_exists',
              'reservation_not_found',
              'reservation_not_active'
            )
            and "client_subscription_allowance_command_receipts"."result" - ARRAY['outcome', 'decision']::text[] = '{}'::jsonb)
        ))
);
--> statement-breakpoint
CREATE TABLE "client_subscription_allowance_consumptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"period_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"source" text NOT NULL,
	"reservation_id" uuid,
	"consumed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscription_allowance_consumptions_period_identity_unique" UNIQUE("period_id","id"),
	CONSTRAINT "client_subscription_allowance_consumptions_reservation_unique" UNIQUE("reservation_id"),
	CONSTRAINT "client_subscription_allowance_consumptions_source_check" CHECK (("client_subscription_allowance_consumptions"."source" = 'available' and "client_subscription_allowance_consumptions"."reservation_id" is null)
        or ("client_subscription_allowance_consumptions"."source" = 'reservation'
          and "client_subscription_allowance_consumptions"."reservation_id" is not null
          and "client_subscription_allowance_consumptions"."id" = "client_subscription_allowance_consumptions"."reservation_id"))
);
--> statement-breakpoint
CREATE TABLE "client_subscription_allowance_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"period_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"state" text NOT NULL,
	"reserved_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	CONSTRAINT "client_subscription_allowance_reservations_period_identity_unique" UNIQUE("period_id","id"),
	CONSTRAINT "client_subscription_allowance_reservations_exact_identity_unique" UNIQUE("id","period_id","subscription_id"),
	CONSTRAINT "client_subscription_allowance_reservations_state_check" CHECK ((
        "client_subscription_allowance_reservations"."state" = 'reserved' and "client_subscription_allowance_reservations"."consumed_at" is null and "client_subscription_allowance_reservations"."released_at" is null
      ) or (
        "client_subscription_allowance_reservations"."state" = 'consumed' and "client_subscription_allowance_reservations"."consumed_at" is not null and "client_subscription_allowance_reservations"."released_at" is null
      ) or (
        "client_subscription_allowance_reservations"."state" = 'released' and "client_subscription_allowance_reservations"."consumed_at" is null and "client_subscription_allowance_reservations"."released_at" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "client_subscription_period_allowances" (
	"period_id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"total" integer NOT NULL,
	"available" integer NOT NULL,
	"reserved" integer NOT NULL,
	"consumed" integer NOT NULL,
	"released" integer NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_subscription_period_allowances_exact_identity_unique" UNIQUE("period_id","subscription_id"),
	CONSTRAINT "client_subscription_period_allowances_nonnegative_check" CHECK ("client_subscription_period_allowances"."total" >= 0 and "client_subscription_period_allowances"."available" >= 0 and "client_subscription_period_allowances"."reserved" >= 0 and "client_subscription_period_allowances"."consumed" >= 0 and "client_subscription_period_allowances"."released" >= 0),
	CONSTRAINT "client_subscription_period_allowances_arithmetic_check" CHECK ("client_subscription_period_allowances"."available" + "client_subscription_period_allowances"."reserved" + "client_subscription_period_allowances"."consumed" + "client_subscription_period_allowances"."released" = "client_subscription_period_allowances"."total"),
	CONSTRAINT "client_subscription_period_allowances_version_check" CHECK ("client_subscription_period_allowances"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "client_entitlement_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"journal_epoch_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"version" integer NOT NULL,
	"source_transition_id" uuid NOT NULL,
	"source_subscription_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_entitlement_grants_subscription_period_capability_unique" UNIQUE("subscription_id","period_id","capability"),
	CONSTRAINT "client_entitlement_grants_exact_identity_unique" UNIQUE("id","subscription_id","period_id"),
	CONSTRAINT "client_entitlement_grants_id_subscription_unique" UNIQUE("id","subscription_id"),
	CONSTRAINT "client_entitlement_grants_capability_check" CHECK ("client_entitlement_grants"."capability" = 'astro_diary'),
	CONSTRAINT "client_entitlement_grants_state_check" CHECK ("client_entitlement_grants"."state" in ('active', 'ended', 'revoked')),
	CONSTRAINT "client_entitlement_grants_half_open_range_check" CHECK ("client_entitlement_grants"."starts_at" < "client_entitlement_grants"."ends_at"),
	CONSTRAINT "client_entitlement_grants_version_check" CHECK ("client_entitlement_grants"."version" >= 1 and "client_entitlement_grants"."source_subscription_version" >= 2)
);
--> statement-breakpoint
CREATE TABLE "client_entitlement_transition_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transition_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"subscription_version" integer NOT NULL,
	"scope" text NOT NULL,
	"applied_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_entitlement_transition_applications_transition_unique" UNIQUE("transition_id"),
	CONSTRAINT "client_entitlement_transition_applications_subscription_version_unique" UNIQUE("subscription_id","subscription_version"),
	CONSTRAINT "client_entitlement_transition_applications_exact_identity_unique" UNIQUE("id","subscription_id","transition_id"),
	CONSTRAINT "client_entitlement_transition_applications_id_subscription_unique" UNIQUE("id","subscription_id"),
	CONSTRAINT "client_entitlement_transition_applications_scope_check" CHECK ("client_entitlement_transition_applications"."scope" in ('period', 'subscription_all'))
);
--> statement-breakpoint
CREATE TABLE "client_entitlement_transition_effects" (
	"application_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"before_version" integer,
	"before_state" text,
	"after_version" integer NOT NULL,
	"after_state" text NOT NULL,
	CONSTRAINT "client_entitlement_transition_effects_application_grant_unique" UNIQUE("application_id","grant_id"),
	CONSTRAINT "client_entitlement_transition_effects_version_check" CHECK ((
          "client_entitlement_transition_effects"."before_version" is null
          and "client_entitlement_transition_effects"."before_state" is null
          and "client_entitlement_transition_effects"."after_version" = 1
        ) or (
          "client_entitlement_transition_effects"."before_version" is not null
          and "client_entitlement_transition_effects"."before_state" = 'active'
          and "client_entitlement_transition_effects"."after_version" = "client_entitlement_transition_effects"."before_version" + 1
        )),
	CONSTRAINT "client_entitlement_transition_effects_state_check" CHECK ("client_entitlement_transition_effects"."after_state" in ('active', 'ended', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_purpose_check";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "astro_diary_reflection_cycles_per_period" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "astro_diary_response_sla_working_days" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "astro_diary_client_response_window_calendar_days" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "astro_diary_working_weekdays_mask" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "astro_diary_service_timezone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_exact_subscription_identity_unique" UNIQUE("id","client_user_id","astrologer_user_id","product_id");--> statement-breakpoint
ALTER TABLE "client_subscription_contracts" ADD CONSTRAINT "client_subscription_contracts_order_identity_fk" FOREIGN KEY ("order_id","client_user_id","astrologer_user_id","product_id") REFERENCES "public"."orders"("id","client_user_id","astrologer_user_id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_contracts" ADD CONSTRAINT "client_subscription_contracts_purchase_authority_fk" FOREIGN KEY ("order_id","purchase_authority_digest") REFERENCES "public"."client_subscription_purchase_authorities"("order_id","canonical_digest") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_contracts" ADD CONSTRAINT "client_subscription_contracts_billing_economics_fk" FOREIGN KEY ("billing_order_id","billing_economics_digest") REFERENCES "public"."finance_order_economics_snapshots"("order_id","canonical_digest") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_contracts" ADD CONSTRAINT "client_subscription_contracts_product_owner_fk" FOREIGN KEY ("product_id","astrologer_user_id") REFERENCES "public"."products"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_contracts" ADD CONSTRAINT "client_subscription_contracts_relationship_identity_fk" FOREIGN KEY ("relationship_id","client_user_id","astrologer_user_id") REFERENCES "public"."client_astrologer_relationships"("id","client_user_id","astrologer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_purchase_authorities" ADD CONSTRAINT "client_subscription_purchase_authorities_order_identity_fk" FOREIGN KEY ("order_id","client_user_id","astrologer_user_id","product_id") REFERENCES "public"."orders"("id","client_user_id","astrologer_user_id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_purchase_authorities" ADD CONSTRAINT "client_subscription_purchase_authorities_relationship_identity_fk" FOREIGN KEY ("relationship_id","client_user_id","astrologer_user_id") REFERENCES "public"."client_astrologer_relationships"("id","client_user_id","astrologer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_purchase_authorities" ADD CONSTRAINT "client_subscription_purchase_authorities_billing_economics_fk" FOREIGN KEY ("billing_economics_order_id","billing_economics_digest") REFERENCES "public"."finance_order_economics_snapshots"("order_id","canonical_digest") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_slots" ADD CONSTRAINT "client_subscription_slots_relationship_identity_fk" FOREIGN KEY ("relationship_id","client_user_id","astrologer_user_id") REFERENCES "public"."client_astrologer_relationships"("id","client_user_id","astrologer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_slots" ADD CONSTRAINT "client_subscription_slots_product_owner_fk" FOREIGN KEY ("product_id","astrologer_user_id") REFERENCES "public"."products"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_contract_id_client_subscription_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."client_subscription_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_contract_scope_fk" FOREIGN KEY ("contract_id","relationship_id","product_id") REFERENCES "public"."client_subscription_contracts"("id","relationship_id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_slot_fk" FOREIGN KEY ("relationship_id","product_id") REFERENCES "public"."client_subscription_slots"("relationship_id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_periods" ADD CONSTRAINT "client_subscription_periods_subscription_contract_fk" FOREIGN KEY ("subscription_id","contract_id") REFERENCES "public"."client_subscriptions"("id","contract_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_renewal_requests" ADD CONSTRAINT "client_subscription_renewal_requests_subscription_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."client_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_renewal_requests" ADD CONSTRAINT "client_subscription_renewal_requests_source_period_fk" FOREIGN KEY ("source_period_id","subscription_id") REFERENCES "public"."client_subscription_periods"("id","subscription_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_lifecycle_events" ADD CONSTRAINT "client_subscription_lifecycle_events_transition_fk" FOREIGN KEY ("transition_id","subscription_id","contract_id","subscription_version") REFERENCES "public"."client_subscription_transition_receipts"("transition_id","subscription_id","contract_id","subscription_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_transition_receipts" ADD CONSTRAINT "client_subscription_transition_receipts_subscription_scope_fk" FOREIGN KEY ("subscription_id","contract_id","relationship_id","journal_epoch_id") REFERENCES "public"."client_subscriptions"("id","contract_id","relationship_id","journal_epoch_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_transition_receipts" ADD CONSTRAINT "client_subscription_transition_receipts_period_fk" FOREIGN KEY ("period_id","subscription_id") REFERENCES "public"."client_subscription_periods"("id","subscription_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_command_receipts" ADD CONSTRAINT "client_subscription_command_receipts_subscription_id_client_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."client_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_creation_receipts" ADD CONSTRAINT "client_subscription_creation_receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_event_application_receipts" ADD CONSTRAINT "client_subscription_event_application_receipts_subscription_id_client_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."client_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_allowance_command_effects" ADD CONSTRAINT "client_subscription_allowance_command_effects_receipt_fk" FOREIGN KEY ("period_id","idempotency_key") REFERENCES "public"."client_subscription_allowance_command_receipts"("period_id","idempotency_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_allowance_command_effects" ADD CONSTRAINT "client_subscription_allowance_command_effects_reservation_fk" FOREIGN KEY ("reservation_id","period_id") REFERENCES "public"."client_subscription_allowance_reservations"("id","period_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_allowance_command_effects" ADD CONSTRAINT "client_subscription_allowance_command_effects_consumption_fk" FOREIGN KEY ("consumption_id","period_id") REFERENCES "public"."client_subscription_allowance_consumptions"("id","period_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_allowance_command_receipts" ADD CONSTRAINT "client_subscription_allowance_receipts_allowance_fk" FOREIGN KEY ("period_id") REFERENCES "public"."client_subscription_period_allowances"("period_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_allowance_consumptions" ADD CONSTRAINT "client_subscription_allowance_consumptions_allowance_fk" FOREIGN KEY ("period_id","subscription_id") REFERENCES "public"."client_subscription_period_allowances"("period_id","subscription_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_allowance_consumptions" ADD CONSTRAINT "client_subscription_allowance_consumptions_reservation_fk" FOREIGN KEY ("reservation_id","period_id","subscription_id") REFERENCES "public"."client_subscription_allowance_reservations"("id","period_id","subscription_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_allowance_reservations" ADD CONSTRAINT "client_subscription_allowance_reservations_allowance_fk" FOREIGN KEY ("period_id","subscription_id") REFERENCES "public"."client_subscription_period_allowances"("period_id","subscription_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_period_allowances" ADD CONSTRAINT "client_subscription_period_allowances_period_fk" FOREIGN KEY ("period_id","subscription_id","ends_at") REFERENCES "public"."client_subscription_periods"("id","subscription_id","ends_at") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_entitlement_grants" ADD CONSTRAINT "client_entitlement_grants_subscription_scope_fk" FOREIGN KEY ("subscription_id","contract_id","relationship_id","journal_epoch_id") REFERENCES "public"."client_subscriptions"("id","contract_id","relationship_id","journal_epoch_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_entitlement_grants" ADD CONSTRAINT "client_entitlement_grants_period_fk" FOREIGN KEY ("period_id","subscription_id","contract_id","starts_at","ends_at") REFERENCES "public"."client_subscription_periods"("id","subscription_id","contract_id","starts_at","ends_at") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_entitlement_grants" ADD CONSTRAINT "client_entitlement_grants_source_transition_fk" FOREIGN KEY ("source_transition_id","subscription_id","source_subscription_version") REFERENCES "public"."client_subscription_transition_receipts"("transition_id","subscription_id","subscription_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_entitlement_transition_applications" ADD CONSTRAINT "client_entitlement_transition_applications_transition_fk" FOREIGN KEY ("transition_id","subscription_id","subscription_version") REFERENCES "public"."client_subscription_transition_receipts"("transition_id","subscription_id","subscription_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_entitlement_transition_effects" ADD CONSTRAINT "client_entitlement_transition_effects_application_fk" FOREIGN KEY ("application_id","subscription_id") REFERENCES "public"."client_entitlement_transition_applications"("id","subscription_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_entitlement_transition_effects" ADD CONSTRAINT "client_entitlement_transition_effects_grant_fk" FOREIGN KEY ("grant_id","subscription_id") REFERENCES "public"."client_entitlement_grants"("id","subscription_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_subscriptions_current_relationship_product_unique" ON "client_subscriptions" USING btree ("relationship_id","product_id") WHERE "client_subscriptions"."state" in ('pending_initial_payment', 'active', 'cancel_at_period_end') or "client_subscriptions"."renewal_request_id" is not null;--> statement-breakpoint
CREATE INDEX "client_subscriptions_contract_state_idx" ON "client_subscriptions" USING btree ("contract_id","state");--> statement-breakpoint
CREATE INDEX "client_subscriptions_relationship_state_idx" ON "client_subscriptions" USING btree ("relationship_id","state");--> statement-breakpoint
CREATE INDEX "client_subscription_periods_subscription_bounds_idx" ON "client_subscription_periods" USING btree ("subscription_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_delivery_formats_product_order_unique" ON "product_delivery_formats" USING btree ("product_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_access_grants_product_order_unique" ON "product_access_grants" USING btree ("product_id","order");--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_client_subscription_lifecycle_dispatch_check" CHECK ("outbox_events"."event_type" <> 'client_subscription.lifecycle_event.dispatch_requested.v1' or (
        "outbox_events"."payload" = jsonb_build_object(
          'schemaVersion', 'client-subscription-lifecycle-event-dispatch-request.v1',
          'lifecycleEventId', "outbox_events"."aggregate_id"::text
        )
      ));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_revision_check" CHECK ("products"."revision" >= 1);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_astro_diary_config_completeness_check" CHECK (num_nonnulls("products"."astro_diary_reflection_cycles_per_period", "products"."astro_diary_response_sla_working_days", "products"."astro_diary_client_response_window_calendar_days", "products"."astro_diary_working_weekdays_mask", "products"."astro_diary_service_timezone") in (0, 5));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_astro_diary_shape_check" CHECK ("products"."astro_diary_reflection_cycles_per_period" is null or ("products"."type" = 'sub' and "products"."payment_model" = 'sub' and "products"."execution_mode" = 'async' and "products"."participant_mode" = 'solo' and "products"."duration_minutes" is null and "products"."duration_label" is null and "products"."sla_label" is null and "products"."package_session_count" is null and "products"."package_discount_percent" is null and "products"."trial_days" is null and "products"."group_size" is null));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_astro_diary_reflection_cycles_check" CHECK ("products"."astro_diary_reflection_cycles_per_period" is null or "products"."astro_diary_reflection_cycles_per_period" between 1 and 366);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_astro_diary_response_sla_check" CHECK ("products"."astro_diary_response_sla_working_days" is null or "products"."astro_diary_response_sla_working_days" between 1 and 30);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_astro_diary_client_response_window_check" CHECK ("products"."astro_diary_client_response_window_calendar_days" is null or "products"."astro_diary_client_response_window_calendar_days" between 1 and 90);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_astro_diary_working_weekdays_mask_check" CHECK ("products"."astro_diary_working_weekdays_mask" is null or "products"."astro_diary_working_weekdays_mask" between 1 and 127);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_astro_diary_service_timezone_check" CHECK ("products"."astro_diary_service_timezone" is null or (length(trim("products"."astro_diary_service_timezone")) between 1 and 100 and "products"."astro_diary_service_timezone" = trim("products"."astro_diary_service_timezone")));--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_purpose_check" CHECK ("media_assets"."purpose" in ('product_cover', 'profile_avatar', 'profile_cover', 'verification_identity_document', 'verification_qualification_document', 'calculation_report_pdf', 'messaging_attachment', 'astro_diary_attachment', 'astro_diary_voice', 'astro_diary_export_pdf'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_astro_diary_product_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $astro_diary_product_integrity$
DECLARE
  new_product_id uuid;
  old_product_id uuid;
  checked_product_id uuid;
  checked_product_ids uuid[] := ARRAY[]::uuid[];
  product_row products%ROWTYPE;
  product_row_transaction_id text;
  config_field_count integer;
  config_present boolean;
  journal_is_sole_grant boolean;
  access_grant_count bigint;
  journal_grant_count bigint;
  canonical_journal_grant_count bigint;
  delivery_formats text[];
  required_client_data_count bigint;
  method_count bigint;
  modifier_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    IF TG_OP = 'UPDATE' AND (
      NEW.id IS DISTINCT FROM OLD.id
      OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.revision <> OLD.revision + 1
      OR NEW.updated_at < OLD.updated_at
    ) THEN
      RAISE EXCEPTION 'Product mutation requires one monotonic revision bump'
        USING ERRCODE = '23514', CONSTRAINT = 'astro_diary_product_integrity';
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_product_id := NEW.id;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      old_product_id := OLD.id;
    END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN
      new_product_id := NEW.product_id;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      old_product_id := OLD.product_id;
    END IF;
  END IF;

  SELECT coalesce(
           array_agg(candidate_product_id ORDER BY candidate_product_id),
           ARRAY[]::uuid[]
         )
    INTO checked_product_ids
    FROM (
      SELECT DISTINCT unnest(ARRAY[new_product_id, old_product_id]) AS candidate_product_id
    ) AS candidate_product_ids
   WHERE candidate_product_id IS NOT NULL;

  FOREACH checked_product_id IN ARRAY checked_product_ids
  LOOP
    SELECT *
      INTO product_row
      FROM products
     WHERE id = checked_product_id
       FOR NO KEY UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    SELECT xmin::text
      INTO product_row_transaction_id
      FROM products
     WHERE id = checked_product_id;
    IF TG_TABLE_NAME <> 'products'
       AND product_row_transaction_id IS DISTINCT FROM pg_current_xact_id()::text THEN
      RAISE EXCEPTION 'Product child mutation requires a parent revision bump in the same transaction'
        USING ERRCODE = '23514', CONSTRAINT = 'astro_diary_product_integrity';
    END IF;

    config_field_count := num_nonnulls(
      product_row.astro_diary_reflection_cycles_per_period,
      product_row.astro_diary_response_sla_working_days,
      product_row.astro_diary_client_response_window_calendar_days,
      product_row.astro_diary_working_weekdays_mask,
      product_row.astro_diary_service_timezone
    );
    config_present := config_field_count = 5;

    SELECT count(*),
           count(*) FILTER (WHERE grant_value = 'journal'),
           count(*) FILTER (WHERE grant_value = 'journal' AND grant_order = 0)
      INTO access_grant_count, journal_grant_count, canonical_journal_grant_count
      FROM (
        SELECT value AS grant_value, "order" AS grant_order
          FROM product_access_grants
         WHERE product_id = checked_product_id
      ) AS grants;

    journal_is_sole_grant := journal_grant_count = 1
      AND canonical_journal_grant_count = 1
      AND access_grant_count = 1;

    IF config_field_count NOT IN (0, 5) THEN
      RAISE EXCEPTION 'AstroDiary product configuration must be either complete or absent'
        USING ERRCODE = '23514', CONSTRAINT = 'astro_diary_product_integrity';
    END IF;

    IF journal_grant_count <> 0 AND (
      access_grant_count <> 1
      OR canonical_journal_grant_count <> journal_grant_count
    ) THEN
      RAISE EXCEPTION 'Journal must be the product sole access grant'
        USING ERRCODE = '23514', CONSTRAINT = 'astro_diary_product_integrity';
    END IF;

    IF config_present IS DISTINCT FROM journal_is_sole_grant THEN
      RAISE EXCEPTION 'AstroDiary configuration and sole journal access grant must coexist'
        USING ERRCODE = '23514', CONSTRAINT = 'astro_diary_product_integrity';
    END IF;

    IF NOT journal_is_sole_grant THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_timezone_names
       WHERE name = product_row.astro_diary_service_timezone
    ) THEN
      RAISE EXCEPTION 'AstroDiary service timezone is not a recognized IANA timezone'
        USING ERRCODE = '23514', CONSTRAINT = 'astro_diary_product_integrity';
    END IF;

    IF product_row.type IS DISTINCT FROM 'sub'
       OR product_row.payment_model IS DISTINCT FROM 'sub'
       OR product_row.execution_mode IS DISTINCT FROM 'async'
       OR product_row.participant_mode IS DISTINCT FROM 'solo'
       OR product_row.price_minor <= 0
       OR product_row.duration_minutes IS NOT NULL
       OR product_row.duration_label IS NOT NULL
       OR product_row.sla_label IS NOT NULL
       OR product_row.package_session_count IS NOT NULL
       OR product_row.package_discount_percent IS NOT NULL
       OR product_row.trial_days IS NOT NULL
       OR product_row.group_size IS NOT NULL THEN
      RAISE EXCEPTION 'AstroDiary product parent shape is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'astro_diary_product_integrity';
    END IF;

    SELECT coalesce(
             array_agg(delivery_format ORDER BY format_order),
             ARRAY[]::text[]
           )
      INTO delivery_formats
      FROM (
        SELECT value AS delivery_format, "order" AS format_order
          FROM product_delivery_formats
         WHERE product_id = checked_product_id
      ) AS formats;

    IF delivery_formats IS DISTINCT FROM ARRAY['chat', 'audio', 'file']::text[]
       OR EXISTS (
         SELECT 1 FROM product_delivery_formats exact_format
          WHERE exact_format.product_id = checked_product_id
            AND NOT (
              (exact_format.value = 'chat' AND exact_format."order" = 0)
              OR (exact_format.value = 'audio' AND exact_format."order" = 1)
              OR (exact_format.value = 'file' AND exact_format."order" = 2)
            )
       ) THEN
      RAISE EXCEPTION 'AstroDiary delivery formats must be exactly chat, audio and file'
        USING ERRCODE = '23514', CONSTRAINT = 'astro_diary_product_integrity';
    END IF;

    SELECT count(*)
      INTO required_client_data_count
      FROM product_required_client_data
     WHERE product_id = checked_product_id;
    SELECT count(*)
      INTO method_count
      FROM product_methods
     WHERE product_id = checked_product_id;
    SELECT count(*)
      INTO modifier_count
      FROM product_modifiers
     WHERE product_id = checked_product_id;

    IF required_client_data_count <> 0
       OR method_count <> 0
       OR modifier_count <> 0 THEN
      RAISE EXCEPTION 'AstroDiary client data, methods and modifiers must be empty'
        USING ERRCODE = '23514', CONSTRAINT = 'astro_diary_product_integrity';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$astro_diary_product_integrity$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "astro_diary_product_integrity"
AFTER INSERT OR UPDATE OR DELETE ON "products"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_astro_diary_product_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "astro_diary_product_integrity"
AFTER INSERT OR UPDATE OR DELETE ON "product_access_grants"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_astro_diary_product_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "astro_diary_product_integrity"
AFTER INSERT OR UPDATE OR DELETE ON "product_delivery_formats"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_astro_diary_product_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "astro_diary_product_integrity"
AFTER INSERT OR UPDATE OR DELETE ON "product_required_client_data"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_astro_diary_product_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "astro_diary_product_integrity"
AFTER INSERT OR UPDATE OR DELETE ON "product_methods"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_astro_diary_product_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "astro_diary_product_integrity"
AFTER INSERT OR UPDATE OR DELETE ON "product_modifiers"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_astro_diary_product_integrity();
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE client_subscription_periods
ADD CONSTRAINT client_subscription_periods_no_overlap
EXCLUDE USING gist (
  subscription_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
);
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_client_subscription_immutable_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_subscription_immutable$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Client subscription historical facts cannot be truncated'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_history_immutable';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Client subscription historical facts are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_history_immutable';
  END IF;
  RAISE EXCEPTION 'Client subscription historical facts cannot be deleted'
    USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_history_immutable';
END;
$client_subscription_immutable$;
--> statement-breakpoint
CREATE TRIGGER "client_subscription_purchase_authorities_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_purchase_authorities
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_purchase_authorities_no_truncate"
BEFORE TRUNCATE ON client_subscription_purchase_authorities
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_contracts_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_contracts
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_contracts_no_truncate"
BEFORE TRUNCATE ON client_subscription_contracts
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_renewal_requests_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_renewal_requests
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_renewal_requests_no_truncate"
BEFORE TRUNCATE ON client_subscription_renewal_requests
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_periods_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_periods
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_periods_no_truncate"
BEFORE TRUNCATE ON client_subscription_periods
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_transition_receipts_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_transition_receipts
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_transition_receipts_no_truncate"
BEFORE TRUNCATE ON client_subscription_transition_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_lifecycle_events_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_lifecycle_events
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_lifecycle_events_no_truncate"
BEFORE TRUNCATE ON client_subscription_lifecycle_events
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_creation_receipts_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_creation_receipts
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_creation_receipts_no_truncate"
BEFORE TRUNCATE ON client_subscription_creation_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_command_receipts_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_command_receipts
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_command_receipts_no_truncate"
BEFORE TRUNCATE ON client_subscription_command_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_event_application_receipts_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_event_application_receipts
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_event_application_receipts_no_truncate"
BEFORE TRUNCATE ON client_subscription_event_application_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_allowance_command_receipts_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_allowance_command_receipts
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_allowance_command_receipts_no_truncate"
BEFORE TRUNCATE ON client_subscription_allowance_command_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_allowance_command_effects_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_allowance_command_effects
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_allowance_command_effects_no_truncate"
BEFORE TRUNCATE ON client_subscription_allowance_command_effects
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_entitlement_transition_applications_immutable"
BEFORE UPDATE OR DELETE ON client_entitlement_transition_applications
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_entitlement_transition_applications_no_truncate"
BEFORE TRUNCATE ON client_entitlement_transition_applications
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_entitlement_transition_effects_immutable"
BEFORE UPDATE OR DELETE ON client_entitlement_transition_effects
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_entitlement_transition_effects_no_truncate"
BEFORE TRUNCATE ON client_entitlement_transition_effects
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_client_subscription_head_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_subscription_head_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Client subscription heads are retained permanently'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_head_monotonic';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.state <> 'pending_initial_payment' THEN
      RAISE EXCEPTION 'Client subscription heads begin pending at version one'
        USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_head_monotonic';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.relationship_id IS DISTINCT FROM OLD.relationship_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.journal_epoch_id IS DISTINCT FROM OLD.journal_epoch_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.version <> OLD.version + 1
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Client subscription head transition must be one contiguous CAS revision'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_head_monotonic';
  END IF;
  RETURN NEW;
END;
$client_subscription_head_guard$;
--> statement-breakpoint
CREATE TRIGGER "client_subscriptions_monotonic"
BEFORE INSERT OR UPDATE OR DELETE ON client_subscriptions
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_head_mutation();
--> statement-breakpoint
CREATE TRIGGER "client_subscriptions_no_truncate"
BEFORE TRUNCATE ON client_subscriptions
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_head_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_client_subscription_slot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_subscription_slot_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Client subscription CAS slots are retained permanently'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_slot_monotonic';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 0 OR NEW.current_subscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'Client subscription CAS slot begins empty at version zero'
        USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_slot_monotonic';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.relationship_id IS DISTINCT FROM OLD.relationship_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.client_user_id IS DISTINCT FROM OLD.client_user_id
     OR NEW.astrologer_user_id IS DISTINCT FROM OLD.astrologer_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.updated_at < OLD.updated_at
     OR (
       NEW.current_subscription_id IS DISTINCT FROM OLD.current_subscription_id
       AND NEW.version IS DISTINCT FROM OLD.version + 1
     )
     OR (
       NEW.current_subscription_id IS NOT DISTINCT FROM OLD.current_subscription_id
       AND NEW.version IS DISTINCT FROM OLD.version
     ) THEN
    RAISE EXCEPTION 'Client subscription slot pointer changes require one CAS revision'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_slot_monotonic';
  END IF;
  IF OLD.current_subscription_id IS NOT NULL
     AND NEW.current_subscription_id IS NOT NULL
     AND NEW.current_subscription_id IS DISTINCT FROM OLD.current_subscription_id THEN
    RAISE EXCEPTION 'Subscription slot cannot replace one epoch with another directly'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_slot_monotonic';
  END IF;
  RETURN NEW;
END;
$client_subscription_slot_guard$;
--> statement-breakpoint
CREATE TRIGGER "client_subscription_slots_monotonic"
BEFORE INSERT OR UPDATE OR DELETE ON client_subscription_slots
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_slot_mutation();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_slots_no_truncate"
BEFORE TRUNCATE ON client_subscription_slots
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_slot_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_client_subscription_allowance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_subscription_allowance_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Client subscription allowance heads are retained permanently'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_allowance_monotonic';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 THEN
      RAISE EXCEPTION 'Client subscription allowance begins at version one'
        USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_allowance_monotonic';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.period_id IS DISTINCT FROM OLD.period_id
     OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.version <> OLD.version + 1
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Client subscription allowance mutation requires one CAS revision'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_allowance_monotonic';
  END IF;
  RETURN NEW;
END;
$client_subscription_allowance_guard$;
--> statement-breakpoint
CREATE TRIGGER "client_subscription_period_allowances_monotonic"
BEFORE INSERT OR UPDATE OR DELETE ON client_subscription_period_allowances
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_allowance_mutation();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_period_allowances_no_truncate"
BEFORE TRUNCATE ON client_subscription_period_allowances
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_allowance_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_client_subscription_reservation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_subscription_reservation_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Client subscription allowance reservations are retained permanently'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_reservation_monotonic';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.state <> 'reserved' THEN
    RAISE EXCEPTION 'Client subscription reservation must begin reserved'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_reservation_monotonic';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.period_id IS DISTINCT FROM OLD.period_id
    OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
    OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
    OR OLD.state <> 'reserved'
    OR NEW.state NOT IN ('consumed', 'released')
  ) THEN
    RAISE EXCEPTION 'Client subscription reservation permits one terminal transition'
      USING ERRCODE = '55000', CONSTRAINT = 'client_subscription_reservation_monotonic';
  END IF;
  RETURN NEW;
END;
$client_subscription_reservation_guard$;
--> statement-breakpoint
CREATE TRIGGER "client_subscription_allowance_reservations_monotonic"
BEFORE INSERT OR UPDATE OR DELETE ON client_subscription_allowance_reservations
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_reservation_mutation();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_allowance_reservations_no_truncate"
BEFORE TRUNCATE ON client_subscription_allowance_reservations
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_reservation_mutation();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_allowance_consumptions_immutable"
BEFORE UPDATE OR DELETE ON client_subscription_allowance_consumptions
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE TRIGGER "client_subscription_allowance_consumptions_no_truncate"
BEFORE TRUNCATE ON client_subscription_allowance_consumptions
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_subscription_immutable_row();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_client_entitlement_grant_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_entitlement_grant_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Client entitlement grants are retained permanently'
      USING ERRCODE = '55000', CONSTRAINT = 'client_entitlement_grant_monotonic';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.state <> 'active' THEN
      RAISE EXCEPTION 'Client entitlement grant begins active at version one'
        USING ERRCODE = '55000', CONSTRAINT = 'client_entitlement_grant_monotonic';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
     OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.relationship_id IS DISTINCT FROM OLD.relationship_id
     OR NEW.journal_epoch_id IS DISTINCT FROM OLD.journal_epoch_id
     OR NEW.period_id IS DISTINCT FROM OLD.period_id
     OR NEW.capability IS DISTINCT FROM OLD.capability
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.state <> 'active'
     OR NEW.state NOT IN ('active', 'ended', 'revoked')
     OR NEW.source_subscription_version <= OLD.source_subscription_version
     OR NEW.version <> OLD.version + 1
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Client entitlement grant permits one terminal CAS transition'
      USING ERRCODE = '55000', CONSTRAINT = 'client_entitlement_grant_monotonic';
  END IF;
  RETURN NEW;
END;
$client_entitlement_grant_guard$;
--> statement-breakpoint
CREATE TRIGGER "client_entitlement_grants_monotonic"
BEFORE INSERT OR UPDATE OR DELETE ON client_entitlement_grants
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_entitlement_grant_mutation();
--> statement-breakpoint
CREATE TRIGGER "client_entitlement_grants_no_truncate"
BEFORE TRUNCATE ON client_entitlement_grants
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_client_entitlement_grant_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_client_subscription_purchase_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_subscription_purchase_authority$
DECLARE
  authority_row client_subscription_purchase_authorities%ROWTYPE;
  product_row products%ROWTYPE;
  order_row orders%ROWTYPE;
  relationship_row client_astrologer_relationships%ROWTYPE;
  economics_row finance_order_economics_snapshots%ROWTYPE;
  order_row_transaction_id text;
  expected_config jsonb;
  expected_preimage text;
  expected_weekdays jsonb;
BEGIN
  SELECT * INTO STRICT authority_row
    FROM client_subscription_purchase_authorities
   WHERE order_id = NEW.order_id;
  SELECT * INTO STRICT order_row
    FROM orders
   WHERE id = authority_row.order_id
     FOR NO KEY UPDATE;
  SELECT xmin::text INTO STRICT order_row_transaction_id
    FROM orders
   WHERE id = authority_row.order_id;
  SELECT * INTO STRICT product_row
    FROM products
   WHERE id = authority_row.product_id
     FOR NO KEY UPDATE;
  SELECT * INTO STRICT relationship_row
    FROM client_astrologer_relationships
   WHERE id = authority_row.relationship_id
     FOR NO KEY UPDATE;
  SELECT * INTO STRICT economics_row
    FROM finance_order_economics_snapshots
   WHERE order_id = authority_row.billing_economics_order_id
     AND canonical_digest = authority_row.billing_economics_digest
     FOR KEY SHARE;

  IF order_row_transaction_id IS DISTINCT FROM pg_current_xact_id()::text THEN
    RAISE EXCEPTION 'Subscription purchase authority must be sealed atomically with its order'
      USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_purchase_authority';
  END IF;

  SELECT coalesce(jsonb_agg(weekday ORDER BY weekday), '[]'::jsonb)
    INTO expected_weekdays
    FROM generate_series(1, 7) AS weekday
   WHERE product_row.astro_diary_working_weekdays_mask & (1 << (weekday - 1)) <> 0;
  expected_config := jsonb_build_object(
    'clientResponseWindowCalendarDays', product_row.astro_diary_client_response_window_calendar_days,
    'reflectionCyclesPerPeriod', product_row.astro_diary_reflection_cycles_per_period,
    'responseSlaWorkingDays', product_row.astro_diary_response_sla_working_days,
    'serviceTimezone', product_row.astro_diary_service_timezone,
    'workingWeekdays', expected_weekdays
  );

  IF product_row.revision IS DISTINCT FROM authority_row.product_revision
     OR product_row.owner_user_id IS DISTINCT FROM authority_row.astrologer_user_id
     OR product_row.status IS DISTINCT FROM 'active'
     OR product_row.type IS DISTINCT FROM 'sub'
     OR product_row.payment_model IS DISTINCT FROM 'sub'
     OR product_row.execution_mode IS DISTINCT FROM 'async'
     OR product_row.participant_mode IS DISTINCT FROM 'solo'
     OR product_row.subscription_period IS DISTINCT FROM authority_row.cadence
     OR product_row.price_minor IS DISTINCT FROM authority_row.price_minor
     OR product_row.currency IS DISTINCT FROM authority_row.currency
     OR product_row.trial_days IS NOT NULL
     OR product_row.group_size IS NOT NULL
     OR product_row.package_session_count IS NOT NULL
     OR expected_config IS DISTINCT FROM authority_row.astro_diary_config
     OR order_row.client_user_id IS DISTINCT FROM authority_row.client_user_id
     OR order_row.astrologer_user_id IS DISTINCT FROM authority_row.astrologer_user_id
     OR order_row.product_id IS DISTINCT FROM authority_row.product_id
     OR order_row.gross_amount_minor IS DISTINCT FROM authority_row.price_minor
     OR order_row.gross_currency IS DISTINCT FROM authority_row.currency
     OR relationship_row.client_user_id IS DISTINCT FROM authority_row.client_user_id
     OR relationship_row.astrologer_user_id IS DISTINCT FROM authority_row.astrologer_user_id
     OR relationship_row.status IS DISTINCT FROM 'active'
     OR (SELECT coalesce(jsonb_agg(value ORDER BY "order"), '[]'::jsonb)
           FROM product_access_grants WHERE product_id = product_row.id)
        IS DISTINCT FROM authority_row.access_grants
     OR (SELECT coalesce(jsonb_agg(value ORDER BY "order"), '[]'::jsonb)
           FROM product_delivery_formats WHERE product_id = product_row.id)
        IS DISTINCT FROM authority_row.delivery_formats
     OR (SELECT coalesce(jsonb_agg(value ORDER BY "order"), '[]'::jsonb)
           FROM product_required_client_data WHERE product_id = product_row.id)
        IS DISTINCT FROM authority_row.required_client_data
     OR (SELECT coalesce(jsonb_agg(value ORDER BY "order"), '[]'::jsonb)
           FROM product_methods WHERE product_id = product_row.id)
        IS DISTINCT FROM authority_row.methods
     OR EXISTS (SELECT 1 FROM product_modifiers WHERE product_id = product_row.id) THEN
    RAISE EXCEPTION 'Subscription purchase authority does not match locked order and product terms'
      USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_purchase_authority';
  END IF;

  IF economics_row.astrologer_user_id IS DISTINCT FROM authority_row.astrologer_user_id
     OR economics_row.gross_amount_minor IS DISTINCT FROM authority_row.price_minor
     OR economics_row.gross_currency IS DISTINCT FROM authority_row.currency THEN
    RAISE EXCEPTION 'Subscription purchase authority billing economics do not match the order'
      USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_purchase_authority';
  END IF;

  expected_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'accessGrants', authority_row.access_grants,
    'astrologerUserId', authority_row.astrologer_user_id::text,
    'astroDiaryConfig', authority_row.astro_diary_config,
    'billingEconomics', jsonb_build_object(
      'allocationRevision', economics_row.allocation_revision,
      'astrologerUserId', economics_row.astrologer_user_id::text,
      'commission', jsonb_build_object('amountMinor', economics_row.commission_amount_minor, 'currency', economics_row.commission_currency),
      'commissionBps', economics_row.commission_bps,
      'gross', jsonb_build_object('amountMinor', economics_row.gross_amount_minor, 'currency', economics_row.gross_currency),
      'orderId', economics_row.order_id,
      'payable', jsonb_build_object('amountMinor', economics_row.payable_amount_minor, 'currency', economics_row.payable_currency),
      'planId', economics_row.plan_id,
      'planVersionId', economics_row.plan_version_id
    ),
    'cadence', authority_row.cadence,
    'clientUserId', authority_row.client_user_id::text,
    'currency', authority_row.currency,
    'deliveryFormats', authority_row.delivery_formats,
    'methods', authority_row.methods,
    'modifiers', authority_row.modifiers,
    'orderId', authority_row.order_id::text,
    'priceMinor', authority_row.price_minor,
    'productId', authority_row.product_id::text,
    'productRevision', authority_row.product_revision,
    'relationshipId', authority_row.relationship_id::text,
    'requiredClientData', authority_row.required_client_data
  ));
  IF authority_row.canonical_preimage IS DISTINCT FROM expected_preimage
     OR authority_row.canonical_digest IS DISTINCT FROM
        'sha256:' || encode(digest(expected_preimage, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'Subscription purchase authority canonical seal is invalid'
      USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_purchase_authority';
  END IF;
  RETURN NULL;
END;
$client_subscription_purchase_authority$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_purchase_authority"
AFTER INSERT ON client_subscription_purchase_authorities
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_purchase_authority();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_client_subscription_contract_seal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_subscription_contract_seal$
DECLARE
  contract_row client_subscription_contracts%ROWTYPE;
  authority_row client_subscription_purchase_authorities%ROWTYPE;
  order_row orders%ROWTYPE;
  relationship_row client_astrologer_relationships%ROWTYPE;
  economics_row finance_order_economics_snapshots%ROWTYPE;
  expected_preimage text;
BEGIN
  SELECT * INTO STRICT contract_row
    FROM client_subscription_contracts
   WHERE id = NEW.id;
  SELECT * INTO STRICT authority_row
    FROM client_subscription_purchase_authorities
   WHERE order_id = contract_row.order_id
     FOR NO KEY UPDATE;
  SELECT * INTO STRICT order_row
    FROM orders
   WHERE id = contract_row.order_id
     FOR NO KEY UPDATE;
  SELECT * INTO STRICT relationship_row
    FROM client_astrologer_relationships
   WHERE id = contract_row.relationship_id
     FOR NO KEY UPDATE;
  SELECT * INTO STRICT economics_row
    FROM finance_order_economics_snapshots
   WHERE order_id = contract_row.billing_order_id
     AND canonical_digest = contract_row.billing_economics_digest
     FOR KEY SHARE;

  IF authority_row.canonical_digest IS DISTINCT FROM contract_row.purchase_authority_digest
     OR authority_row.product_id IS DISTINCT FROM contract_row.product_id
     OR authority_row.product_revision IS DISTINCT FROM contract_row.product_revision
     OR authority_row.relationship_id IS DISTINCT FROM contract_row.relationship_id
     OR authority_row.astrologer_user_id IS DISTINCT FROM contract_row.astrologer_user_id
     OR authority_row.client_user_id IS DISTINCT FROM contract_row.client_user_id
     OR authority_row.price_minor IS DISTINCT FROM contract_row.price_minor
     OR authority_row.currency IS DISTINCT FROM contract_row.currency
     OR authority_row.cadence IS DISTINCT FROM contract_row.cadence
     OR authority_row.billing_economics_digest IS DISTINCT FROM contract_row.billing_economics_digest
     OR authority_row.access_grants IS DISTINCT FROM contract_row.access_grants
     OR authority_row.delivery_formats IS DISTINCT FROM contract_row.delivery_formats
     OR authority_row.required_client_data IS DISTINCT FROM contract_row.required_client_data
     OR authority_row.methods IS DISTINCT FROM contract_row.methods
     OR authority_row.modifiers IS DISTINCT FROM contract_row.modifiers
     OR authority_row.astro_diary_config IS DISTINCT FROM contract_row.astro_diary_config
     OR order_row.client_user_id IS DISTINCT FROM contract_row.client_user_id
     OR order_row.astrologer_user_id IS DISTINCT FROM contract_row.astrologer_user_id
     OR order_row.product_id IS DISTINCT FROM contract_row.product_id
     OR order_row.gross_amount_minor IS DISTINCT FROM contract_row.price_minor
     OR order_row.gross_currency IS DISTINCT FROM contract_row.currency
     OR relationship_row.client_user_id IS DISTINCT FROM contract_row.client_user_id
     OR relationship_row.astrologer_user_id IS DISTINCT FROM contract_row.astrologer_user_id
     OR relationship_row.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Client subscription contract does not match locked authority'
      USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_contract_seal';
  END IF;

  IF contract_row.billing_order_id IS DISTINCT FROM contract_row.order_id::text
     OR contract_row.billing_astrologer_user_id IS DISTINCT FROM contract_row.astrologer_user_id
     OR contract_row.billing_plan_id IS DISTINCT FROM economics_row.plan_id
     OR contract_row.billing_plan_version_id IS DISTINCT FROM economics_row.plan_version_id
     OR contract_row.billing_gross_amount_minor IS DISTINCT FROM economics_row.gross_amount_minor
     OR contract_row.billing_gross_currency IS DISTINCT FROM economics_row.gross_currency
     OR contract_row.billing_commission_amount_minor IS DISTINCT FROM economics_row.commission_amount_minor
     OR contract_row.billing_commission_currency IS DISTINCT FROM economics_row.commission_currency
     OR contract_row.billing_payable_amount_minor IS DISTINCT FROM economics_row.payable_amount_minor
     OR contract_row.billing_payable_currency IS DISTINCT FROM economics_row.payable_currency
     OR contract_row.billing_commission_bps IS DISTINCT FROM economics_row.commission_bps
     OR contract_row.billing_allocation_revision IS DISTINCT FROM economics_row.allocation_revision
     OR contract_row.billing_astrologer_user_id IS DISTINCT FROM economics_row.astrologer_user_id
     OR order_row.tariff_series_id IS DISTINCT FROM economics_row.plan_id
     OR order_row.tariff_series_id || '@' || order_row.tariff_version::text
        IS DISTINCT FROM economics_row.plan_version_id
     OR order_row.gross_amount_minor IS DISTINCT FROM economics_row.gross_amount_minor
     OR order_row.gross_currency IS DISTINCT FROM economics_row.gross_currency
     OR order_row.platform_fee_amount_minor IS DISTINCT FROM economics_row.commission_amount_minor
     OR order_row.platform_fee_currency IS DISTINCT FROM economics_row.commission_currency
     OR order_row.astrologer_net_amount_minor IS DISTINCT FROM economics_row.payable_amount_minor
     OR order_row.astrologer_net_currency IS DISTINCT FROM economics_row.payable_currency
     OR order_row.tariff_commission_bps IS DISTINCT FROM economics_row.commission_bps THEN
    RAISE EXCEPTION 'Billing economics authority does not match sealed contract'
      USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_contract_seal';
  END IF;

  IF contract_row.created_at !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{0,8}[1-9])?Z$' THEN
    RAISE EXCEPTION 'Client subscription contract creation instant is not canonical UTC'
      USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_contract_seal';
  END IF;
  PERFORM contract_row.created_at::timestamptz;

  expected_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'accessGrants', contract_row.access_grants,
    'astrologerUserId', contract_row.astrologer_user_id::text,
    'astroDiaryConfig', contract_row.astro_diary_config,
    'billingEconomics', jsonb_build_object(
      'allocationRevision', contract_row.billing_allocation_revision,
      'astrologerUserId', contract_row.billing_astrologer_user_id::text,
      'commission', jsonb_build_object(
        'amountMinor', contract_row.billing_commission_amount_minor,
        'currency', contract_row.billing_commission_currency
      ),
      'commissionBps', contract_row.billing_commission_bps,
      'gross', jsonb_build_object(
        'amountMinor', contract_row.billing_gross_amount_minor,
        'currency', contract_row.billing_gross_currency
      ),
      'orderId', contract_row.billing_order_id,
      'payable', jsonb_build_object(
        'amountMinor', contract_row.billing_payable_amount_minor,
        'currency', contract_row.billing_payable_currency
      ),
      'planId', contract_row.billing_plan_id,
      'planVersionId', contract_row.billing_plan_version_id
    ),
    'cadence', contract_row.cadence,
    'clientUserId', contract_row.client_user_id::text,
    'createdAt', contract_row.created_at,
    'currency', contract_row.currency,
    'deliveryFormats', contract_row.delivery_formats,
    'id', contract_row.id::text,
    'methods', contract_row.methods,
    'modifiers', contract_row.modifiers,
    'orderId', contract_row.order_id::text,
    'priceMinor', contract_row.price_minor,
    'productId', contract_row.product_id::text,
    'productRevision', contract_row.product_revision,
    'relationshipId', contract_row.relationship_id::text,
    'requiredClientData', contract_row.required_client_data
  ));
  IF contract_row.canonical_preimage IS DISTINCT FROM expected_preimage
     OR contract_row.canonical_digest IS DISTINCT FROM
        'sha256:' || encode(digest(expected_preimage, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'Client subscription canonical contract seal is invalid'
      USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_contract_seal';
  END IF;
  RETURN NULL;
END;
$client_subscription_contract_seal$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_contract_seal"
AFTER INSERT ON client_subscription_contracts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_contract_seal();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_client_subscription_graph_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_subscription_graph_integrity$
DECLARE
  checked_subscription_id uuid;
  checked_relationship_id uuid;
  checked_product_id uuid;
  checked_period_id uuid;
  checked_transition_id uuid;
  checked_event_id uuid;
  checked_allowance_period_id uuid;
  head client_subscriptions%ROWTYPE;
  slot client_subscription_slots%ROWTYPE;
  period_row client_subscription_periods%ROWTYPE;
  transition_row client_subscription_transition_receipts%ROWTYPE;
  event_row client_subscription_lifecycle_events%ROWTYPE;
  allowance_row client_subscription_period_allowances%ROWTYPE;
  actual_reserved integer;
  actual_consumed integer;
  period_count integer;
  maximum_sequence integer;
  current_period_sequence integer;
  slot_old_subscription_id uuid;
  slot_new_subscription_id uuid;
  transition_owner_count integer;
  transition_event_count integer;
  transition_primary_event_count integer;
  transition_entitlement_event_count integer;
  allowance_command_valid boolean;
  allowance_command_preimage text;
  allowance_effect_count integer;
BEGIN
  IF TG_TABLE_NAME = 'outbox_events' THEN
    IF TG_OP <> 'DELETE'
       AND NEW.event_type = 'client_subscription.lifecycle_event.dispatch_requested.v1' THEN
      checked_event_id := NEW.aggregate_id;
    ELSIF TG_OP <> 'INSERT'
       AND OLD.event_type = 'client_subscription.lifecycle_event.dispatch_requested.v1' THEN
      checked_event_id := OLD.aggregate_id;
    ELSE
      RETURN NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'client_subscription_contracts' THEN
    IF TG_OP <> 'DELETE' AND (
      SELECT count(*)
        FROM client_subscriptions created_head
        JOIN client_subscription_slots created_slot
          ON created_slot.relationship_id = created_head.relationship_id
         AND created_slot.product_id = created_head.product_id
         AND created_slot.current_subscription_id = created_head.id
        JOIN client_subscription_creation_receipts creation_receipt
          ON creation_receipt.subscription_id = created_head.id
         AND creation_receipt.contract_id = NEW.id
         AND creation_receipt.contract_digest = NEW.canonical_digest
         AND creation_receipt.order_id = NEW.order_id
         AND creation_receipt.relationship_id = NEW.relationship_id
         AND creation_receipt.product_id = NEW.product_id
         AND creation_receipt.result_kind = 'created'
         AND creation_receipt.slot_effect = 'assign'
         AND creation_receipt.result_slot_version = created_slot.version
         AND creation_receipt.result_slot_version = creation_receipt.expected_slot_version + 1
       WHERE created_head.contract_id = NEW.id
         AND created_head.relationship_id = NEW.relationship_id
         AND created_head.product_id = NEW.product_id
         AND created_head.version = 1
         AND created_head.state = 'pending_initial_payment'
    ) <> 1 THEN
      RAISE EXCEPTION 'Sealed subscription contract requires atomic creation graph'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    SELECT id INTO checked_subscription_id
      FROM client_subscriptions
     WHERE contract_id = NEW.id;
  ELSIF TG_TABLE_NAME = 'client_subscription_slots' THEN
    checked_relationship_id := coalesce(NEW.relationship_id, OLD.relationship_id);
    checked_product_id := coalesce(NEW.product_id, OLD.product_id);
    IF TG_OP = 'UPDATE' THEN
      slot_old_subscription_id := OLD.current_subscription_id;
      slot_new_subscription_id := NEW.current_subscription_id;
      IF slot_old_subscription_id IS NOT NULL AND slot_new_subscription_id IS NULL
         AND NOT EXISTS (
           SELECT 1
             FROM client_subscription_transition_receipts release_receipt
             JOIN client_subscriptions released_head
               ON released_head.id = release_receipt.subscription_id
            WHERE release_receipt.subscription_id = slot_old_subscription_id
              AND release_receipt.subscription_version = released_head.version
              AND release_receipt.slot_effect = 'release'
         ) THEN
        RAISE EXCEPTION 'Subscription slot release requires its terminal transition receipt'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF slot_old_subscription_id IS NULL AND slot_new_subscription_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM client_subscription_creation_receipts creation_receipt
            WHERE creation_receipt.subscription_id = slot_new_subscription_id
              AND creation_receipt.relationship_id = NEW.relationship_id
              AND creation_receipt.product_id = NEW.product_id
              AND creation_receipt.result_kind = 'created'
              AND creation_receipt.slot_effect = 'assign'
              AND creation_receipt.result_slot_version = NEW.version
         ) THEN
        RAISE EXCEPTION 'Subscription slot assignment requires its creation receipt'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'client_subscription_creation_receipts' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;
    IF NEW.result_kind = 'created' AND NOT EXISTS (
      SELECT 1
        FROM client_subscriptions created_head
        JOIN client_subscription_contracts created_contract
          ON created_contract.id = created_head.contract_id
        JOIN client_subscription_slots created_slot
          ON created_slot.relationship_id = created_head.relationship_id
         AND created_slot.product_id = created_head.product_id
       WHERE created_head.id = NEW.subscription_id
         AND created_head.relationship_id = NEW.relationship_id
         AND created_head.product_id = NEW.product_id
         AND created_contract.id = NEW.contract_id
         AND created_contract.order_id = NEW.order_id
         AND created_contract.canonical_digest = NEW.contract_digest
         AND created_slot.current_subscription_id = created_head.id
         AND created_slot.version = NEW.result_slot_version
         AND NEW.result = jsonb_build_object(
           'contractDigest', created_contract.canonical_digest,
           'contractId', created_contract.id::text,
           'outcome', 'created',
           'subscriptionId', created_head.id::text
         )
    ) THEN
      RAISE EXCEPTION 'Created subscription receipt does not match contract, head, and slot'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF NEW.result_kind = 'rejected' AND NOT EXISTS (
      SELECT 1
        FROM client_subscription_slots rejected_slot
        JOIN client_astrologer_relationships rejected_relationship
          ON rejected_relationship.id = rejected_slot.relationship_id
         AND rejected_relationship.client_user_id = rejected_slot.client_user_id
         AND rejected_relationship.astrologer_user_id = rejected_slot.astrologer_user_id
        JOIN orders rejected_order
          ON rejected_order.id = NEW.order_id
         AND rejected_order.product_id = rejected_slot.product_id
         AND rejected_order.client_user_id = rejected_slot.client_user_id
         AND rejected_order.astrologer_user_id = rejected_slot.astrologer_user_id
       WHERE rejected_slot.relationship_id = NEW.relationship_id
         AND rejected_slot.product_id = NEW.product_id
         AND rejected_slot.version = NEW.result_slot_version
    ) THEN
      RAISE EXCEPTION 'Rejected subscription receipt does not match order and slot authority'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF NEW.result_kind = 'created' THEN
      checked_subscription_id := NEW.subscription_id;
    END IF;
    checked_relationship_id := NEW.relationship_id;
    checked_product_id := NEW.product_id;
  ELSIF TG_TABLE_NAME IN (
    'client_subscription_command_receipts',
    'client_subscription_event_application_receipts'
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;
    checked_subscription_id := NEW.subscription_id;
    SELECT * INTO head FROM client_subscriptions WHERE id = checked_subscription_id;
    IF NOT FOUND OR NEW.result_version IS DISTINCT FROM head.version THEN
      RAISE EXCEPTION 'Subscription persistence receipt version does not match its head'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF TG_TABLE_NAME = 'client_subscription_command_receipts' THEN
      IF (NEW.result_kind = 'applied' AND NEW.result_version <> NEW.expected_version + 1)
         OR (NEW.result_kind <> 'applied' AND NEW.result_version <> NEW.expected_version) THEN
        RAISE EXCEPTION 'Subscription command receipt does not seal its CAS precondition'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
    IF NEW.result_kind = 'applied' AND NOT EXISTS (
      SELECT 1 FROM client_subscription_transition_receipts applied_transition
       WHERE applied_transition.transition_id = NEW.transition_id
         AND applied_transition.subscription_id = NEW.subscription_id
         AND applied_transition.subscription_version = NEW.result_version
         AND applied_transition.slot_effect = NEW.slot_effect
    ) THEN
      RAISE EXCEPTION 'Applied subscription persistence receipt lacks its exact transition'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
  ELSIF TG_TABLE_NAME = 'client_subscription_allowance_command_receipts' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;
    checked_allowance_period_id := NEW.period_id;
    IF ((NEW.result_kind = 'applied' AND NEW.result_version <> NEW.expected_version + 1)
        OR (NEW.result_kind = 'rejected' AND NEW.result_version <> NEW.expected_version))
       OR NOT EXISTS (
      SELECT 1 FROM client_subscription_period_allowances receipt_allowance
       WHERE receipt_allowance.period_id = NEW.period_id
         AND NEW.result_version = receipt_allowance.version
    ) THEN
      RAISE EXCEPTION 'Allowance receipt version exceeds its allowance head'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    allowance_command_valid := false;
    IF jsonb_typeof(NEW.command) = 'object'
       AND NEW.command->>'occurredAt' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])T([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,9})?Z$'
       AND pg_input_is_valid(NEW.command->>'occurredAt', 'timestamp with time zone') THEN
      IF NEW.command->>'operation' = 'reserve' THEN
        allowance_command_valid := NEW.command = jsonb_build_object(
          'occurredAt', NEW.command->>'occurredAt',
          'operation', 'reserve',
          'reservationId', NEW.command->>'reservationId'
        ) AND NEW.command->>'reservationId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      ELSIF NEW.command->>'operation' = 'consume_available' THEN
        allowance_command_valid := NEW.command = jsonb_build_object(
          'consumptionId', NEW.command->>'consumptionId',
          'occurredAt', NEW.command->>'occurredAt',
          'operation', 'consume_available'
        ) AND NEW.command->>'consumptionId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      ELSIF NEW.command->>'operation' IN ('consume_reserved', 'release_reserved', 'forfeit_reserved') THEN
        allowance_command_valid := NEW.command = jsonb_build_object(
          'occurredAt', NEW.command->>'occurredAt',
          'operation', NEW.command->>'operation',
          'reservationId', NEW.command->>'reservationId'
        ) AND NEW.command->>'reservationId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      ELSIF NEW.command->>'operation' = 'expire_available' THEN
        allowance_command_valid := NEW.command = jsonb_build_object(
          'occurredAt', NEW.command->>'occurredAt',
          'operation', 'expire_available'
        );
      END IF;
    END IF;
    allowance_command_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
      'command', NEW.command,
      'expectedVersion', NEW.expected_version,
      'periodId', NEW.period_id::text
    ));
    IF NOT coalesce(allowance_command_valid, false)
       OR NEW.request_hash IS DISTINCT FROM
          'sha256:' || encode(digest(convert_to(allowance_command_preimage, 'UTF8'), 'sha256'), 'hex') THEN
      RAISE EXCEPTION 'Allowance receipt command or canonical request hash is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    SELECT count(*)::integer INTO allowance_effect_count
      FROM client_subscription_allowance_command_effects receipt_effect
     WHERE receipt_effect.period_id = NEW.period_id
       AND receipt_effect.idempotency_key = NEW.idempotency_key;
    IF (NEW.result_kind = 'applied' AND allowance_effect_count <> 1)
       OR (NEW.result_kind = 'rejected' AND allowance_effect_count <> 0) THEN
      RAISE EXCEPTION 'Allowance receipt and exact command effect cardinality is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    checked_period_id := checked_allowance_period_id;
  ELSIF TG_TABLE_NAME = 'client_subscription_allowance_command_effects' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;
    checked_period_id := NEW.period_id;
    IF NOT EXISTS (
      SELECT 1
        FROM client_subscription_allowance_command_receipts effect_receipt
        JOIN client_subscription_period_allowances effect_allowance
          ON effect_allowance.period_id = effect_receipt.period_id
       WHERE effect_receipt.period_id = NEW.period_id
         AND effect_receipt.idempotency_key = NEW.idempotency_key
         AND effect_receipt.result_kind = 'applied'
         AND effect_receipt.expected_version = NEW.before_version
         AND effect_receipt.result_version = NEW.after_version
         AND effect_receipt.command->>'operation' = NEW.operation
         AND CASE
           WHEN pg_input_is_valid(effect_receipt.command->>'occurredAt', 'timestamp with time zone')
             THEN (effect_receipt.command->>'occurredAt')::timestamptz = NEW.occurred_at
           ELSE false
         END
         AND (
           (NEW.operation = 'reserve'
             AND effect_receipt.command->>'reservationId' = NEW.reservation_id::text)
           OR (NEW.operation = 'consume_available'
             AND effect_receipt.command->>'consumptionId' = NEW.consumption_id::text)
           OR (NEW.operation IN ('consume_reserved', 'release_reserved', 'forfeit_reserved')
             AND effect_receipt.command->>'reservationId' = NEW.reservation_id::text)
           OR NEW.operation = 'expire_available'
         )
         AND effect_allowance.version = NEW.after_version
         AND effect_allowance.available = NEW.after_available
         AND effect_allowance.reserved = NEW.after_reserved
         AND effect_allowance.consumed = NEW.after_consumed
         AND effect_allowance.released = NEW.after_released
         AND (
           (NEW.operation IN ('reserve', 'consume_available')
             AND NEW.occurred_at < effect_allowance.ends_at)
           OR (NEW.operation = 'release_reserved'
             AND (
               (NEW.after_available = NEW.before_available + 1
                 AND NEW.occurred_at < effect_allowance.ends_at)
               OR (NEW.after_released = NEW.before_released + 1
                 AND NEW.occurred_at >= effect_allowance.ends_at)
             ))
           OR (NEW.operation = 'expire_available'
             AND NEW.occurred_at >= effect_allowance.ends_at)
           OR NEW.operation IN ('consume_reserved', 'forfeit_reserved')
         )
    ) THEN
      RAISE EXCEPTION 'Allowance command effect does not match canonical receipt command'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF (NEW.operation = 'reserve' AND NOT EXISTS (
          SELECT 1 FROM client_subscription_allowance_reservations reservation
           WHERE reservation.id = NEW.reservation_id
             AND reservation.period_id = NEW.period_id
             AND reservation.state = 'reserved'
             AND reservation.reserved_at = NEW.occurred_at
        ))
       OR (NEW.operation = 'consume_available' AND NOT EXISTS (
          SELECT 1 FROM client_subscription_allowance_consumptions consumption
           WHERE consumption.id = NEW.consumption_id
             AND consumption.period_id = NEW.period_id
             AND consumption.source = 'available'
             AND consumption.reservation_id IS NULL
             AND consumption.consumed_at = NEW.occurred_at
        ))
       OR (NEW.operation = 'consume_reserved' AND NOT EXISTS (
          SELECT 1
            FROM client_subscription_allowance_reservations reservation
            JOIN client_subscription_allowance_consumptions consumption
              ON consumption.id = reservation.id
             AND consumption.reservation_id = reservation.id
             AND consumption.period_id = reservation.period_id
             AND consumption.subscription_id = reservation.subscription_id
           WHERE reservation.id = NEW.reservation_id
             AND reservation.period_id = NEW.period_id
             AND reservation.state = 'consumed'
             AND reservation.consumed_at = NEW.occurred_at
             AND consumption.source = 'reservation'
             AND consumption.consumed_at = NEW.occurred_at
        ))
       OR (NEW.operation IN ('release_reserved', 'forfeit_reserved') AND NOT EXISTS (
          SELECT 1 FROM client_subscription_allowance_reservations reservation
           WHERE reservation.id = NEW.reservation_id
             AND reservation.period_id = NEW.period_id
             AND reservation.state = 'released'
             AND reservation.released_at = NEW.occurred_at
        )) THEN
      RAISE EXCEPTION 'Allowance command did not persist its exact reservation or consumption fact'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
  ELSIF TG_TABLE_NAME = 'client_subscriptions' THEN
    checked_subscription_id := coalesce(NEW.id, OLD.id);
    IF TG_OP = 'INSERT' AND NOT EXISTS (
      SELECT 1 FROM client_subscription_creation_receipts head_creation
       WHERE head_creation.subscription_id = NEW.id
         AND head_creation.contract_id = NEW.contract_id
         AND head_creation.relationship_id = NEW.relationship_id
         AND head_creation.product_id = NEW.product_id
         AND head_creation.result_kind = 'created'
    ) THEN
      RAISE EXCEPTION 'Subscription head creation requires its exact creation receipt'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    ELSIF TG_OP = 'UPDATE' AND NOT EXISTS (
      SELECT 1 FROM client_subscription_transition_receipts head_transition
       WHERE head_transition.subscription_id = NEW.id
         AND head_transition.contract_id = NEW.contract_id
         AND head_transition.relationship_id = NEW.relationship_id
         AND head_transition.journal_epoch_id = NEW.journal_epoch_id
         AND head_transition.subscription_version = NEW.version
         AND head_transition.state = NEW.state
    ) THEN
      RAISE EXCEPTION 'Subscription head mutation requires its exact transition receipt'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
  ELSIF TG_TABLE_NAME IN (
    'client_subscription_renewal_requests',
    'client_subscription_periods',
    'client_subscription_transition_receipts',
    'client_entitlement_grants',
    'client_entitlement_transition_applications'
  ) THEN
    checked_subscription_id := coalesce(NEW.subscription_id, OLD.subscription_id);
    IF TG_TABLE_NAME = 'client_entitlement_grants' THEN
      IF TG_OP = 'INSERT' AND NOT EXISTS (
           SELECT 1
             FROM client_entitlement_transition_effects grant_effect
             JOIN client_entitlement_transition_applications grant_application
               ON grant_application.id = grant_effect.application_id
              AND grant_application.subscription_id = grant_effect.subscription_id
            WHERE grant_effect.grant_id = NEW.id
              AND grant_effect.subscription_id = NEW.subscription_id
              AND grant_effect.before_version IS NULL
              AND grant_effect.before_state IS NULL
              AND grant_effect.after_version = NEW.version
              AND grant_effect.after_state = NEW.state
              AND grant_application.transition_id = NEW.source_transition_id
              AND grant_application.subscription_version = NEW.source_subscription_version
         ) THEN
        RAISE EXCEPTION 'Entitlement grant creation requires its exact transition effect'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      ELSIF TG_OP = 'UPDATE' AND NOT EXISTS (
           SELECT 1
             FROM client_entitlement_transition_effects grant_effect
             JOIN client_entitlement_transition_applications grant_application
               ON grant_application.id = grant_effect.application_id
              AND grant_application.subscription_id = grant_effect.subscription_id
            WHERE grant_effect.grant_id = NEW.id
              AND grant_effect.subscription_id = NEW.subscription_id
              AND grant_effect.before_version = OLD.version
              AND grant_effect.before_state = OLD.state
              AND grant_effect.after_version = NEW.version
              AND grant_effect.after_state = NEW.state
              AND grant_application.transition_id = NEW.source_transition_id
              AND grant_application.subscription_version = NEW.source_subscription_version
         ) THEN
        RAISE EXCEPTION 'Entitlement grant mutation requires its exact transition effect'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN (
    'client_subscription_period_allowances',
    'client_subscription_allowance_reservations',
    'client_subscription_allowance_consumptions'
  ) THEN
    checked_period_id := coalesce(NEW.period_id, OLD.period_id);
    IF TG_TABLE_NAME = 'client_subscription_period_allowances' THEN
      IF TG_OP = 'UPDATE' AND NOT EXISTS (
           SELECT 1
             FROM client_subscription_allowance_command_effects applied_effect
             JOIN client_subscription_allowance_command_receipts applied_receipt
               ON applied_receipt.period_id = applied_effect.period_id
              AND applied_receipt.idempotency_key = applied_effect.idempotency_key
            WHERE applied_effect.period_id = NEW.period_id
              AND applied_effect.before_version = OLD.version
              AND applied_effect.before_available = OLD.available
              AND applied_effect.before_reserved = OLD.reserved
              AND applied_effect.before_consumed = OLD.consumed
              AND applied_effect.before_released = OLD.released
              AND applied_effect.after_version = NEW.version
              AND applied_effect.after_available = NEW.available
              AND applied_effect.after_reserved = NEW.reserved
              AND applied_effect.after_consumed = NEW.consumed
              AND applied_effect.after_released = NEW.released
              AND applied_receipt.result_kind = 'applied'
              AND applied_receipt.expected_version = OLD.version
              AND applied_receipt.result_version = NEW.version
         ) THEN
        RAISE EXCEPTION 'Allowance update requires its exact applied command effect'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'client_subscription_lifecycle_events' THEN
    checked_event_id := coalesce(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'client_entitlement_transition_effects' THEN
    SELECT transition_id INTO checked_transition_id
      FROM client_entitlement_transition_applications
     WHERE id = coalesce(NEW.application_id, OLD.application_id);
  END IF;

  IF checked_event_id IS NOT NULL THEN
    SELECT * INTO event_row
      FROM client_subscription_lifecycle_events
     WHERE id = checked_event_id;
    IF NOT FOUND THEN
      IF EXISTS (
        SELECT 1 FROM outbox_events
         WHERE event_type = 'client_subscription.lifecycle_event.dispatch_requested.v1'
           AND aggregate_id = checked_event_id
      ) THEN
        RAISE EXCEPTION 'Subscription lifecycle outbox references a missing event'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      RETURN NULL;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM outbox_events
       WHERE event_type = 'client_subscription.lifecycle_event.dispatch_requested.v1'
         AND aggregate_id = event_row.id
         AND payload = jsonb_build_object(
           'schemaVersion', 'client-subscription-lifecycle-event-dispatch-request.v1',
           'lifecycleEventId', event_row.id::text
         )
    ) THEN
      RAISE EXCEPTION 'Subscription lifecycle event requires one IDs-only outbox dispatch'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    checked_transition_id := event_row.transition_id;
    checked_subscription_id := event_row.subscription_id;
  END IF;

  IF checked_transition_id IS NOT NULL THEN
    SELECT * INTO transition_row
      FROM client_subscription_transition_receipts
     WHERE transition_id = checked_transition_id;
    IF FOUND THEN
      checked_subscription_id := transition_row.subscription_id;
      IF checked_event_id IS NOT NULL
         AND event_row.occurred_at IS DISTINCT FROM transition_row.occurred_at THEN
        RAISE EXCEPTION 'Subscription lifecycle event occurrence must match its transition'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF checked_event_id IS NOT NULL AND (
        (event_row.event_type IN (
          'client_subscription.activated.v1',
          'client_subscription.period_renewed.v1',
          'client_subscription.cancellation_scheduled.v1',
          'client_subscription.cancellation_revoked.v1',
          'client_subscription.period_ended.v1'
        ) AND event_row.data->>'periodId' IS DISTINCT FROM transition_row.period_id::text)
        OR (event_row.event_type = 'client_subscription.entitlement_changed.v1' AND (
          event_row.data->>'scope' IS DISTINCT FROM transition_row.entitlement_scope
          OR event_row.data->>'relationshipId' IS DISTINCT FROM transition_row.relationship_id::text
          OR event_row.data->>'journalEpochId' IS DISTINCT FROM transition_row.journal_epoch_id::text
          OR (transition_row.entitlement_scope = 'period'
              AND event_row.data->>'periodId' IS DISTINCT FROM transition_row.period_id::text)
        ))
        OR (event_row.event_type = 'client_subscription.renewal_charge_requested.v1' AND NOT EXISTS (
          SELECT 1 FROM client_subscription_renewal_requests event_request
           WHERE event_request.id::text = event_row.data->>'renewalRequestId'
             AND event_request.subscription_id = transition_row.subscription_id
             AND event_request.source_period_id::text = event_row.data->>'sourcePeriodId'
             AND event_request.intended_period_id::text = event_row.data->>'intendedPeriodId'
        ))
        OR (event_row.event_type = 'client_subscription.renewal_failed.v1' AND (
          NOT EXISTS (
            SELECT 1 FROM client_subscription_renewal_requests failed_request
             WHERE failed_request.id::text = event_row.data->>'renewalRequestId'
               AND failed_request.subscription_id = transition_row.subscription_id
               AND failed_request.intended_period_id::text = event_row.data->>'intendedPeriodId'
          )
          OR NOT EXISTS (
            SELECT 1 FROM client_subscription_event_application_receipts failed_application
             WHERE failed_application.transition_id = transition_row.transition_id
               AND failed_application.evidence_id::text = event_row.data->>'renewalAttemptId'
          )
        ))
        OR (event_row.event_type IN (
          'client_subscription.initial_payment_ended.v1',
          'client_subscription.revoked.v1'
        ) AND NOT EXISTS (
          SELECT 1 FROM client_subscription_event_application_receipts finance_application
           WHERE finance_application.transition_id = transition_row.transition_id
             AND finance_application.evidence_id::text = event_row.data->>'financeEvidenceId'
        ))
        OR (event_row.event_type = 'client_subscription.revoked.v1' AND NOT EXISTS (
          SELECT 1 FROM client_subscription_periods revoked_period
           WHERE revoked_period.id::text = event_row.data->>'periodId'
             AND revoked_period.subscription_id = transition_row.subscription_id
        ))
      ) THEN
        RAISE EXCEPTION 'Subscription lifecycle event data does not match persisted facts'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  END IF;

  IF checked_period_id IS NOT NULL THEN
    SELECT * INTO period_row
      FROM client_subscription_periods
     WHERE id = checked_period_id;
    IF FOUND THEN
      checked_subscription_id := period_row.subscription_id;
    END IF;
  END IF;

  IF checked_subscription_id IS NOT NULL THEN
    SELECT * INTO head
      FROM client_subscriptions
     WHERE id = checked_subscription_id
       FOR KEY SHARE;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    checked_relationship_id := head.relationship_id;
    checked_product_id := head.product_id;

    IF head.renewal_request_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM client_subscription_renewal_requests request
       WHERE request.id = head.renewal_request_id
         AND request.subscription_id = head.id
    ) THEN
      RAISE EXCEPTION 'Subscription open renewal pointer is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF head.state = 'revoked' AND head.renewal_request_id IS NOT NULL THEN
      RAISE EXCEPTION 'Revoked subscription cannot retain an open renewal request'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF head.current_period_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM client_subscription_periods period
       WHERE period.id = head.current_period_id AND period.subscription_id = head.id
    ) THEN
      RAISE EXCEPTION 'Subscription current period pointer is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF head.future_period_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM client_subscription_periods future_period
        JOIN client_subscription_periods current_period
          ON current_period.id = head.current_period_id
         AND current_period.subscription_id = head.id
       WHERE future_period.id = head.future_period_id
         AND future_period.subscription_id = head.id
         AND future_period.sequence = current_period.sequence + 1
         AND future_period.starts_at = current_period.ends_at
    ) THEN
      RAISE EXCEPTION 'Subscription future period must be the sole contiguous successor'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    SELECT count(*)::integer, coalesce(max(sequence), 0)::integer
      INTO period_count, maximum_sequence
      FROM client_subscription_periods
     WHERE subscription_id = head.id;
    IF period_count <> maximum_sequence THEN
      RAISE EXCEPTION 'Subscription paid period sequence must be contiguous from one'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF head.state = 'pending_initial_payment' AND period_count <> 0 THEN
      RAISE EXCEPTION 'Pending subscription cannot already contain paid periods'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF head.current_period_id IS NOT NULL THEN
      SELECT sequence INTO current_period_sequence
        FROM client_subscription_periods
       WHERE id = head.current_period_id AND subscription_id = head.id;
      IF head.future_period_id IS NULL AND current_period_sequence <> maximum_sequence THEN
        RAISE EXCEPTION 'Subscription current period must be the latest non-future period'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF head.future_period_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM client_subscription_periods exact_future
         WHERE exact_future.id = head.future_period_id
           AND exact_future.subscription_id = head.id
           AND exact_future.sequence = current_period_sequence + 1
           AND exact_future.sequence = maximum_sequence
      ) THEN
        RAISE EXCEPTION 'Subscription future period pointer must cover the sole successor'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  END IF;

  IF checked_relationship_id IS NOT NULL AND checked_product_id IS NOT NULL THEN
    SELECT * INTO slot
      FROM client_subscription_slots
     WHERE relationship_id = checked_relationship_id
       AND product_id = checked_product_id
       FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Subscription head requires a relationship-product CAS slot'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    SELECT * INTO head
      FROM client_subscriptions
     WHERE relationship_id = checked_relationship_id
       AND product_id = checked_product_id
       AND (state IN ('pending_initial_payment', 'active', 'cancel_at_period_end') OR renewal_request_id IS NOT NULL);
    IF FOUND AND slot.current_subscription_id IS DISTINCT FROM head.id THEN
      RAISE EXCEPTION 'Subscription slot current pointer does not match the occupying head'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF NOT FOUND AND slot.current_subscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'Subscription slot retains a terminal head without an open renewal request'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF slot.current_subscription_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM client_subscriptions current_head
       WHERE current_head.id = slot.current_subscription_id
         AND current_head.relationship_id = slot.relationship_id
         AND current_head.product_id = slot.product_id
    ) THEN
      RAISE EXCEPTION 'Subscription slot points outside its exact relationship-product scope'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
  END IF;

  IF checked_period_id IS NOT NULL THEN
    SELECT * INTO period_row FROM client_subscription_periods WHERE id = checked_period_id;
    IF FOUND THEN
      IF NOT EXISTS (
        SELECT 1
          FROM client_subscription_periods origin_period
          JOIN client_subscription_contracts contract
            ON contract.id = period_row.contract_id
           AND contract.id = origin_period.contract_id
         WHERE origin_period.subscription_id = period_row.subscription_id
           AND origin_period.sequence = period_row.anchor_origin_sequence
           AND origin_period.anchor_origin_sequence = origin_period.sequence
           AND origin_period.anchor_captured_at = origin_period.starts_at
           AND origin_period.anchor_captured_at = period_row.anchor_captured_at
           AND origin_period.anchor_service_timezone = period_row.anchor_service_timezone
           AND origin_period.anchor_local_date_time = period_row.anchor_local_date_time
           AND period_row.anchor_service_timezone = contract.astro_diary_config->>'serviceTimezone'
           AND (
             (period_row.sequence = origin_period.sequence
               AND period_row.starts_at = origin_period.starts_at
               AND period_row.resolved_start_local = origin_period.anchor_local_date_time)
             OR (period_row.sequence > origin_period.sequence AND EXISTS (
               SELECT 1 FROM client_subscription_periods predecessor
                WHERE predecessor.subscription_id = period_row.subscription_id
                  AND predecessor.contract_id = period_row.contract_id
                  AND predecessor.sequence = period_row.sequence - 1
                  AND predecessor.ends_at = period_row.starts_at
                  AND predecessor.resolved_end_local = period_row.resolved_start_local
                  AND predecessor.anchor_origin_sequence = period_row.anchor_origin_sequence
                  AND predecessor.anchor_captured_at = period_row.anchor_captured_at
                  AND predecessor.anchor_service_timezone = period_row.anchor_service_timezone
                  AND predecessor.anchor_local_date_time = period_row.anchor_local_date_time
             ))
           )
           AND period_row.resolved_end_local::timestamp = CASE
             WHEN contract.cadence = 'week' THEN
               origin_period.anchor_local_date_time::timestamp
                 + make_interval(days => 7 * (period_row.sequence - origin_period.sequence + 1))
             WHEN contract.cadence = 'month' THEN
               origin_period.anchor_local_date_time::timestamp
                 + make_interval(months => period_row.sequence - origin_period.sequence + 1)
             WHEN contract.cadence = 'year' THEN
               origin_period.anchor_local_date_time::timestamp
                 + make_interval(years => period_row.sequence - origin_period.sequence + 1)
           END
      ) THEN
        RAISE EXCEPTION 'Subscription period original anchor or cadence chain is invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_timezone_names
         WHERE name = period_row.anchor_service_timezone
      )
      OR period_row.anchor_local_date_time::timestamp IS DISTINCT FROM
         period_row.anchor_captured_at AT TIME ZONE period_row.anchor_service_timezone
      OR period_row.resolved_start_local::timestamp IS DISTINCT FROM
         period_row.starts_at AT TIME ZONE period_row.anchor_service_timezone
      OR period_row.resolved_end_local::timestamp IS DISTINCT FROM
         period_row.ends_at AT TIME ZONE period_row.anchor_service_timezone
      OR (period_row.resolved_start_local || period_row.resolved_start_offset)::timestamptz
         IS DISTINCT FROM period_row.starts_at
      OR (period_row.resolved_end_local || period_row.resolved_end_offset)::timestamptz
         IS DISTINCT FROM period_row.ends_at THEN
        RAISE EXCEPTION 'Subscription period timezone evidence is invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      SELECT * INTO allowance_row
        FROM client_subscription_period_allowances
       WHERE period_id = period_row.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Paid subscription period requires its exact initial allowance'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF TG_TABLE_NAME = 'client_subscription_periods'
         AND TG_OP = 'INSERT'
         AND (
           allowance_row.version <> 1
           OR allowance_row.available <> allowance_row.total
           OR allowance_row.reserved <> 0
           OR allowance_row.consumed <> 0
           OR allowance_row.released <> 0
         ) THEN
        RAISE EXCEPTION 'Paid subscription period requires its exact initial allowance'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF NOT EXISTS (
        SELECT 1
          FROM client_subscription_event_application_receipts capture_application
          JOIN client_subscription_transition_receipts capture_transition
            ON capture_transition.transition_id = capture_application.transition_id
           AND capture_transition.subscription_id = capture_application.subscription_id
           AND capture_transition.subscription_version = capture_application.result_version
          JOIN client_subscription_lifecycle_events capture_event
            ON capture_event.transition_id = capture_transition.transition_id
           AND capture_event.subscription_id = capture_transition.subscription_id
           AND capture_event.subscription_version = capture_transition.subscription_version
         WHERE capture_application.result_kind = 'applied'
           AND capture_application.subscription_id = period_row.subscription_id
           AND capture_application.evidence_id = period_row.capture_evidence_id
           AND capture_transition.period_id = period_row.id
           AND capture_transition.contract_id = period_row.contract_id
           AND capture_transition.entitlement_scope = 'period'
           AND capture_event.event_type IN (
             'client_subscription.activated.v1',
             'client_subscription.period_renewed.v1'
           )
      ) THEN
        RAISE EXCEPTION 'Paid subscription period requires applied capture evidence'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF allowance_row.period_id IS NOT NULL THEN
        SELECT count(*) FILTER (WHERE state = 'reserved')::integer
          INTO actual_reserved
          FROM client_subscription_allowance_reservations
         WHERE period_id = allowance_row.period_id;
        SELECT count(*)::integer INTO actual_consumed
          FROM client_subscription_allowance_consumptions
         WHERE period_id = allowance_row.period_id;
        IF actual_reserved IS DISTINCT FROM allowance_row.reserved
           OR actual_consumed IS DISTINCT FROM allowance_row.consumed
           OR allowance_row.available + allowance_row.reserved + allowance_row.consumed + allowance_row.released
              IS DISTINCT FROM allowance_row.total
           OR allowance_row.total IS DISTINCT FROM (
             SELECT (contract.astro_diary_config->>'reflectionCyclesPerPeriod')::integer
               FROM client_subscription_contracts contract
              WHERE contract.id = period_row.contract_id
           ) THEN
          RAISE EXCEPTION 'Subscription allowance rows do not match normalized bucket facts'
            USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
        END IF;
        IF EXISTS (
          SELECT 1 FROM client_subscription_allowance_reservations reservation
           WHERE reservation.period_id = allowance_row.period_id
             AND (
               (reservation.state = 'consumed' AND NOT EXISTS (
                 SELECT 1 FROM client_subscription_allowance_consumptions consumption
                  WHERE consumption.reservation_id = reservation.id
                    AND consumption.period_id = reservation.period_id
                    AND consumption.subscription_id = reservation.subscription_id
                    AND consumption.source = 'reservation'
               ))
               OR (reservation.state <> 'consumed' AND EXISTS (
                 SELECT 1 FROM client_subscription_allowance_consumptions consumption
                  WHERE consumption.reservation_id = reservation.id
               ))
             )
        ) THEN
          RAISE EXCEPTION 'Reservation consumption facts are inconsistent'
            USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
        END IF;
      END IF;
    END IF;
  END IF;

  FOR transition_row IN
    SELECT receipt.*
      FROM client_subscription_transition_receipts receipt
     WHERE checked_subscription_id IS NOT NULL
       AND receipt.subscription_id = checked_subscription_id
  LOOP
    SELECT count(*)::integer INTO transition_owner_count
      FROM (
        SELECT command_owner.subscription_id
          FROM client_subscription_command_receipts command_owner
         WHERE command_owner.result_kind = 'applied'
           AND command_owner.transition_id = transition_row.transition_id
           AND command_owner.subscription_id = transition_row.subscription_id
           AND command_owner.result_version = transition_row.subscription_version
        UNION ALL
        SELECT source_owner.subscription_id
          FROM client_subscription_event_application_receipts source_owner
         WHERE source_owner.result_kind = 'applied'
           AND source_owner.transition_id = transition_row.transition_id
           AND source_owner.subscription_id = transition_row.subscription_id
           AND source_owner.result_version = transition_row.subscription_version
      ) persistence_owners;
    IF transition_owner_count <> 1 THEN
      RAISE EXCEPTION 'Subscription transition requires exactly one persistence owner'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    SELECT
      count(*)::integer,
      count(*) FILTER (WHERE event.event_type = transition_row.primary_event_type)::integer,
      count(*) FILTER (WHERE event.event_type = 'client_subscription.entitlement_changed.v1')::integer
      INTO transition_event_count, transition_primary_event_count, transition_entitlement_event_count
      FROM client_subscription_lifecycle_events event
     WHERE event.transition_id = transition_row.transition_id
       AND event.subscription_id = transition_row.subscription_id
       AND event.subscription_version = transition_row.subscription_version;
    IF transition_primary_event_count <> 1
       OR (
         transition_row.primary_event_type IN (
           'client_subscription.activated.v1',
           'client_subscription.period_renewed.v1',
           'client_subscription.period_ended.v1',
           'client_subscription.revoked.v1'
         )
         AND (transition_event_count <> 2 OR transition_entitlement_event_count <> 1)
       )
       OR (
         transition_row.primary_event_type NOT IN (
           'client_subscription.activated.v1',
           'client_subscription.period_renewed.v1',
           'client_subscription.period_ended.v1',
           'client_subscription.revoked.v1'
         )
         AND (transition_event_count <> 1 OR transition_entitlement_event_count <> 0)
       )
       OR EXISTS (
         SELECT 1 FROM client_subscription_lifecycle_events event
          WHERE event.transition_id = transition_row.transition_id
            AND event.event_type NOT IN (
              transition_row.primary_event_type,
              'client_subscription.entitlement_changed.v1'
            )
       )
       OR EXISTS (
         SELECT 1 FROM client_subscription_lifecycle_events event
          WHERE event.transition_id = transition_row.transition_id
            AND event.occurred_at IS DISTINCT FROM transition_row.occurred_at
       ) THEN
      RAISE EXCEPTION 'Subscription transition lifecycle output set is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM client_subscription_lifecycle_events event
       WHERE event.transition_id = transition_row.transition_id
    ) THEN
      RAISE EXCEPTION 'Applied subscription transition requires lifecycle output facts'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.entitlement_scope = 'none' AND EXISTS (
      SELECT 1 FROM client_entitlement_transition_applications application
       WHERE application.transition_id = transition_row.transition_id
    ) THEN
      RAISE EXCEPTION 'Entitlement-none transition cannot produce entitlement effects'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.entitlement_scope <> 'none' AND NOT EXISTS (
      SELECT 1 FROM client_entitlement_transition_applications application
       WHERE application.transition_id = transition_row.transition_id
         AND application.subscription_id = transition_row.subscription_id
         AND application.subscription_version = transition_row.subscription_version
         AND application.scope = transition_row.entitlement_scope
    ) THEN
      RAISE EXCEPTION 'Subscription transition requires its atomic entitlement application'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.entitlement_scope = 'period' AND (
      SELECT count(*)
        FROM client_entitlement_transition_applications application
        JOIN client_entitlement_transition_effects effect
          ON effect.application_id = application.id
         AND effect.subscription_id = application.subscription_id
        JOIN client_entitlement_grants grant_row
          ON grant_row.id = effect.grant_id
         AND grant_row.subscription_id = effect.subscription_id
       WHERE application.transition_id = transition_row.transition_id
         AND grant_row.period_id = transition_row.period_id
         AND effect.after_state = transition_row.entitlement_state
    ) <> 1 OR transition_row.entitlement_scope = 'period' AND (
      SELECT count(*)
        FROM client_entitlement_transition_applications application
        JOIN client_entitlement_transition_effects effect
          ON effect.application_id = application.id
         AND effect.subscription_id = application.subscription_id
       WHERE application.transition_id = transition_row.transition_id
    ) <> 1 THEN
      RAISE EXCEPTION 'Period entitlement transition effect set is not exact'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.entitlement_scope = 'subscription_all' AND EXISTS (
        SELECT 1 FROM client_entitlement_grants grant_row
         WHERE grant_row.subscription_id = transition_row.subscription_id
           AND grant_row.state = 'active'
    ) THEN
      RAISE EXCEPTION 'Subscription-all revocation must close every current or future grant'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.entitlement_scope = 'subscription_all' AND EXISTS (
      SELECT 1
        FROM client_entitlement_transition_applications application
        JOIN client_entitlement_transition_effects effect
          ON effect.application_id = application.id
         AND effect.subscription_id = application.subscription_id
        JOIN client_entitlement_grants grant_row
          ON grant_row.id = effect.grant_id
         AND grant_row.subscription_id = effect.subscription_id
       WHERE application.transition_id = transition_row.transition_id
         AND (
           effect.before_version IS NULL
           OR effect.before_state IS DISTINCT FROM 'active'
           OR effect.after_version <> effect.before_version + 1
           OR effect.after_state <> 'revoked'
           OR grant_row.state <> 'revoked'
           OR grant_row.version <> effect.after_version
           OR grant_row.source_transition_id <> transition_row.transition_id
           OR grant_row.source_subscription_version <> transition_row.subscription_version
         )
    ) THEN
      RAISE EXCEPTION 'Subscription-all revocation effect set is not exact'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.subscription_version = (
      SELECT version FROM client_subscriptions WHERE id = transition_row.subscription_id
    ) THEN
      IF transition_row.slot_effect = 'release' AND EXISTS (
        SELECT 1 FROM client_subscription_slots release_slot
         WHERE release_slot.relationship_id = transition_row.relationship_id
           AND release_slot.product_id = (
             SELECT product_id FROM client_subscriptions WHERE id = transition_row.subscription_id
           )
           AND release_slot.current_subscription_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Released subscription transition must atomically clear its CAS slot'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF transition_row.slot_effect = 'retain' AND NOT EXISTS (
        SELECT 1 FROM client_subscription_slots retained_slot
         WHERE retained_slot.relationship_id = transition_row.relationship_id
           AND retained_slot.product_id = (
             SELECT product_id FROM client_subscriptions WHERE id = transition_row.subscription_id
           )
           AND retained_slot.current_subscription_id = transition_row.subscription_id
      ) THEN
        RAISE EXCEPTION 'Retained subscription transition must keep its CAS slot pointer'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$client_subscription_graph_integrity$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_contracts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_slots
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscriptions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_renewal_requests
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_periods
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_period_allowances
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_allowance_reservations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_allowance_consumptions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_transition_receipts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_lifecycle_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_creation_receipts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_command_receipts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_event_application_receipts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_allowance_command_receipts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_subscription_allowance_command_effects
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_entitlement_transition_applications
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_entitlement_transition_effects
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON client_entitlement_grants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "client_subscription_graph_integrity"
AFTER INSERT OR UPDATE OR DELETE ON outbox_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_client_subscription_graph_integrity();
