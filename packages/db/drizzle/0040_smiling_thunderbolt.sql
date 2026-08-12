CREATE TABLE "astro_diary_ai_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"command_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"state" text NOT NULL,
	"requested_model" varchar(120) NOT NULL,
	"observed_model" varchar(120),
	"input_digest" varchar(71) NOT NULL,
	"output_digest" varchar(71),
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"failure_code" varchar(160),
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "astro_diary_ai_attempts_command_stage_unique" UNIQUE("command_id","stage"),
	CONSTRAINT "astro_diary_ai_attempts_stage_check" CHECK ("astro_diary_ai_attempts"."stage" in ('generation', 'review_refine')),
	CONSTRAINT "astro_diary_ai_attempts_digest_check" CHECK ("astro_diary_ai_attempts"."input_digest" ~ '^sha256:[a-f0-9]{64}$'
        and ("astro_diary_ai_attempts"."output_digest" is null or "astro_diary_ai_attempts"."output_digest" ~ '^sha256:[a-f0-9]{64}$')),
	CONSTRAINT "astro_diary_ai_attempts_usage_check" CHECK (("astro_diary_ai_attempts"."input_tokens" is null or "astro_diary_ai_attempts"."input_tokens" >= 0)
        and ("astro_diary_ai_attempts"."output_tokens" is null or "astro_diary_ai_attempts"."output_tokens" >= 0)
        and ("astro_diary_ai_attempts"."latency_ms" is null or "astro_diary_ai_attempts"."latency_ms" >= 0)),
	CONSTRAINT "astro_diary_ai_attempts_state_check" CHECK ((
        "astro_diary_ai_attempts"."state" = 'processing' and "astro_diary_ai_attempts"."completed_at" is null
        and "astro_diary_ai_attempts"."output_digest" is null and "astro_diary_ai_attempts"."failure_code" is null
      ) or (
        "astro_diary_ai_attempts"."state" = 'succeeded' and "astro_diary_ai_attempts"."completed_at" is not null
        and "astro_diary_ai_attempts"."observed_model" is not null and "astro_diary_ai_attempts"."output_digest" is not null
        and "astro_diary_ai_attempts"."failure_code" is null
      ) or (
        "astro_diary_ai_attempts"."state" in ('known_failed', 'outcome_unknown', 'source_stale', 'cancelled')
        and "astro_diary_ai_attempts"."completed_at" is not null
        and length(trim("astro_diary_ai_attempts"."failure_code")) between 1 and 160
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_ai_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"state" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"source_item_id" uuid NOT NULL,
	"source_item_revision" integer NOT NULL,
	"source_digest" varchar(71) NOT NULL,
	"prompt_version" varchar(200) NOT NULL,
	"requested_model" varchar(120) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"claim_fence" bigint DEFAULT 0 NOT NULL,
	"lease_owner" varchar(200),
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"last_failure_code" varchar(160),
	"quarantined_at" timestamp with time zone,
	"quarantine_reason_code" varchar(160),
	"failure_code" varchar(160),
	"created_at" timestamp with time zone NOT NULL,
	"processing_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "astro_diary_ai_commands_journal_key_unique" UNIQUE("journal_id","idempotency_key"),
	CONSTRAINT "astro_diary_ai_commands_operation_check" CHECK ("astro_diary_ai_commands"."operation" in ('question_draft', 'reply_draft')),
	CONSTRAINT "astro_diary_ai_commands_digest_check" CHECK ("astro_diary_ai_commands"."source_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "astro_diary_ai_commands_state_check" CHECK ((
        "astro_diary_ai_commands"."state" = 'pending'
        and "astro_diary_ai_commands"."processing_started_at" is null and "astro_diary_ai_commands"."completed_at" is null
        and "astro_diary_ai_commands"."failure_code" is null
      ) or (
        "astro_diary_ai_commands"."state" = 'processing'
        and "astro_diary_ai_commands"."processing_started_at" is not null and "astro_diary_ai_commands"."completed_at" is null
        and "astro_diary_ai_commands"."failure_code" is null
      ) or (
        "astro_diary_ai_commands"."state" = 'succeeded'
        and "astro_diary_ai_commands"."processing_started_at" is not null and "astro_diary_ai_commands"."completed_at" is not null
        and "astro_diary_ai_commands"."failure_code" is null
      ) or (
        "astro_diary_ai_commands"."state" in ('known_failed', 'outcome_unknown', 'source_stale', 'cancelled', 'quarantined')
        and "astro_diary_ai_commands"."completed_at" is not null
        and length(trim("astro_diary_ai_commands"."failure_code")) between 1 and 160
      )),
	CONSTRAINT "astro_diary_ai_commands_work_authority_check" CHECK ("astro_diary_ai_commands"."attempts" between 0 and "astro_diary_ai_commands"."max_attempts"
      and "astro_diary_ai_commands"."max_attempts" between 1 and 20
      and "astro_diary_ai_commands"."claim_fence" >= "astro_diary_ai_commands"."attempts"
      and (("astro_diary_ai_commands"."lease_owner" is null) = ("astro_diary_ai_commands"."lease_expires_at" is null))
      and ("astro_diary_ai_commands"."lease_owner" is null or length(trim("astro_diary_ai_commands"."lease_owner")) between 1 and 200)
      and ("astro_diary_ai_commands"."last_failure_code" is null
        or length(trim("astro_diary_ai_commands"."last_failure_code")) between 1 and 160)
      and ("astro_diary_ai_commands"."quarantine_reason_code" is null
        or length(trim("astro_diary_ai_commands"."quarantine_reason_code")) between 1 and 160)
      and (
        ("astro_diary_ai_commands"."state" = 'processing'
          and "astro_diary_ai_commands"."attempts" >= 1
          and "astro_diary_ai_commands"."lease_owner" is not null
          and "astro_diary_ai_commands"."next_attempt_at" is null
          and "astro_diary_ai_commands"."quarantined_at" is null
          and "astro_diary_ai_commands"."quarantine_reason_code" is null)
        or ("astro_diary_ai_commands"."state" = 'quarantined'
          and "astro_diary_ai_commands"."lease_owner" is null
          and "astro_diary_ai_commands"."next_attempt_at" is null
          and "astro_diary_ai_commands"."last_failure_code" is not null
          and "astro_diary_ai_commands"."quarantined_at" is not null
          and "astro_diary_ai_commands"."quarantine_reason_code" is not null)

        or ("astro_diary_ai_commands"."state" not in ('processing', 'quarantined')
          and "astro_diary_ai_commands"."lease_owner" is null
          and "astro_diary_ai_commands"."quarantined_at" is null
          and "astro_diary_ai_commands"."quarantine_reason_code" is null)
      )),
	CONSTRAINT "astro_diary_ai_commands_time_order_check" CHECK (("astro_diary_ai_commands"."processing_started_at" is null or "astro_diary_ai_commands"."processing_started_at" >= "astro_diary_ai_commands"."created_at")
        and ("astro_diary_ai_commands"."completed_at" is null or "astro_diary_ai_commands"."completed_at" >= "astro_diary_ai_commands"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_ai_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"command_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"source_digest" varchar(71) NOT NULL,
	"body" text NOT NULL,
	"body_digest" varchar(71) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_ai_drafts_command_unique" UNIQUE("command_id"),
	CONSTRAINT "astro_diary_ai_drafts_body_check" CHECK (length(trim("astro_diary_ai_drafts"."body")) between 1 and 20000),
	CONSTRAINT "astro_diary_ai_drafts_digest_check" CHECK ("astro_diary_ai_drafts"."source_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "astro_diary_ai_drafts"."body_digest" ~ '^sha256:[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "astro_diary_cascade_commands" (
	"cascade_request_id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"state" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"claim_fence" bigint DEFAULT 0 NOT NULL,
	"lease_owner" varchar(200),
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"last_failure_code" varchar(160),
	"quarantined_at" timestamp with time zone,
	"quarantine_reason_code" varchar(160),
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "astro_diary_cascade_commands_journal_identity_unique" UNIQUE("cascade_request_id","journal_id"),
	CONSTRAINT "astro_diary_cascade_commands_state_check" CHECK (("astro_diary_cascade_commands"."state" in ('pending', 'processing') and "astro_diary_cascade_commands"."completed_at" is null)
        or ("astro_diary_cascade_commands"."state" in ('completed', 'quarantined') and "astro_diary_cascade_commands"."completed_at" is not null)),
	CONSTRAINT "astro_diary_cascade_commands_work_authority_check" CHECK ("astro_diary_cascade_commands"."attempts" between 0 and "astro_diary_cascade_commands"."max_attempts"
      and "astro_diary_cascade_commands"."max_attempts" between 1 and 20
      and "astro_diary_cascade_commands"."claim_fence" >= "astro_diary_cascade_commands"."attempts"
      and (("astro_diary_cascade_commands"."lease_owner" is null) = ("astro_diary_cascade_commands"."lease_expires_at" is null))
      and ("astro_diary_cascade_commands"."lease_owner" is null or length(trim("astro_diary_cascade_commands"."lease_owner")) between 1 and 200)
      and ("astro_diary_cascade_commands"."last_failure_code" is null
        or length(trim("astro_diary_cascade_commands"."last_failure_code")) between 1 and 160)
      and ("astro_diary_cascade_commands"."quarantine_reason_code" is null
        or length(trim("astro_diary_cascade_commands"."quarantine_reason_code")) between 1 and 160)
      and (
        ("astro_diary_cascade_commands"."state" = 'processing'
          and "astro_diary_cascade_commands"."attempts" >= 1
          and "astro_diary_cascade_commands"."lease_owner" is not null
          and "astro_diary_cascade_commands"."next_attempt_at" is null
          and "astro_diary_cascade_commands"."quarantined_at" is null
          and "astro_diary_cascade_commands"."quarantine_reason_code" is null)
        or ("astro_diary_cascade_commands"."state" = 'quarantined'
          and "astro_diary_cascade_commands"."lease_owner" is null
          and "astro_diary_cascade_commands"."next_attempt_at" is null
          and "astro_diary_cascade_commands"."last_failure_code" is not null
          and "astro_diary_cascade_commands"."quarantined_at" is not null
          and "astro_diary_cascade_commands"."quarantine_reason_code" is not null)

        or ("astro_diary_cascade_commands"."state" not in ('processing', 'quarantined')
          and "astro_diary_cascade_commands"."lease_owner" is null
          and "astro_diary_cascade_commands"."quarantined_at" is null
          and "astro_diary_cascade_commands"."quarantine_reason_code" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_cascade_receipts" (
	"receipt_id" uuid PRIMARY KEY NOT NULL,
	"cascade_request_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"subsystem" text NOT NULL,
	"target_id" uuid NOT NULL,
	"source_version" integer NOT NULL,
	"source_digest" varchar(71) NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_cascade_receipts_target_unique" UNIQUE("cascade_request_id","subsystem","target_id")
);
--> statement-breakpoint
CREATE TABLE "astro_diary_cascade_targets" (
	"cascade_request_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"subsystem" text NOT NULL,
	"target_id" uuid NOT NULL,
	"source_version" integer NOT NULL,
	"source_digest" varchar(71) NOT NULL,
	CONSTRAINT "astro_diary_cascade_targets_pk" PRIMARY KEY("cascade_request_id","subsystem","target_id"),
	CONSTRAINT "astro_diary_cascade_targets_evidence_unique" UNIQUE("cascade_request_id","journal_id","subsystem","target_id","source_version","source_digest"),
	CONSTRAINT "astro_diary_cascade_targets_subsystem_check" CHECK ("astro_diary_cascade_targets"."subsystem" in (
        'timeline_revision', 'derivative', 'transcript', 'extraction',
        'embedding', 'ai_draft', 'export', 'media'
      )),
	CONSTRAINT "astro_diary_cascade_targets_version_check" CHECK ("astro_diary_cascade_targets"."source_version" >= 1),
	CONSTRAINT "astro_diary_cascade_targets_digest_check" CHECK ("astro_diary_cascade_targets"."source_digest" ~ '^sha256:[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "astro_diary_command_event_receipts" (
	"journal_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"ordinal" integer NOT NULL,
	"event_id" uuid NOT NULL,
	CONSTRAINT "astro_diary_command_event_receipts_pk" PRIMARY KEY("journal_id","idempotency_key","ordinal"),
	CONSTRAINT "astro_diary_command_event_receipts_event_unique" UNIQUE("event_id"),
	CONSTRAINT "astro_diary_command_event_receipts_ordinal_check" CHECK ("astro_diary_command_event_receipts"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_command_preconditions" (
	"journal_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"aggregate" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	CONSTRAINT "astro_diary_command_preconditions_pk" PRIMARY KEY("journal_id","idempotency_key","aggregate","aggregate_id"),
	CONSTRAINT "astro_diary_command_preconditions_aggregate_check" CHECK ("astro_diary_command_preconditions"."aggregate" in (
        'journal', 'cycle', 'draft', 'timeline_item', 'obligation', 'allowance', 'read_cursor'
      )),
	CONSTRAINT "astro_diary_command_preconditions_version_check" CHECK ("astro_diary_command_preconditions"."expected_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_command_receipts" (
	"journal_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_hash" varchar(71) NOT NULL,
	"outcome" text NOT NULL,
	"rejection_code" varchar(160),
	"result_resource_type" text,
	"result_resource_id" uuid,
	"result_resource_version" integer,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_command_receipts_pk" PRIMARY KEY("journal_id","idempotency_key"),
	CONSTRAINT "astro_diary_command_receipts_hash_check" CHECK ("astro_diary_command_receipts"."request_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "astro_diary_command_receipts_idempotency_key_check" CHECK (length(trim("astro_diary_command_receipts"."idempotency_key")) between 1 and 160),
	CONSTRAINT "astro_diary_command_receipts_outcome_check" CHECK (("astro_diary_command_receipts"."outcome" = 'applied' and "astro_diary_command_receipts"."rejection_code" is null)
        or ("astro_diary_command_receipts"."outcome" = 'rejected'
          and length(trim("astro_diary_command_receipts"."rejection_code")) between 1 and 160)),
	CONSTRAINT "astro_diary_command_receipts_result_resource_check" CHECK ((
        "astro_diary_command_receipts"."outcome" = 'applied'
        and (
          ("astro_diary_command_receipts"."result_resource_type" is null and "astro_diary_command_receipts"."result_resource_id" is null
            and "astro_diary_command_receipts"."result_resource_version" is null)
          or ("astro_diary_command_receipts"."result_resource_type" = 'draft' and "astro_diary_command_receipts"."result_resource_id" is not null
            and "astro_diary_command_receipts"."result_resource_version" >= 1)
        )
      ) or (
        "astro_diary_command_receipts"."outcome" = 'rejected' and "astro_diary_command_receipts"."result_resource_type" is null
        and "astro_diary_command_receipts"."result_resource_id" is null and "astro_diary_command_receipts"."result_resource_version" is null
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_derivative_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"source_digest" varchar(71) NOT NULL,
	"operation" text NOT NULL,
	"state" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"claim_fence" bigint DEFAULT 0 NOT NULL,
	"lease_owner" varchar(200),
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"last_failure_code" varchar(160),
	"quarantined_at" timestamp with time zone,
	"quarantine_reason_code" varchar(160),
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "astro_diary_derivative_commands_source_operation_unique" UNIQUE("item_id","source_revision","operation"),
	CONSTRAINT "astro_diary_derivative_commands_operation_check" CHECK ("astro_diary_derivative_commands"."operation" in ('generate', 'redact')),
	CONSTRAINT "astro_diary_derivative_commands_digest_check" CHECK ("astro_diary_derivative_commands"."source_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "astro_diary_derivative_commands_state_check" CHECK (("astro_diary_derivative_commands"."state" in ('pending', 'processing') and "astro_diary_derivative_commands"."completed_at" is null)
        or ("astro_diary_derivative_commands"."state" in ('completed', 'known_failed', 'source_stale', 'quarantined')
          and "astro_diary_derivative_commands"."completed_at" is not null)),
	CONSTRAINT "astro_diary_derivative_commands_work_authority_check" CHECK ("astro_diary_derivative_commands"."attempts" between 0 and "astro_diary_derivative_commands"."max_attempts"
      and "astro_diary_derivative_commands"."max_attempts" between 1 and 20
      and "astro_diary_derivative_commands"."claim_fence" >= "astro_diary_derivative_commands"."attempts"
      and (("astro_diary_derivative_commands"."lease_owner" is null) = ("astro_diary_derivative_commands"."lease_expires_at" is null))
      and ("astro_diary_derivative_commands"."lease_owner" is null or length(trim("astro_diary_derivative_commands"."lease_owner")) between 1 and 200)
      and ("astro_diary_derivative_commands"."last_failure_code" is null
        or length(trim("astro_diary_derivative_commands"."last_failure_code")) between 1 and 160)
      and ("astro_diary_derivative_commands"."quarantine_reason_code" is null
        or length(trim("astro_diary_derivative_commands"."quarantine_reason_code")) between 1 and 160)
      and (
        ("astro_diary_derivative_commands"."state" = 'processing'
          and "astro_diary_derivative_commands"."attempts" >= 1
          and "astro_diary_derivative_commands"."lease_owner" is not null
          and "astro_diary_derivative_commands"."next_attempt_at" is null
          and "astro_diary_derivative_commands"."quarantined_at" is null
          and "astro_diary_derivative_commands"."quarantine_reason_code" is null)
        or ("astro_diary_derivative_commands"."state" = 'quarantined'
          and "astro_diary_derivative_commands"."lease_owner" is null
          and "astro_diary_derivative_commands"."next_attempt_at" is null
          and "astro_diary_derivative_commands"."last_failure_code" is not null
          and "astro_diary_derivative_commands"."quarantined_at" is not null
          and "astro_diary_derivative_commands"."quarantine_reason_code" is not null)

        or ("astro_diary_derivative_commands"."state" not in ('processing', 'quarantined')
          and "astro_diary_derivative_commands"."lease_owner" is null
          and "astro_diary_derivative_commands"."quarantined_at" is null
          and "astro_diary_derivative_commands"."quarantine_reason_code" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_derivative_redaction_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"command_id" uuid NOT NULL,
	"target" text NOT NULL,
	"media_id" uuid,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_derivative_redaction_receipts_target_check" CHECK (("astro_diary_derivative_redaction_receipts"."target" in ('source', 'derivative') and "astro_diary_derivative_redaction_receipts"."media_id" is null)
        or ("astro_diary_derivative_redaction_receipts"."target" = 'media' and "astro_diary_derivative_redaction_receipts"."media_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_erasure_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"state" text NOT NULL,
	"source_version" integer NOT NULL,
	"source_digest" varchar(71),
	"derivative_command_id" uuid,
	"cascade_request_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"claim_fence" bigint DEFAULT 0 NOT NULL,
	"lease_owner" varchar(200),
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"last_failure_code" varchar(160),
	"quarantined_at" timestamp with time zone,
	"quarantine_reason_code" varchar(160),
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "astro_diary_erasure_commands_version_check" CHECK ("astro_diary_erasure_commands"."source_version" >= 1),
	CONSTRAINT "astro_diary_erasure_commands_target_check" CHECK ((
        "astro_diary_erasure_commands"."target_type" = 'item'
        and "astro_diary_erasure_commands"."source_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "astro_diary_erasure_commands"."derivative_command_id" is not null
        and "astro_diary_erasure_commands"."cascade_request_id" is null
      ) or (
        "astro_diary_erasure_commands"."target_type" = 'journal'
        and "astro_diary_erasure_commands"."target_id" = "astro_diary_erasure_commands"."journal_id"
        and "astro_diary_erasure_commands"."source_digest" is null
        and "astro_diary_erasure_commands"."derivative_command_id" is null
        and "astro_diary_erasure_commands"."cascade_request_id" is not null
      )),
	CONSTRAINT "astro_diary_erasure_commands_state_check" CHECK (("astro_diary_erasure_commands"."state" in ('pending', 'processing') and "astro_diary_erasure_commands"."completed_at" is null)
        or ("astro_diary_erasure_commands"."state" in ('completed', 'quarantined') and "astro_diary_erasure_commands"."completed_at" is not null)),
	CONSTRAINT "astro_diary_erasure_commands_work_authority_check" CHECK ("astro_diary_erasure_commands"."attempts" between 0 and "astro_diary_erasure_commands"."max_attempts"
      and "astro_diary_erasure_commands"."max_attempts" between 1 and 20
      and "astro_diary_erasure_commands"."claim_fence" >= "astro_diary_erasure_commands"."attempts"
      and (("astro_diary_erasure_commands"."lease_owner" is null) = ("astro_diary_erasure_commands"."lease_expires_at" is null))
      and ("astro_diary_erasure_commands"."lease_owner" is null or length(trim("astro_diary_erasure_commands"."lease_owner")) between 1 and 200)
      and ("astro_diary_erasure_commands"."last_failure_code" is null
        or length(trim("astro_diary_erasure_commands"."last_failure_code")) between 1 and 160)
      and ("astro_diary_erasure_commands"."quarantine_reason_code" is null
        or length(trim("astro_diary_erasure_commands"."quarantine_reason_code")) between 1 and 160)
      and (
        ("astro_diary_erasure_commands"."state" = 'processing'
          and "astro_diary_erasure_commands"."attempts" >= 1
          and "astro_diary_erasure_commands"."lease_owner" is not null
          and "astro_diary_erasure_commands"."next_attempt_at" is null
          and "astro_diary_erasure_commands"."quarantined_at" is null
          and "astro_diary_erasure_commands"."quarantine_reason_code" is null)
        or ("astro_diary_erasure_commands"."state" = 'quarantined'
          and "astro_diary_erasure_commands"."lease_owner" is null
          and "astro_diary_erasure_commands"."next_attempt_at" is null
          and "astro_diary_erasure_commands"."last_failure_code" is not null
          and "astro_diary_erasure_commands"."quarantined_at" is not null
          and "astro_diary_erasure_commands"."quarantine_reason_code" is not null)

        or ("astro_diary_erasure_commands"."state" not in ('processing', 'quarantined')
          and "astro_diary_erasure_commands"."lease_owner" is null
          and "astro_diary_erasure_commands"."quarantined_at" is null
          and "astro_diary_erasure_commands"."quarantine_reason_code" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_erasure_decision_facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"journal_id" uuid NOT NULL,
	"relationship_id" uuid,
	"journal_epoch_id" uuid,
	"erasure_request_id" uuid,
	"cascade_request_id" uuid,
	"subscription_id" uuid,
	"cycle_id" uuid,
	"obligation_id" uuid,
	"close_reason" text,
	"obligation_state" text,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_erasure_decision_facts_shape_check" CHECK ((
        "astro_diary_erasure_decision_facts"."type" = 'astro_diary.journal_erasure_requested'
        and "astro_diary_erasure_decision_facts"."relationship_id" is not null and "astro_diary_erasure_decision_facts"."journal_epoch_id" is not null
        and "astro_diary_erasure_decision_facts"."erasure_request_id" is not null and "astro_diary_erasure_decision_facts"."cascade_request_id" is not null
        and "astro_diary_erasure_decision_facts"."subscription_id" is null and "astro_diary_erasure_decision_facts"."cycle_id" is null
        and "astro_diary_erasure_decision_facts"."obligation_id" is null and "astro_diary_erasure_decision_facts"."close_reason" is null
        and "astro_diary_erasure_decision_facts"."obligation_state" is null
      ) or (
        "astro_diary_erasure_decision_facts"."type" = 'astro_diary.subscription_end_requested'
        and "astro_diary_erasure_decision_facts"."subscription_id" is not null and "astro_diary_erasure_decision_facts"."erasure_request_id" is not null
        and "astro_diary_erasure_decision_facts"."relationship_id" is null and "astro_diary_erasure_decision_facts"."journal_epoch_id" is null
        and "astro_diary_erasure_decision_facts"."cascade_request_id" is null and "astro_diary_erasure_decision_facts"."cycle_id" is null
        and "astro_diary_erasure_decision_facts"."obligation_id" is null and "astro_diary_erasure_decision_facts"."close_reason" is null
        and "astro_diary_erasure_decision_facts"."obligation_state" is null
      ) or (
        "astro_diary_erasure_decision_facts"."type" = 'astro_diary.cycle_closed'
        and "astro_diary_erasure_decision_facts"."cycle_id" is not null and "astro_diary_erasure_decision_facts"."close_reason" = 'journal_deleted'
        and "astro_diary_erasure_decision_facts"."relationship_id" is null and "astro_diary_erasure_decision_facts"."journal_epoch_id" is null
        and "astro_diary_erasure_decision_facts"."erasure_request_id" is null and "astro_diary_erasure_decision_facts"."cascade_request_id" is null
        and "astro_diary_erasure_decision_facts"."subscription_id" is null and "astro_diary_erasure_decision_facts"."obligation_id" is null
        and "astro_diary_erasure_decision_facts"."obligation_state" is null
      ) or (
        "astro_diary_erasure_decision_facts"."type" = 'astro_diary.obligation_closed'
        and "astro_diary_erasure_decision_facts"."cycle_id" is not null and "astro_diary_erasure_decision_facts"."obligation_id" is not null
        and "astro_diary_erasure_decision_facts"."obligation_state" = 'closed_without_response'
        and "astro_diary_erasure_decision_facts"."relationship_id" is null and "astro_diary_erasure_decision_facts"."journal_epoch_id" is null
        and "astro_diary_erasure_decision_facts"."erasure_request_id" is null and "astro_diary_erasure_decision_facts"."cascade_request_id" is null
        and "astro_diary_erasure_decision_facts"."subscription_id" is null and "astro_diary_erasure_decision_facts"."close_reason" is null
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_event_application_receipts" (
	"consumer" varchar(160) NOT NULL,
	"source_event_id" uuid NOT NULL,
	"source_event_type" varchar(200) NOT NULL,
	"source_event_digest" varchar(71) NOT NULL,
	"journal_id" uuid NOT NULL,
	"result_kind" text NOT NULL,
	"result_code" varchar(160),
	"applied_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_event_application_receipts_pk" PRIMARY KEY("consumer","source_event_id"),
	CONSTRAINT "astro_diary_event_application_receipts_consumer_check" CHECK ("astro_diary_event_application_receipts"."consumer" in (
        'realtime_projection', 'notification', 'context_worker', 'derivative_worker',
        'ai_worker', 'export_worker', 'erasure_worker'
      )),
	CONSTRAINT "astro_diary_event_application_receipts_digest_check" CHECK ("astro_diary_event_application_receipts"."source_event_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "astro_diary_event_application_receipts_result_check" CHECK (("astro_diary_event_application_receipts"."result_kind" = 'applied' and "astro_diary_event_application_receipts"."result_code" is null)
        or ("astro_diary_event_application_receipts"."result_kind" in ('idempotent', 'rejected')
          and length(trim("astro_diary_event_application_receipts"."result_code")) between 1 and 160))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_event_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"consumer" varchar(80) NOT NULL,
	"state" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"claim_fence" bigint DEFAULT 0 NOT NULL,
	"lease_owner" varchar(200),
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"last_failure_code" varchar(160),
	"quarantined_at" timestamp with time zone,
	"quarantine_reason_code" varchar(160),
	"available_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_event_deliveries_event_consumer_unique" UNIQUE("event_id","consumer"),
	CONSTRAINT "astro_diary_event_deliveries_consumer_check" CHECK ("astro_diary_event_deliveries"."consumer" in (
        'realtime_projection', 'notification', 'context_worker', 'derivative_worker',
        'ai_worker', 'export_worker', 'erasure_worker'
      )),
	CONSTRAINT "astro_diary_event_deliveries_state_check" CHECK (("astro_diary_event_deliveries"."state" in ('pending', 'publishing') and "astro_diary_event_deliveries"."published_at" is null)
        or ("astro_diary_event_deliveries"."state" = 'published' and "astro_diary_event_deliveries"."published_at" is not null)
        or ("astro_diary_event_deliveries"."state" = 'quarantined' and "astro_diary_event_deliveries"."published_at" is null)),
	CONSTRAINT "astro_diary_event_deliveries_work_authority_check" CHECK ("astro_diary_event_deliveries"."attempts" between 0 and "astro_diary_event_deliveries"."max_attempts"
      and "astro_diary_event_deliveries"."max_attempts" between 1 and 20
      and "astro_diary_event_deliveries"."claim_fence" >= "astro_diary_event_deliveries"."attempts"
      and (("astro_diary_event_deliveries"."lease_owner" is null) = ("astro_diary_event_deliveries"."lease_expires_at" is null))
      and ("astro_diary_event_deliveries"."lease_owner" is null or length(trim("astro_diary_event_deliveries"."lease_owner")) between 1 and 200)
      and ("astro_diary_event_deliveries"."last_failure_code" is null
        or length(trim("astro_diary_event_deliveries"."last_failure_code")) between 1 and 160)
      and ("astro_diary_event_deliveries"."quarantine_reason_code" is null
        or length(trim("astro_diary_event_deliveries"."quarantine_reason_code")) between 1 and 160)
      and (
        ("astro_diary_event_deliveries"."state" = 'publishing'
          and "astro_diary_event_deliveries"."attempts" >= 1
          and "astro_diary_event_deliveries"."lease_owner" is not null
          and "astro_diary_event_deliveries"."next_attempt_at" is null
          and "astro_diary_event_deliveries"."quarantined_at" is null
          and "astro_diary_event_deliveries"."quarantine_reason_code" is null)
        or ("astro_diary_event_deliveries"."state" = 'quarantined'
          and "astro_diary_event_deliveries"."lease_owner" is null
          and "astro_diary_event_deliveries"."next_attempt_at" is null
          and "astro_diary_event_deliveries"."last_failure_code" is not null
          and "astro_diary_event_deliveries"."quarantined_at" is not null
          and "astro_diary_event_deliveries"."quarantine_reason_code" is not null)

        or ("astro_diary_event_deliveries"."state" not in ('publishing', 'quarantined')
          and "astro_diary_event_deliveries"."lease_owner" is null
          and "astro_diary_event_deliveries"."quarantined_at" is null
          and "astro_diary_event_deliveries"."quarantine_reason_code" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" integer NOT NULL,
	"event_digest" varchar(71) NOT NULL,
	"journal_id" uuid NOT NULL,
	"journal_epoch_id" uuid NOT NULL,
	"cycle_id" uuid,
	"item_id" uuid,
	"context_id" uuid,
	"obligation_id" uuid,
	"response_item_id" uuid,
	"command_id" uuid,
	"period_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_events_schema_version_check" CHECK ("astro_diary_events"."schema_version" = 1),
	CONSTRAINT "astro_diary_events_digest_check" CHECK ("astro_diary_events"."event_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "astro_diary_events_ids_only_shape_check" CHECK ((
        "astro_diary_events"."event_type" = 'astro_diary.cycle_opened.v1'
        and "astro_diary_events"."cycle_id" is not null and "astro_diary_events"."period_id" is not null
        and "astro_diary_events"."item_id" is null and "astro_diary_events"."context_id" is null
        and "astro_diary_events"."obligation_id" is null
        and "astro_diary_events"."response_item_id" is null and "astro_diary_events"."command_id" is null
      ) or (
        "astro_diary_events"."event_type" in (
          'astro_diary.timeline_item_published.v1',
          'astro_diary.timeline_item_edited.v1',
          'astro_diary.timeline_item_hidden.v1',
          'astro_diary.timeline_item_erased.v1'
        )
        and "astro_diary_events"."cycle_id" is not null and "astro_diary_events"."item_id" is not null
        and "astro_diary_events"."context_id" is null and "astro_diary_events"."obligation_id" is null
        and "astro_diary_events"."response_item_id" is null
        and "astro_diary_events"."command_id" is null and "astro_diary_events"."period_id" is null
      ) or (
        "astro_diary_events"."event_type" = 'astro_diary.cycle_closed.v1'
        and "astro_diary_events"."cycle_id" is not null and "astro_diary_events"."item_id" is null
        and "astro_diary_events"."context_id" is null and "astro_diary_events"."obligation_id" is null
        and "astro_diary_events"."response_item_id" is null
        and "astro_diary_events"."command_id" is null and "astro_diary_events"."period_id" is null
      ) or (
        "astro_diary_events"."event_type" in (
          'astro_diary.response_obligation_created.v1',
          'astro_diary.response_obligation_overdue.v1'
        )
        and "astro_diary_events"."cycle_id" is not null and "astro_diary_events"."obligation_id" is not null
        and "astro_diary_events"."item_id" is null and "astro_diary_events"."context_id" is null
        and "astro_diary_events"."response_item_id" is null
        and "astro_diary_events"."command_id" is null and "astro_diary_events"."period_id" is null
      ) or (
        "astro_diary_events"."event_type" = 'astro_diary.response_obligation_satisfied.v1'
        and "astro_diary_events"."cycle_id" is not null and "astro_diary_events"."obligation_id" is not null
        and "astro_diary_events"."response_item_id" is not null and "astro_diary_events"."item_id" is null
        and "astro_diary_events"."context_id" is null and "astro_diary_events"."command_id" is null
        and "astro_diary_events"."period_id" is null
      ) or (
        "astro_diary_events"."event_type" in (
          'astro_diary.context_generation_requested.v1',
          'astro_diary.derivative_generation_requested.v1'
        )
        and "astro_diary_events"."cycle_id" is not null and "astro_diary_events"."item_id" is not null
        and "astro_diary_events"."context_id" is null and "astro_diary_events"."obligation_id" is null
        and "astro_diary_events"."response_item_id" is null
        and "astro_diary_events"."command_id" is null and "astro_diary_events"."period_id" is null
      ) or (
        "astro_diary_events"."event_type" in (
          'astro_diary.context_completed.v1', 'astro_diary.context_failed.v1'
        )
        and "astro_diary_events"."cycle_id" is not null and "astro_diary_events"."item_id" is not null
        and "astro_diary_events"."context_id" is not null and "astro_diary_events"."obligation_id" is null
        and "astro_diary_events"."response_item_id" is null and "astro_diary_events"."command_id" is null
        and "astro_diary_events"."period_id" is null
      ) or (
        "astro_diary_events"."event_type" in (
          'astro_diary.ai_generation_requested.v1', 'astro_diary.ai_updated.v1'
        )
        and "astro_diary_events"."cycle_id" is not null and "astro_diary_events"."command_id" is not null
        and "astro_diary_events"."item_id" is null and "astro_diary_events"."context_id" is null
        and "astro_diary_events"."obligation_id" is null
        and "astro_diary_events"."response_item_id" is null and "astro_diary_events"."period_id" is null
      ) or (
        "astro_diary_events"."event_type" in (
          'astro_diary.export_requested.v1', 'astro_diary.export_ready.v1',
          'astro_diary.export_failed.v1', 'astro_diary.export_invalidated.v1',
          'astro_diary.erasure_requested.v1', 'astro_diary.erasure_completed.v1'
        )
        and "astro_diary_events"."command_id" is not null and "astro_diary_events"."cycle_id" is null
        and "astro_diary_events"."item_id" is null and "astro_diary_events"."context_id" is null
        and "astro_diary_events"."obligation_id" is null
        and "astro_diary_events"."response_item_id" is null and "astro_diary_events"."period_id" is null
      ) or (
        "astro_diary_events"."event_type" = 'astro_diary.journal_activated.v1'
        and "astro_diary_events"."cycle_id" is null and "astro_diary_events"."item_id" is null
        and "astro_diary_events"."context_id" is null and "astro_diary_events"."obligation_id" is null
        and "astro_diary_events"."response_item_id" is null and "astro_diary_events"."command_id" is null
        and "astro_diary_events"."period_id" is null
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_export_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"status" text NOT NULL,
	"source_journal_version" integer NOT NULL,
	"source_digest" varchar(71) NOT NULL,
	"locale" text NOT NULL,
	"artifact_media_id" uuid,
	"artifact_owner_user_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"claim_fence" bigint DEFAULT 0 NOT NULL,
	"lease_owner" varchar(200),
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"last_failure_code" varchar(160),
	"quarantined_at" timestamp with time zone,
	"quarantine_reason_code" varchar(160),
	"failure_code" varchar(160),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_export_commands_journal_key_unique" UNIQUE("journal_id","idempotency_key"),
	CONSTRAINT "astro_diary_export_commands_source_version_check" CHECK ("astro_diary_export_commands"."source_journal_version" >= 1),
	CONSTRAINT "astro_diary_export_commands_locale_check" CHECK ("astro_diary_export_commands"."locale" in ('ru', 'en')),
	CONSTRAINT "astro_diary_export_commands_digest_check" CHECK ("astro_diary_export_commands"."source_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "astro_diary_export_commands_state_check" CHECK ((
        "astro_diary_export_commands"."status" in ('queued', 'processing')
        and "astro_diary_export_commands"."artifact_media_id" is null and "astro_diary_export_commands"."artifact_owner_user_id" is null
        and "astro_diary_export_commands"."failure_code" is null
      ) or (
        "astro_diary_export_commands"."status" = 'ready'
        and "astro_diary_export_commands"."artifact_media_id" is not null
        and "astro_diary_export_commands"."artifact_owner_user_id" = "astro_diary_export_commands"."requested_by_user_id"
        and "astro_diary_export_commands"."failure_code" is null
      ) or (
        "astro_diary_export_commands"."status" = 'failed'
        and "astro_diary_export_commands"."artifact_media_id" is null and "astro_diary_export_commands"."artifact_owner_user_id" is null
        and length(trim("astro_diary_export_commands"."failure_code")) between 1 and 160
      ) or (
        "astro_diary_export_commands"."status" = 'invalidated'
        and "astro_diary_export_commands"."artifact_media_id" is null and "astro_diary_export_commands"."artifact_owner_user_id" is null
        and "astro_diary_export_commands"."failure_code" is null
      )),
	CONSTRAINT "astro_diary_export_commands_time_order_check" CHECK ("astro_diary_export_commands"."updated_at" >= "astro_diary_export_commands"."created_at"),
	CONSTRAINT "astro_diary_export_commands_work_authority_check" CHECK ("astro_diary_export_commands"."attempts" between 0 and "astro_diary_export_commands"."max_attempts"
      and "astro_diary_export_commands"."max_attempts" between 1 and 20
      and "astro_diary_export_commands"."claim_fence" >= "astro_diary_export_commands"."attempts"
      and (("astro_diary_export_commands"."lease_owner" is null) = ("astro_diary_export_commands"."lease_expires_at" is null))
      and ("astro_diary_export_commands"."lease_owner" is null or length(trim("astro_diary_export_commands"."lease_owner")) between 1 and 200)
      and ("astro_diary_export_commands"."last_failure_code" is null
        or length(trim("astro_diary_export_commands"."last_failure_code")) between 1 and 160)
      and ("astro_diary_export_commands"."quarantine_reason_code" is null
        or length(trim("astro_diary_export_commands"."quarantine_reason_code")) between 1 and 160)
      and (
        ("astro_diary_export_commands"."status" = 'processing'
          and "astro_diary_export_commands"."attempts" >= 1
          and "astro_diary_export_commands"."lease_owner" is not null
          and "astro_diary_export_commands"."next_attempt_at" is null
          and "astro_diary_export_commands"."quarantined_at" is null
          and "astro_diary_export_commands"."quarantine_reason_code" is null)
        or ("astro_diary_export_commands"."status" = 'failed'
          and "astro_diary_export_commands"."lease_owner" is null
          and "astro_diary_export_commands"."next_attempt_at" is null
          and "astro_diary_export_commands"."last_failure_code" is not null
          and "astro_diary_export_commands"."quarantined_at" is not null
          and "astro_diary_export_commands"."quarantine_reason_code" is not null)
        or ("astro_diary_export_commands"."status" = 'failed'
          and "astro_diary_export_commands"."lease_owner" is null
          and "astro_diary_export_commands"."next_attempt_at" is null
          and "astro_diary_export_commands"."quarantined_at" is null
          and "astro_diary_export_commands"."quarantine_reason_code" is null)
        or ("astro_diary_export_commands"."status" not in ('processing', 'failed')
          and "astro_diary_export_commands"."lease_owner" is null
          and "astro_diary_export_commands"."quarantined_at" is null
          and "astro_diary_export_commands"."quarantine_reason_code" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_realtime_events" (
	"event_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "astro_diary_realtime_events_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_event_id" uuid NOT NULL,
	"type" text NOT NULL,
	"journal_id" uuid NOT NULL,
	"cycle_id" uuid,
	"item_id" uuid,
	"obligation_id" uuid,
	"context_id" uuid,
	"command_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_realtime_events_source_unique" UNIQUE("source_event_id"),
	CONSTRAINT "astro_diary_realtime_events_cursor_check" CHECK ("astro_diary_realtime_events"."event_id" >= 1),
	CONSTRAINT "astro_diary_realtime_events_ids_only_shape_check" CHECK ((
        "astro_diary_realtime_events"."type" in ('journal.updated', 'allowance.updated')
        and "astro_diary_realtime_events"."cycle_id" is null and "astro_diary_realtime_events"."item_id" is null
        and "astro_diary_realtime_events"."obligation_id" is null and "astro_diary_realtime_events"."context_id" is null
        and "astro_diary_realtime_events"."command_id" is null
      ) or (
        "astro_diary_realtime_events"."type" = 'cycle.updated' and "astro_diary_realtime_events"."cycle_id" is not null
        and "astro_diary_realtime_events"."item_id" is null and "astro_diary_realtime_events"."obligation_id" is null
        and "astro_diary_realtime_events"."context_id" is null and "astro_diary_realtime_events"."command_id" is null
      ) or (
        "astro_diary_realtime_events"."type" in ('timeline.item.published', 'timeline.item.updated', 'timeline.item.erased')
        and "astro_diary_realtime_events"."cycle_id" is not null and "astro_diary_realtime_events"."item_id" is not null
        and "astro_diary_realtime_events"."obligation_id" is null and "astro_diary_realtime_events"."context_id" is null
        and "astro_diary_realtime_events"."command_id" is null
      ) or (
        "astro_diary_realtime_events"."type" = 'obligation.updated' and "astro_diary_realtime_events"."cycle_id" is not null
        and "astro_diary_realtime_events"."obligation_id" is not null and "astro_diary_realtime_events"."item_id" is null
        and "astro_diary_realtime_events"."context_id" is null and "astro_diary_realtime_events"."command_id" is null
      ) or (
        "astro_diary_realtime_events"."type" = 'context.updated' and "astro_diary_realtime_events"."cycle_id" is not null
        and "astro_diary_realtime_events"."item_id" is not null and "astro_diary_realtime_events"."context_id" is not null
        and "astro_diary_realtime_events"."obligation_id" is null and "astro_diary_realtime_events"."command_id" is null
      ) or (
        "astro_diary_realtime_events"."type" = 'ai.updated' and "astro_diary_realtime_events"."cycle_id" is not null
        and "astro_diary_realtime_events"."command_id" is not null and "astro_diary_realtime_events"."item_id" is null
        and "astro_diary_realtime_events"."obligation_id" is null and "astro_diary_realtime_events"."context_id" is null
      ) or (
        "astro_diary_realtime_events"."type" in ('export.updated', 'erasure.updated')
        and "astro_diary_realtime_events"."command_id" is not null and "astro_diary_realtime_events"."cycle_id" is null
        and "astro_diary_realtime_events"."item_id" is null and "astro_diary_realtime_events"."obligation_id" is null
        and "astro_diary_realtime_events"."context_id" is null
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_context_display_personal_highlights" (
	"context_id" uuid NOT NULL,
	"context_version" integer NOT NULL,
	"journal_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"transit_point" varchar(80) NOT NULL,
	"natal_point" varchar(80) NOT NULL,
	"aspect" varchar(80) NOT NULL,
	"applying" boolean,
	CONSTRAINT "astro_diary_context_display_personal_highlights_pk" PRIMARY KEY("context_id","context_version","ordinal"),
	CONSTRAINT "astro_diary_context_display_personal_highlights_ordinal_check" CHECK ("astro_diary_context_display_personal_highlights"."ordinal" between 0 and 19),
	CONSTRAINT "astro_diary_context_display_personal_highlights_points_check" CHECK (length(trim("astro_diary_context_display_personal_highlights"."transit_point")) between 1 and 80
        and length(trim("astro_diary_context_display_personal_highlights"."natal_point")) between 1 and 80
        and length(trim("astro_diary_context_display_personal_highlights"."aspect")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_context_display_transits" (
	"context_id" uuid NOT NULL,
	"context_version" integer NOT NULL,
	"journal_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"transit_point" varchar(80) NOT NULL,
	"natal_point" varchar(80),
	"aspect" varchar(80),
	"sign" text NOT NULL,
	"applying" boolean,
	CONSTRAINT "astro_diary_context_display_transits_pk" PRIMARY KEY("context_id","context_version","ordinal"),
	CONSTRAINT "astro_diary_context_display_transits_ordinal_check" CHECK ("astro_diary_context_display_transits"."ordinal" between 0 and 19),
	CONSTRAINT "astro_diary_context_display_transits_point_check" CHECK (length(trim("astro_diary_context_display_transits"."transit_point")) between 1 and 80
        and ("astro_diary_context_display_transits"."natal_point" is null or length(trim("astro_diary_context_display_transits"."natal_point")) between 1 and 80)
        and ("astro_diary_context_display_transits"."aspect" is null or length(trim("astro_diary_context_display_transits"."aspect")) between 1 and 80)),
	CONSTRAINT "astro_diary_context_display_transits_sign_check" CHECK ("astro_diary_context_display_transits"."sign" in (
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
  ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_context_displays" (
	"context_id" uuid NOT NULL,
	"context_version" integer NOT NULL,
	"journal_id" uuid NOT NULL,
	"source_context_digest" varchar(71) NOT NULL,
	"lunar_phase_id" text NOT NULL,
	"moon_sign" text NOT NULL,
	"birth_profile_revision" integer,
	CONSTRAINT "astro_diary_context_displays_pk" PRIMARY KEY("context_id","context_version"),
	CONSTRAINT "astro_diary_context_displays_version_journal_unique" UNIQUE("context_id","context_version","journal_id"),
	CONSTRAINT "astro_diary_context_displays_digest_check" CHECK ("astro_diary_context_displays"."source_context_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "astro_diary_context_displays_phase_check" CHECK ("astro_diary_context_displays"."lunar_phase_id" in (
        'new_moon', 'waxing_crescent', 'first_quarter', 'waxing_gibbous',
        'full_moon', 'waning_gibbous', 'last_quarter', 'waning_crescent'
      )),
	CONSTRAINT "astro_diary_context_displays_moon_sign_check" CHECK ("astro_diary_context_displays"."moon_sign" in (
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
  )),
	CONSTRAINT "astro_diary_context_displays_birth_revision_check" CHECK ("astro_diary_context_displays"."birth_profile_revision" is null or "astro_diary_context_displays"."birth_profile_revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_context_invalidations" (
	"item_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"previous_revision" integer NOT NULL,
	"next_revision" integer NOT NULL,
	"invalidated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_context_invalidations_pk" PRIMARY KEY("item_id","previous_revision","next_revision"),
	CONSTRAINT "astro_diary_context_invalidations_contiguous_revision_check" CHECK ("astro_diary_context_invalidations"."previous_revision" >= 1 and "astro_diary_context_invalidations"."next_revision" = "astro_diary_context_invalidations"."previous_revision" + 1)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_context_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"source_item_revision" integer NOT NULL,
	"source_item_digest" varchar(71) NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"event_timezone" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"engine_revision" text,
	"global_context_ref" uuid,
	"birth_profile_id" uuid,
	"birth_profile_revision" integer,
	"personal_chart_ref" uuid,
	"context_digest" varchar(71),
	"calculated_at" timestamp with time zone,
	"failure_code" varchar(160),
	CONSTRAINT "astro_diary_context_snapshots_source_unique" UNIQUE("item_id","source_item_revision"),
	CONSTRAINT "astro_diary_context_snapshots_journal_identity_unique" UNIQUE("id","journal_id"),
	CONSTRAINT "astro_diary_context_snapshots_version_journal_unique" UNIQUE("id","version","journal_id"),
	CONSTRAINT "astro_diary_context_snapshots_version_check" CHECK ("astro_diary_context_snapshots"."version" >= 1),
	CONSTRAINT "astro_diary_context_snapshots_source_digest_check" CHECK ("astro_diary_context_snapshots"."source_item_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "astro_diary_context_snapshots_event_timezone_check" CHECK (length(trim("astro_diary_context_snapshots"."event_timezone")) between 1 and 100),
	CONSTRAINT "astro_diary_context_snapshots_shape_check" CHECK ((
        "astro_diary_context_snapshots"."status" = 'pending'
        and "astro_diary_context_snapshots"."engine_revision" is null
        and "astro_diary_context_snapshots"."global_context_ref" is null
        and "astro_diary_context_snapshots"."birth_profile_id" is null
        and "astro_diary_context_snapshots"."birth_profile_revision" is null
        and "astro_diary_context_snapshots"."personal_chart_ref" is null
        and "astro_diary_context_snapshots"."context_digest" is null
        and "astro_diary_context_snapshots"."calculated_at" is null
        and "astro_diary_context_snapshots"."failure_code" is null
      ) or (
        "astro_diary_context_snapshots"."status" = 'global_only'
        and length(trim("astro_diary_context_snapshots"."engine_revision")) between 1 and 200
        and "astro_diary_context_snapshots"."global_context_ref" is not null
        and "astro_diary_context_snapshots"."birth_profile_id" is null
        and "astro_diary_context_snapshots"."birth_profile_revision" is null
        and "astro_diary_context_snapshots"."personal_chart_ref" is null
        and "astro_diary_context_snapshots"."context_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "astro_diary_context_snapshots"."calculated_at" is not null
        and "astro_diary_context_snapshots"."failure_code" is null
      ) or (
        "astro_diary_context_snapshots"."status" = 'personal'
        and length(trim("astro_diary_context_snapshots"."engine_revision")) between 1 and 200
        and "astro_diary_context_snapshots"."global_context_ref" is not null
        and "astro_diary_context_snapshots"."birth_profile_id" is not null
        and "astro_diary_context_snapshots"."birth_profile_revision" >= 1
        and "astro_diary_context_snapshots"."personal_chart_ref" is not null
        and "astro_diary_context_snapshots"."context_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "astro_diary_context_snapshots"."calculated_at" is not null
        and "astro_diary_context_snapshots"."failure_code" is null
      ) or (
        "astro_diary_context_snapshots"."status" in ('failed', 'source_stale')
        and "astro_diary_context_snapshots"."engine_revision" is null
        and "astro_diary_context_snapshots"."global_context_ref" is null
        and "astro_diary_context_snapshots"."birth_profile_id" is null
        and "astro_diary_context_snapshots"."birth_profile_revision" is null
        and "astro_diary_context_snapshots"."personal_chart_ref" is null
        and "astro_diary_context_snapshots"."context_digest" is null
        and "astro_diary_context_snapshots"."calculated_at" is not null
        and length(trim("astro_diary_context_snapshots"."failure_code")) between 1 and 160
        and ("astro_diary_context_snapshots"."status" <> 'source_stale' or "astro_diary_context_snapshots"."failure_code" = 'source_stale')
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_read_cursors" (
	"journal_id" uuid NOT NULL,
	"participant_user_id" uuid NOT NULL,
	"last_read_cursor" bigint NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_read_cursors_pk" PRIMARY KEY("journal_id","participant_user_id"),
	CONSTRAINT "astro_diary_read_cursors_cursor_check" CHECK ("astro_diary_read_cursors"."last_read_cursor" >= 0),
	CONSTRAINT "astro_diary_read_cursors_cursor_safe_integer_check" CHECK ("astro_diary_read_cursors"."last_read_cursor" <= 9007199254740991),
	CONSTRAINT "astro_diary_read_cursors_version_check" CHECK ("astro_diary_read_cursors"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_cycle_opening_allowance_facts" (
	"cycle_id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"opening_period_id" uuid NOT NULL,
	"opening_allowance_reservation_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_cycle_opening_allowance_facts_recorded_check" CHECK ("astro_diary_cycle_opening_allowance_facts"."recorded_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_cycles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"opening_period_id" uuid NOT NULL,
	"opening_allowance_reservation_id" uuid,
	"awaiting_client_prompt_item_id" uuid,
	"client_response_due_at" timestamp with time zone,
	"client_response_window_calendar_days" integer,
	"client_response_timezone" text,
	"state" text NOT NULL,
	"version" integer NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	CONSTRAINT "astro_diary_cycles_journal_identity_unique" UNIQUE("id","journal_id"),
	CONSTRAINT "astro_diary_cycles_state_evidence_check" CHECK ((
        "astro_diary_cycles"."state" in (
          'awaiting_client_entry',
          'awaiting_astrologer_response',
          'awaiting_client_follow_up',
          'awaiting_astrologer_closing_response'
        ) and "astro_diary_cycles"."closed_at" is null and "astro_diary_cycles"."close_reason" is null
      ) or (
        "astro_diary_cycles"."state" = 'closed'
        and "astro_diary_cycles"."closed_at" is not null
        and "astro_diary_cycles"."close_reason" in (
          'completed',
          'client_declined',
          'prompt_withdrawn',
          'client_response_expired',
          'trigger_deleted',
          'journal_deleted',
          'cancelled_by_finance_revocation'
        )
      )),
	CONSTRAINT "astro_diary_cycles_prompt_window_check" CHECK ((
        "astro_diary_cycles"."state" in ('awaiting_client_entry', 'awaiting_client_follow_up')
        and "astro_diary_cycles"."awaiting_client_prompt_item_id" is not null
        and "astro_diary_cycles"."client_response_due_at" is not null
        and "astro_diary_cycles"."client_response_window_calendar_days" between 1 and 90
        and length(trim("astro_diary_cycles"."client_response_timezone")) between 1 and 100
      ) or (
        "astro_diary_cycles"."state" not in ('awaiting_client_entry', 'awaiting_client_follow_up', 'closed')
        and "astro_diary_cycles"."awaiting_client_prompt_item_id" is null
        and "astro_diary_cycles"."client_response_due_at" is null
        and "astro_diary_cycles"."client_response_window_calendar_days" is null
        and "astro_diary_cycles"."client_response_timezone" is null
      ) or (
        "astro_diary_cycles"."state" = 'closed'
        and "astro_diary_cycles"."awaiting_client_prompt_item_id" is null
        and (
          ("astro_diary_cycles"."client_response_due_at" is null
            and "astro_diary_cycles"."client_response_window_calendar_days" is null
            and "astro_diary_cycles"."client_response_timezone" is null)
          or ("astro_diary_cycles"."client_response_due_at" is not null
            and "astro_diary_cycles"."client_response_window_calendar_days" between 1 and 90
            and length(trim("astro_diary_cycles"."client_response_timezone")) between 1 and 100)
        )
      )),
	CONSTRAINT "astro_diary_cycles_opening_reservation_check" CHECK (("astro_diary_cycles"."state" = 'awaiting_client_entry' and "astro_diary_cycles"."opening_allowance_reservation_id" is not null)
        or ("astro_diary_cycles"."state" <> 'awaiting_client_entry' and "astro_diary_cycles"."opening_allowance_reservation_id" is null)),
	CONSTRAINT "astro_diary_cycles_time_order_check" CHECK (("astro_diary_cycles"."closed_at" is null or "astro_diary_cycles"."closed_at" >= "astro_diary_cycles"."opened_at")
        and ("astro_diary_cycles"."client_response_due_at" is null or "astro_diary_cycles"."client_response_due_at" > "astro_diary_cycles"."opened_at")),
	CONSTRAINT "astro_diary_cycles_version_check" CHECK ("astro_diary_cycles"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_journals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"relationship_id" uuid NOT NULL,
	"journal_epoch_id" uuid NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"state" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_journals_epoch_unique" UNIQUE("journal_epoch_id"),
	CONSTRAINT "astro_diary_journals_pair_identity_unique" UNIQUE("id","client_user_id","astrologer_user_id"),
	CONSTRAINT "astro_diary_journals_state_check" CHECK ("astro_diary_journals"."state" in ('active', 'erasing', 'erased')),
	CONSTRAINT "astro_diary_journals_version_check" CHECK ("astro_diary_journals"."version" >= 1),
	CONSTRAINT "astro_diary_journals_distinct_users_check" CHECK ("astro_diary_journals"."client_user_id" <> "astro_diary_journals"."astrologer_user_id")
);
--> statement-breakpoint
CREATE TABLE "astro_diary_response_obligation_weekdays" (
	"obligation_id" uuid NOT NULL,
	"iso_weekday" integer NOT NULL,
	CONSTRAINT "astro_diary_response_obligation_weekdays_pk" PRIMARY KEY("obligation_id","iso_weekday"),
	CONSTRAINT "astro_diary_response_obligation_weekdays_value_check" CHECK ("astro_diary_response_obligation_weekdays"."iso_weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_response_obligations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"trigger_item_id" uuid NOT NULL,
	"state" text NOT NULL,
	"version" integer NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"response_sla_working_days" integer NOT NULL,
	"service_timezone" text NOT NULL,
	"resolved_due_local" text NOT NULL,
	"resolved_due_offset" text NOT NULL,
	"satisfied_by_item_id" uuid,
	"closed_at" timestamp with time zone,
	CONSTRAINT "astro_diary_response_obligations_journal_identity_unique" UNIQUE("id","journal_id"),
	CONSTRAINT "astro_diary_response_obligations_state_evidence_check" CHECK ((
        "astro_diary_response_obligations"."state" in ('open', 'overdue')
        and "astro_diary_response_obligations"."satisfied_by_item_id" is null
        and "astro_diary_response_obligations"."closed_at" is null
      ) or (
        "astro_diary_response_obligations"."state" = 'satisfied'
        and "astro_diary_response_obligations"."satisfied_by_item_id" is not null
        and "astro_diary_response_obligations"."closed_at" is not null
      ) or (
        "astro_diary_response_obligations"."state" in ('cancelled_by_finance_revocation', 'closed_without_response')
        and "astro_diary_response_obligations"."satisfied_by_item_id" is null
        and "astro_diary_response_obligations"."closed_at" is not null
      )),
	CONSTRAINT "astro_diary_response_obligations_due_evidence_check" CHECK ("astro_diary_response_obligations"."due_at" > "astro_diary_response_obligations"."opened_at"
        and ("astro_diary_response_obligations"."closed_at" is null or "astro_diary_response_obligations"."closed_at" >= "astro_diary_response_obligations"."opened_at")
        and "astro_diary_response_obligations"."response_sla_working_days" between 1 and 30
        and length(trim("astro_diary_response_obligations"."service_timezone")) between 1 and 100
        and length(trim("astro_diary_response_obligations"."resolved_due_local")) between 1 and 80
        and "astro_diary_response_obligations"."resolved_due_offset" ~ '^[+-](0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
        and ("astro_diary_response_obligations"."resolved_due_local" || "astro_diary_response_obligations"."resolved_due_offset")::timestamptz = "astro_diary_response_obligations"."due_at"),
	CONSTRAINT "astro_diary_response_obligations_version_check" CHECK ("astro_diary_response_obligations"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_media_authorities" (
	"media_id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"bound_item_id" uuid,
	"ready_at" timestamp with time zone,
	"bound_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_media_authorities_binding_identity_unique" UNIQUE("media_id","journal_id","owner_user_id","purpose"),
	CONSTRAINT "astro_diary_media_authorities_media_journal_unique" UNIQUE("media_id","journal_id"),
	CONSTRAINT "astro_diary_media_authorities_purpose_check" CHECK ("astro_diary_media_authorities"."purpose" in ('astro_diary_attachment', 'astro_diary_voice')),
	CONSTRAINT "astro_diary_media_authorities_private_check" CHECK ("astro_diary_media_authorities"."visibility" = 'private'),
	CONSTRAINT "astro_diary_media_authorities_state_check" CHECK ((
        "astro_diary_media_authorities"."state" = 'pending' and "astro_diary_media_authorities"."ready_at" is null
        and "astro_diary_media_authorities"."bound_item_id" is null and "astro_diary_media_authorities"."bound_at" is null
      ) or (
        "astro_diary_media_authorities"."state" = 'ready' and "astro_diary_media_authorities"."ready_at" is not null
        and "astro_diary_media_authorities"."bound_item_id" is null and "astro_diary_media_authorities"."bound_at" is null
      ) or (
        "astro_diary_media_authorities"."state" = 'bound' and "astro_diary_media_authorities"."ready_at" is not null
        and "astro_diary_media_authorities"."bound_item_id" is not null and "astro_diary_media_authorities"."bound_at" is not null
        and "astro_diary_media_authorities"."bound_at" >= "astro_diary_media_authorities"."ready_at"
      ) or (
        "astro_diary_media_authorities"."state" = 'failed' and "astro_diary_media_authorities"."ready_at" is null
        and "astro_diary_media_authorities"."bound_item_id" is null and "astro_diary_media_authorities"."bound_at" is null
      ) or (
        "astro_diary_media_authorities"."state" = 'deleted'
        and (("astro_diary_media_authorities"."bound_item_id" is null) = ("astro_diary_media_authorities"."bound_at" is null))
      )),
	CONSTRAINT "astro_diary_media_authorities_time_check" CHECK ("astro_diary_media_authorities"."updated_at" >= "astro_diary_media_authorities"."created_at"
        and ("astro_diary_media_authorities"."ready_at" is null or "astro_diary_media_authorities"."ready_at" >= "astro_diary_media_authorities"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_draft_attachments" (
	"draft_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"media_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	CONSTRAINT "astro_diary_draft_attachments_pk" PRIMARY KEY("draft_id","ordinal"),
	CONSTRAINT "astro_diary_draft_attachments_media_unique" UNIQUE("draft_id","media_id"),
	CONSTRAINT "astro_diary_draft_attachments_purpose_check" CHECK ("astro_diary_draft_attachments"."purpose" in ('astro_diary_attachment', 'astro_diary_voice')),
	CONSTRAINT "astro_diary_draft_attachments_ordinal_check" CHECK ("astro_diary_draft_attachments"."ordinal" between 0 and 19)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_draft_version_facts" (
	"draft_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_draft_version_facts_pk" PRIMARY KEY("draft_id","version"),
	CONSTRAINT "astro_diary_draft_version_facts_result_identity_unique" UNIQUE("draft_id","version","journal_id"),
	CONSTRAINT "astro_diary_draft_version_facts_version_check" CHECK ("astro_diary_draft_version_facts"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"cycle_id" uuid,
	"author_user_id" uuid NOT NULL,
	"author_role" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"mood_id" text,
	"corrects_item_id" uuid,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_drafts_journal_identity_unique" UNIQUE("id","journal_id"),
	CONSTRAINT "astro_diary_drafts_author_purpose_unique" UNIQUE NULLS NOT DISTINCT("journal_id","author_user_id","kind","cycle_id","corrects_item_id"),
	CONSTRAINT "astro_diary_drafts_version_check" CHECK ("astro_diary_drafts"."version" >= 1),
	CONSTRAINT "astro_diary_drafts_body_check" CHECK (char_length("astro_diary_drafts"."body") <= 20000),
	CONSTRAINT "astro_diary_drafts_shape_check" CHECK ((
        "astro_diary_drafts"."kind" = 'client_entry' and "astro_diary_drafts"."author_role" = 'client'
        and ("astro_diary_drafts"."mood_id" is null or "astro_diary_drafts"."mood_id" in ('inspired', 'joy', 'calm', 'tired', 'anxious', 'sad'))
        and "astro_diary_drafts"."corrects_item_id" is null
      ) or (
        "astro_diary_drafts"."kind" in ('astrologer_reply', 'reflection_prompt')
        and "astro_diary_drafts"."author_role" = 'astrologer'
        and "astro_diary_drafts"."mood_id" is null and "astro_diary_drafts"."corrects_item_id" is null
      ) or (
        "astro_diary_drafts"."kind" = 'correction'
        and "astro_diary_drafts"."author_role" in ('client', 'astrologer')
        and "astro_diary_drafts"."mood_id" is null and "astro_diary_drafts"."corrects_item_id" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_entry_attachments" (
	"media_id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"state" text NOT NULL,
	"bound_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "astro_diary_entry_attachments_exact_binding_unique" UNIQUE("media_id","item_id","journal_id"),
	CONSTRAINT "astro_diary_entry_attachments_purpose_check" CHECK ("astro_diary_entry_attachments"."purpose" in ('astro_diary_attachment', 'astro_diary_voice')),
	CONSTRAINT "astro_diary_entry_attachments_state_check" CHECK (("astro_diary_entry_attachments"."state" = 'bound' and "astro_diary_entry_attachments"."released_at" is null)
        or ("astro_diary_entry_attachments"."state" = 'released' and "astro_diary_entry_attachments"."released_at" is not null
          and "astro_diary_entry_attachments"."released_at" >= "astro_diary_entry_attachments"."bound_at"))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_item_read_access_revocations" (
	"item_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"journal_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_item_read_access_revocations_pk" PRIMARY KEY("item_id","source_revision"),
	CONSTRAINT "astro_diary_item_read_access_revocations_revision_check" CHECK ("astro_diary_item_read_access_revocations"."source_revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "astro_diary_journal_media_access_revocations" (
	"media_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_journal_media_access_revocations_pk" PRIMARY KEY("media_id","journal_id")
);
--> statement-breakpoint
CREATE TABLE "astro_diary_media_access_revocations" (
	"media_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_media_access_revocations_pk" PRIMARY KEY("media_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "astro_diary_timeline_item_revisions" (
	"item_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"cursor" bigint NOT NULL,
	"kind" text NOT NULL,
	"original_kind" text,
	"author_role" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text,
	"mood_id" text,
	"context_status" text,
	"corrects_item_id" uuid,
	"tombstone_reason" text,
	"edited_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	"source_digest" varchar(71) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "astro_diary_timeline_item_revisions_pk" PRIMARY KEY("item_id","revision"),
	CONSTRAINT "astro_diary_timeline_item_revisions_journal_identity_unique" UNIQUE("item_id","revision","journal_id"),
	CONSTRAINT "astro_diary_timeline_item_revisions_revision_check" CHECK ("astro_diary_timeline_item_revisions"."revision" >= 1),
	CONSTRAINT "astro_diary_timeline_item_revisions_cursor_check" CHECK ("astro_diary_timeline_item_revisions"."cursor" >= 1),
	CONSTRAINT "astro_diary_timeline_item_revisions_digest_check" CHECK ("astro_diary_timeline_item_revisions"."source_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "astro_diary_timeline_item_revisions_shape_check" CHECK ((
        "astro_diary_timeline_item_revisions"."kind" = 'client_entry'
        and "astro_diary_timeline_item_revisions"."author_role" = 'client'
        and "astro_diary_timeline_item_revisions"."body" is not null
        and length(trim("astro_diary_timeline_item_revisions"."body")) between 1 and 20000
        and ("astro_diary_timeline_item_revisions"."mood_id" is null or "astro_diary_timeline_item_revisions"."mood_id" in ('inspired', 'joy', 'calm', 'tired', 'anxious', 'sad'))
        and "astro_diary_timeline_item_revisions"."context_status" in ('pending', 'global_only', 'personal', 'failed', 'source_stale')
        and "astro_diary_timeline_item_revisions"."corrects_item_id" is null
        and "astro_diary_timeline_item_revisions"."original_kind" is null
        and "astro_diary_timeline_item_revisions"."tombstone_reason" is null
      ) or (
        "astro_diary_timeline_item_revisions"."kind" in ('astrologer_reply', 'reflection_prompt')
        and "astro_diary_timeline_item_revisions"."author_role" = 'astrologer'
        and "astro_diary_timeline_item_revisions"."body" is not null
        and length(trim("astro_diary_timeline_item_revisions"."body")) between 1 and 20000
        and "astro_diary_timeline_item_revisions"."mood_id" is null
        and "astro_diary_timeline_item_revisions"."context_status" is null
        and "astro_diary_timeline_item_revisions"."corrects_item_id" is null
        and "astro_diary_timeline_item_revisions"."original_kind" is null
        and "astro_diary_timeline_item_revisions"."tombstone_reason" is null
      ) or (
        "astro_diary_timeline_item_revisions"."kind" = 'correction'
        and "astro_diary_timeline_item_revisions"."author_role" in ('client', 'astrologer')
        and "astro_diary_timeline_item_revisions"."body" is not null
        and length(trim("astro_diary_timeline_item_revisions"."body")) between 1 and 20000
        and "astro_diary_timeline_item_revisions"."mood_id" is null
        and "astro_diary_timeline_item_revisions"."context_status" is null
        and "astro_diary_timeline_item_revisions"."corrects_item_id" is not null
        and "astro_diary_timeline_item_revisions"."corrects_item_id" <> "astro_diary_timeline_item_revisions"."item_id"
        and "astro_diary_timeline_item_revisions"."original_kind" is null
        and "astro_diary_timeline_item_revisions"."tombstone_reason" is null
      ) or (
        "astro_diary_timeline_item_revisions"."kind" = 'tombstone'
        and "astro_diary_timeline_item_revisions"."author_role" in ('client', 'astrologer')
        and "astro_diary_timeline_item_revisions"."body" is null
        and "astro_diary_timeline_item_revisions"."mood_id" is null
        and "astro_diary_timeline_item_revisions"."context_status" is null
        and "astro_diary_timeline_item_revisions"."corrects_item_id" is null
        and "astro_diary_timeline_item_revisions"."original_kind" in ('client_entry', 'astrologer_reply', 'reflection_prompt', 'correction')
        and "astro_diary_timeline_item_revisions"."tombstone_reason" in ('hidden_by_author', 'content_erased')
        and "astro_diary_timeline_item_revisions"."edited_at" is null
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_timeline_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"current_revision" integer NOT NULL,
	"cursor" bigint NOT NULL,
	"kind" text NOT NULL,
	"original_kind" text,
	"author_role" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text,
	"mood_id" text,
	"context_status" text,
	"corrects_item_id" uuid,
	"tombstone_reason" text,
	"edited_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "astro_diary_timeline_items_journal_identity_unique" UNIQUE("id","journal_id"),
	CONSTRAINT "astro_diary_timeline_items_revision_identity_unique" UNIQUE("id","current_revision"),
	CONSTRAINT "astro_diary_timeline_items_revision_check" CHECK ("astro_diary_timeline_items"."current_revision" >= 1),
	CONSTRAINT "astro_diary_timeline_items_cursor_check" CHECK ("astro_diary_timeline_items"."cursor" >= 1),
	CONSTRAINT "astro_diary_timeline_items_cursor_safe_integer_check" CHECK ("astro_diary_timeline_items"."cursor" <= 9007199254740991),
	CONSTRAINT "astro_diary_timeline_items_shape_check" CHECK ((
        "astro_diary_timeline_items"."kind" = 'client_entry'
        and "astro_diary_timeline_items"."author_role" = 'client'
        and "astro_diary_timeline_items"."body" is not null
        and length(trim("astro_diary_timeline_items"."body")) between 1 and 20000
        and ("astro_diary_timeline_items"."mood_id" is null or "astro_diary_timeline_items"."mood_id" in ('inspired', 'joy', 'calm', 'tired', 'anxious', 'sad'))
        and "astro_diary_timeline_items"."context_status" in ('pending', 'global_only', 'personal', 'failed', 'source_stale')
        and "astro_diary_timeline_items"."corrects_item_id" is null
        and "astro_diary_timeline_items"."original_kind" is null
        and "astro_diary_timeline_items"."tombstone_reason" is null
      ) or (
        "astro_diary_timeline_items"."kind" in ('astrologer_reply', 'reflection_prompt')
        and "astro_diary_timeline_items"."author_role" = 'astrologer'
        and "astro_diary_timeline_items"."body" is not null
        and length(trim("astro_diary_timeline_items"."body")) between 1 and 20000
        and "astro_diary_timeline_items"."mood_id" is null
        and "astro_diary_timeline_items"."context_status" is null
        and "astro_diary_timeline_items"."corrects_item_id" is null
        and "astro_diary_timeline_items"."original_kind" is null
        and "astro_diary_timeline_items"."tombstone_reason" is null
      ) or (
        "astro_diary_timeline_items"."kind" = 'correction'
        and "astro_diary_timeline_items"."author_role" in ('client', 'astrologer')
        and "astro_diary_timeline_items"."body" is not null
        and length(trim("astro_diary_timeline_items"."body")) between 1 and 20000
        and "astro_diary_timeline_items"."mood_id" is null
        and "astro_diary_timeline_items"."context_status" is null
        and "astro_diary_timeline_items"."corrects_item_id" is not null
        and "astro_diary_timeline_items"."corrects_item_id" <> "astro_diary_timeline_items"."id"
        and "astro_diary_timeline_items"."original_kind" is null
        and "astro_diary_timeline_items"."tombstone_reason" is null
      ) or (
        "astro_diary_timeline_items"."kind" = 'tombstone'
        and "astro_diary_timeline_items"."author_role" in ('client', 'astrologer')
        and "astro_diary_timeline_items"."body" is null
        and "astro_diary_timeline_items"."mood_id" is null
        and "astro_diary_timeline_items"."context_status" is null
        and "astro_diary_timeline_items"."corrects_item_id" is null
        and "astro_diary_timeline_items"."original_kind" in ('client_entry', 'astrologer_reply', 'reflection_prompt', 'correction')
        and "astro_diary_timeline_items"."tombstone_reason" in ('hidden_by_author', 'content_erased')
        and "astro_diary_timeline_items"."edited_at" is null
      ))
);
--> statement-breakpoint
CREATE TABLE "astro_diary_timeline_revision_attachments" (
	"item_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"journal_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "astro_diary_timeline_revision_attachments_pk" PRIMARY KEY("item_id","revision","ordinal"),
	CONSTRAINT "astro_diary_timeline_revision_attachments_media_unique" UNIQUE("item_id","revision","media_id"),
	CONSTRAINT "astro_diary_timeline_revision_attachments_ordinal_check" CHECK ("astro_diary_timeline_revision_attachments"."ordinal" between 0 and 19)
);
--> statement-breakpoint
ALTER TABLE "astro_diary_ai_attempts" ADD CONSTRAINT "astro_diary_ai_attempts_command_id_astro_diary_ai_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."astro_diary_ai_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_ai_commands" ADD CONSTRAINT "astro_diary_ai_commands_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_ai_commands" ADD CONSTRAINT "astro_diary_ai_commands_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_ai_commands" ADD CONSTRAINT "astro_diary_ai_commands_cycle_journal_fk" FOREIGN KEY ("cycle_id","journal_id") REFERENCES "public"."astro_diary_cycles"("id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_ai_commands" ADD CONSTRAINT "astro_diary_ai_commands_source_revision_fk" FOREIGN KEY ("source_item_id","source_item_revision","journal_id") REFERENCES "public"."astro_diary_timeline_item_revisions"("item_id","revision","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_ai_drafts" ADD CONSTRAINT "astro_diary_ai_drafts_command_id_astro_diary_ai_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."astro_diary_ai_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_ai_drafts" ADD CONSTRAINT "astro_diary_ai_drafts_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_ai_drafts" ADD CONSTRAINT "astro_diary_ai_drafts_cycle_journal_fk" FOREIGN KEY ("cycle_id","journal_id") REFERENCES "public"."astro_diary_cycles"("id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_cascade_commands" ADD CONSTRAINT "astro_diary_cascade_commands_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_cascade_receipts" ADD CONSTRAINT "astro_diary_cascade_receipts_exact_target_fk" FOREIGN KEY ("cascade_request_id","journal_id","subsystem","target_id","source_version","source_digest") REFERENCES "public"."astro_diary_cascade_targets"("cascade_request_id","journal_id","subsystem","target_id","source_version","source_digest") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_cascade_targets" ADD CONSTRAINT "astro_diary_cascade_targets_command_journal_fk" FOREIGN KEY ("cascade_request_id","journal_id") REFERENCES "public"."astro_diary_cascade_commands"("cascade_request_id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_command_event_receipts" ADD CONSTRAINT "astro_diary_command_event_receipts_event_id_astro_diary_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."astro_diary_events"("event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_command_event_receipts" ADD CONSTRAINT "astro_diary_command_event_receipts_receipt_fk" FOREIGN KEY ("journal_id","idempotency_key") REFERENCES "public"."astro_diary_command_receipts"("journal_id","idempotency_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_command_preconditions" ADD CONSTRAINT "astro_diary_command_preconditions_receipt_fk" FOREIGN KEY ("journal_id","idempotency_key") REFERENCES "public"."astro_diary_command_receipts"("journal_id","idempotency_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_command_receipts" ADD CONSTRAINT "astro_diary_command_receipts_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_command_receipts" ADD CONSTRAINT "astro_diary_command_receipts_draft_result_fact_fk" FOREIGN KEY ("result_resource_id","result_resource_version","journal_id") REFERENCES "public"."astro_diary_draft_version_facts"("draft_id","version","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_derivative_commands" ADD CONSTRAINT "astro_diary_derivative_commands_source_revision_fk" FOREIGN KEY ("item_id","source_revision","journal_id") REFERENCES "public"."astro_diary_timeline_item_revisions"("item_id","revision","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_derivative_redaction_receipts" ADD CONSTRAINT "astro_diary_derivative_redaction_receipts_command_id_astro_diary_erasure_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."astro_diary_erasure_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_erasure_commands" ADD CONSTRAINT "astro_diary_erasure_commands_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_erasure_commands" ADD CONSTRAINT "astro_diary_erasure_commands_derivative_command_id_astro_diary_derivative_commands_id_fk" FOREIGN KEY ("derivative_command_id") REFERENCES "public"."astro_diary_derivative_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_erasure_decision_facts" ADD CONSTRAINT "astro_diary_erasure_decision_facts_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_event_application_receipts" ADD CONSTRAINT "astro_diary_event_application_receipts_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_event_application_receipts" ADD CONSTRAINT "astro_diary_event_application_receipts_source_event_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."astro_diary_events"("event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_event_deliveries" ADD CONSTRAINT "astro_diary_event_deliveries_event_id_astro_diary_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."astro_diary_events"("event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_events" ADD CONSTRAINT "astro_diary_events_journal_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_export_commands" ADD CONSTRAINT "astro_diary_export_commands_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_export_commands" ADD CONSTRAINT "astro_diary_export_commands_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_export_commands" ADD CONSTRAINT "astro_diary_export_commands_artifact_media_owner_fk" FOREIGN KEY ("artifact_media_id","artifact_owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_realtime_events" ADD CONSTRAINT "astro_diary_realtime_events_source_event_id_astro_diary_events_event_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."astro_diary_events"("event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_realtime_events" ADD CONSTRAINT "astro_diary_realtime_events_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_context_display_personal_highlights" ADD CONSTRAINT "astro_diary_context_display_personal_highlights_display_fk" FOREIGN KEY ("context_id","context_version","journal_id") REFERENCES "public"."astro_diary_context_displays"("context_id","context_version","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_context_display_transits" ADD CONSTRAINT "astro_diary_context_display_transits_display_fk" FOREIGN KEY ("context_id","context_version","journal_id") REFERENCES "public"."astro_diary_context_displays"("context_id","context_version","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_context_displays" ADD CONSTRAINT "astro_diary_context_displays_snapshot_version_fk" FOREIGN KEY ("context_id","context_version","journal_id") REFERENCES "public"."astro_diary_context_snapshots"("id","version","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_context_invalidations" ADD CONSTRAINT "astro_diary_context_invalidations_previous_revision_fk" FOREIGN KEY ("item_id","previous_revision","journal_id") REFERENCES "public"."astro_diary_timeline_item_revisions"("item_id","revision","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_context_invalidations" ADD CONSTRAINT "astro_diary_context_invalidations_next_revision_fk" FOREIGN KEY ("item_id","next_revision","journal_id") REFERENCES "public"."astro_diary_timeline_item_revisions"("item_id","revision","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_context_snapshots" ADD CONSTRAINT "astro_diary_context_snapshots_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_context_snapshots" ADD CONSTRAINT "astro_diary_context_snapshots_source_revision_fk" FOREIGN KEY ("item_id","source_item_revision","journal_id") REFERENCES "public"."astro_diary_timeline_item_revisions"("item_id","revision","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_context_snapshots" ADD CONSTRAINT "astro_diary_context_snapshots_birth_profile_revision_fk" FOREIGN KEY ("birth_profile_id","birth_profile_revision") REFERENCES "public"."client_birth_data_history"("birth_data_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_read_cursors" ADD CONSTRAINT "astro_diary_read_cursors_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_read_cursors" ADD CONSTRAINT "astro_diary_read_cursors_participant_user_id_users_id_fk" FOREIGN KEY ("participant_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_cycle_opening_allowance_facts" ADD CONSTRAINT "astro_diary_cycle_opening_allowance_facts_cycle_id_astro_diary_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."astro_diary_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_cycle_opening_allowance_facts" ADD CONSTRAINT "astro_diary_cycle_opening_allowance_facts_cycle_journal_fk" FOREIGN KEY ("cycle_id","journal_id") REFERENCES "public"."astro_diary_cycles"("id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_cycle_opening_allowance_facts" ADD CONSTRAINT "astro_diary_cycle_opening_allowance_facts_reservation_fk" FOREIGN KEY ("opening_period_id","opening_allowance_reservation_id") REFERENCES "public"."client_subscription_allowance_reservations"("period_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_cycles" ADD CONSTRAINT "astro_diary_cycles_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_cycles" ADD CONSTRAINT "astro_diary_cycles_opening_period_id_client_subscription_periods_id_fk" FOREIGN KEY ("opening_period_id") REFERENCES "public"."client_subscription_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_cycles" ADD CONSTRAINT "astro_diary_cycles_allowance_reservation_fk" FOREIGN KEY ("opening_period_id","opening_allowance_reservation_id") REFERENCES "public"."client_subscription_allowance_reservations"("period_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_journals" ADD CONSTRAINT "astro_diary_journals_relationship_pair_fk" FOREIGN KEY ("relationship_id","client_user_id","astrologer_user_id") REFERENCES "public"."client_astrologer_relationships"("id","client_user_id","astrologer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_journals" ADD CONSTRAINT "astro_diary_journals_subscription_epoch_fk" FOREIGN KEY ("journal_epoch_id") REFERENCES "public"."client_subscriptions"("journal_epoch_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_response_obligation_weekdays" ADD CONSTRAINT "astro_diary_response_obligation_weekdays_obligation_id_astro_diary_response_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."astro_diary_response_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_response_obligations" ADD CONSTRAINT "astro_diary_response_obligations_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_response_obligations" ADD CONSTRAINT "astro_diary_response_obligations_cycle_journal_fk" FOREIGN KEY ("cycle_id","journal_id") REFERENCES "public"."astro_diary_cycles"("id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_media_authorities" ADD CONSTRAINT "astro_diary_media_authorities_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_media_authorities" ADD CONSTRAINT "astro_diary_media_authorities_media_owner_fk" FOREIGN KEY ("media_id","owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_draft_attachments" ADD CONSTRAINT "astro_diary_draft_attachments_draft_journal_fk" FOREIGN KEY ("draft_id","journal_id") REFERENCES "public"."astro_diary_drafts"("id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_draft_attachments" ADD CONSTRAINT "astro_diary_draft_attachments_media_owner_fk" FOREIGN KEY ("media_id","owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_draft_attachments" ADD CONSTRAINT "astro_diary_draft_attachments_media_authority_fk" FOREIGN KEY ("media_id","journal_id","owner_user_id","purpose") REFERENCES "public"."astro_diary_media_authorities"("media_id","journal_id","owner_user_id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_draft_version_facts" ADD CONSTRAINT "astro_diary_draft_version_facts_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_drafts" ADD CONSTRAINT "astro_diary_drafts_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_drafts" ADD CONSTRAINT "astro_diary_drafts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_drafts" ADD CONSTRAINT "astro_diary_drafts_cycle_journal_fk" FOREIGN KEY ("cycle_id","journal_id") REFERENCES "public"."astro_diary_cycles"("id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_entry_attachments" ADD CONSTRAINT "astro_diary_entry_attachments_item_journal_fk" FOREIGN KEY ("item_id","journal_id") REFERENCES "public"."astro_diary_timeline_items"("id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_entry_attachments" ADD CONSTRAINT "astro_diary_entry_attachments_media_owner_fk" FOREIGN KEY ("media_id","owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_entry_attachments" ADD CONSTRAINT "astro_diary_entry_attachments_media_authority_fk" FOREIGN KEY ("media_id","journal_id","owner_user_id","purpose") REFERENCES "public"."astro_diary_media_authorities"("media_id","journal_id","owner_user_id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_item_read_access_revocations" ADD CONSTRAINT "astro_diary_item_read_access_revocations_revision_fk" FOREIGN KEY ("item_id","source_revision","journal_id") REFERENCES "public"."astro_diary_timeline_item_revisions"("item_id","revision","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_journal_media_access_revocations" ADD CONSTRAINT "astro_diary_journal_media_access_revocations_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_journal_media_access_revocations" ADD CONSTRAINT "astro_diary_journal_media_access_revocations_authority_fk" FOREIGN KEY ("media_id","journal_id") REFERENCES "public"."astro_diary_media_authorities"("media_id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_media_access_revocations" ADD CONSTRAINT "astro_diary_media_access_revocations_binding_fk" FOREIGN KEY ("media_id","item_id","journal_id") REFERENCES "public"."astro_diary_entry_attachments"("media_id","item_id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_timeline_item_revisions" ADD CONSTRAINT "astro_diary_timeline_item_revisions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_timeline_item_revisions" ADD CONSTRAINT "astro_diary_timeline_item_revisions_item_journal_fk" FOREIGN KEY ("item_id","journal_id") REFERENCES "public"."astro_diary_timeline_items"("id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_timeline_item_revisions" ADD CONSTRAINT "astro_diary_timeline_item_revisions_cycle_journal_fk" FOREIGN KEY ("cycle_id","journal_id") REFERENCES "public"."astro_diary_cycles"("id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_timeline_items" ADD CONSTRAINT "astro_diary_timeline_items_journal_id_astro_diary_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."astro_diary_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_timeline_items" ADD CONSTRAINT "astro_diary_timeline_items_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_timeline_items" ADD CONSTRAINT "astro_diary_timeline_items_cycle_journal_fk" FOREIGN KEY ("cycle_id","journal_id") REFERENCES "public"."astro_diary_cycles"("id","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_timeline_revision_attachments" ADD CONSTRAINT "astro_diary_timeline_revision_attachments_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_diary_timeline_revision_attachments" ADD CONSTRAINT "astro_diary_timeline_revision_attachments_revision_journal_fk" FOREIGN KEY ("item_id","revision","journal_id") REFERENCES "public"."astro_diary_timeline_item_revisions"("item_id","revision","journal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "astro_diary_ai_commands_pending_idx" ON "astro_diary_ai_commands" USING btree ("state","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "astro_diary_derivative_redaction_receipts_media_unique" ON "astro_diary_derivative_redaction_receipts" USING btree ("command_id","media_id") WHERE "astro_diary_derivative_redaction_receipts"."target" = 'media';--> statement-breakpoint
CREATE UNIQUE INDEX "astro_diary_derivative_redaction_receipts_source_unique" ON "astro_diary_derivative_redaction_receipts" USING btree ("command_id") WHERE "astro_diary_derivative_redaction_receipts"."target" = 'source';--> statement-breakpoint
CREATE UNIQUE INDEX "astro_diary_derivative_redaction_receipts_derivative_unique" ON "astro_diary_derivative_redaction_receipts" USING btree ("command_id") WHERE "astro_diary_derivative_redaction_receipts"."target" = 'derivative';--> statement-breakpoint
CREATE INDEX "astro_diary_erasure_decision_facts_journal_occurred_idx" ON "astro_diary_erasure_decision_facts" USING btree ("journal_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "astro_diary_event_application_receipts_journal_applied_idx" ON "astro_diary_event_application_receipts" USING btree ("journal_id","applied_at","source_event_id");--> statement-breakpoint
CREATE INDEX "astro_diary_event_deliveries_pending_idx" ON "astro_diary_event_deliveries" USING btree ("state","available_at","id");--> statement-breakpoint
CREATE INDEX "astro_diary_events_journal_occurred_idx" ON "astro_diary_events" USING btree ("journal_id","occurred_at","event_id");--> statement-breakpoint
CREATE INDEX "astro_diary_realtime_events_journal_cursor_idx" ON "astro_diary_realtime_events" USING btree ("journal_id","event_id");--> statement-breakpoint
CREATE INDEX "astro_diary_context_snapshots_journal_status_idx" ON "astro_diary_context_snapshots" USING btree ("journal_id","status","item_id");--> statement-breakpoint
CREATE INDEX "astro_diary_read_cursors_participant_idx" ON "astro_diary_read_cursors" USING btree ("participant_user_id","updated_at","journal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "astro_diary_cycles_one_open_per_journal" ON "astro_diary_cycles" USING btree ("journal_id") WHERE "astro_diary_cycles"."state" <> 'closed';--> statement-breakpoint
CREATE INDEX "astro_diary_cycles_journal_opened_idx" ON "astro_diary_cycles" USING btree ("journal_id","opened_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "astro_diary_journals_one_current_per_relationship" ON "astro_diary_journals" USING btree ("relationship_id") WHERE "astro_diary_journals"."state" <> 'erased';--> statement-breakpoint
CREATE INDEX "astro_diary_journals_client_state_idx" ON "astro_diary_journals" USING btree ("client_user_id","state");--> statement-breakpoint
CREATE INDEX "astro_diary_journals_astrologer_state_idx" ON "astro_diary_journals" USING btree ("astrologer_user_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "astro_diary_response_obligations_one_actionable_per_cycle" ON "astro_diary_response_obligations" USING btree ("cycle_id") WHERE "astro_diary_response_obligations"."state" in ('open', 'overdue');--> statement-breakpoint
CREATE INDEX "astro_diary_response_obligations_due_idx" ON "astro_diary_response_obligations" USING btree ("state","due_at","id");--> statement-breakpoint
CREATE INDEX "astro_diary_media_authorities_journal_owner_state_idx" ON "astro_diary_media_authorities" USING btree ("journal_id","owner_user_id","state","media_id");--> statement-breakpoint
CREATE INDEX "astro_diary_drafts_author_updated_idx" ON "astro_diary_drafts" USING btree ("journal_id","author_user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "astro_diary_entry_attachments_item_idx" ON "astro_diary_entry_attachments" USING btree ("item_id","media_id");--> statement-breakpoint
CREATE INDEX "astro_diary_timeline_item_revisions_journal_recorded_idx" ON "astro_diary_timeline_item_revisions" USING btree ("journal_id","recorded_at","item_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "astro_diary_timeline_items_server_cursor_unique" ON "astro_diary_timeline_items" USING btree ("journal_id","cursor");--> statement-breakpoint
CREATE INDEX "astro_diary_timeline_items_journal_cursor_idx" ON "astro_diary_timeline_items" USING btree ("journal_id","cursor","id");
--> statement-breakpoint
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
          and new.state in ('awaiting_astrologer_response', 'closed'))
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
--> statement-breakpoint
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
        or (cycle.opening_allowance_reservation_id is not null
          and cycle.opening_allowance_reservation_id <> fact.opening_allowance_reservation_id))
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
--> statement-breakpoint
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
