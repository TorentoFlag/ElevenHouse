import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  flowEnrollmentTraceConstraintIntegritySql,
  flowExecutionHistoryIntegritySql,
  flowRunEventCommandIntegritySql,
  flowRuntimeCommandIntegritySql
} from "./augment-flows-baseline";
import {
  flowWorkItemCoreIntegritySql,
  flowWorkItemEventIntegritySql
} from "../src/schema/flows/flow-work-items.schema";
import {
  flowRunEventCommandIntegrityV1Sql,
  flowRuntimeCommandIntegrityV1Sql
} from "./flow-runtime-command-integrity-v1";
import {
  bookingClientDataRequirementsConstraintName,
  bookingClientDataRequirementsSnapshotPredicateSql
} from "../src/schema/scheduling/booking-client-data-requirements-constraint";

export type MigrationIdentity = {
  readonly hash: string;
  readonly createdAt: string;
};

export type MigrationLedgerRow = {
  readonly hash: string;
  readonly created_at: string;
};

export const approvedLineage = readApprovedLineage();
/** @deprecated Use approvedLineage for any migration-history decision. */
export const currentBaseline = approvedLineage.at(-1)!;

function readApprovedLineage(): readonly MigrationIdentity[] {
  const migrationDirectory = join(__dirname, "../drizzle");
  const journal = JSON.parse(
    readFileSync(join(migrationDirectory, "meta/_journal.json"), "utf8")
  ) as { readonly entries?: readonly { readonly idx?: number; readonly tag?: string; readonly when?: number }[] };
  const entries = journal.entries;
  const migrationFiles = readdirSync(migrationDirectory).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  if (!entries || entries.length === 0 || entries.length !== migrationFiles.length) {
    throw new Error("Approved Drizzle lineage is missing or incomplete");
  }

  return migrationFiles.map((file, index) => {
    const entry = entries[index];
    const tag = file.slice(0, -".sql".length);
    if (!entry || entry.idx !== index || entry.tag !== tag || !Number.isSafeInteger(entry.when)) {
      throw new Error("Approved Drizzle lineage journal is invalid");
    }
    return {
      hash: createHash("sha256").update(readFileSync(join(migrationDirectory, file))).digest("hex"),
      createdAt: String(entry.when)
    };
  });
}

export function isCurrentBaselineHistory(migrations: readonly MigrationLedgerRow[]): boolean {
  return (
    migrations.length === approvedLineage.length &&
    migrations.every(
      (migration, index) =>
        migration.hash === approvedLineage[index]?.hash &&
        migration.created_at === approvedLineage[index]?.createdAt
    )
  );
}

export const schedulingBaselineDdl = `
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint
       WHERE conrelid = 'products'::regclass
         AND conname = 'products_id_owner_unique'
    ) THEN
      ALTER TABLE products
        ADD CONSTRAINT products_id_owner_unique UNIQUE (id, owner_user_id);
    END IF;
  END
  $$;

  CREATE TABLE IF NOT EXISTS availability_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text DEFAULT 'Default' NOT NULL,
    time_zone text NOT NULL,
    is_default boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    start_interval_minutes integer NOT NULL,
    buffer_before_minutes integer DEFAULT 0 NOT NULL,
    buffer_after_minutes integer DEFAULT 0 NOT NULL,
    minimum_notice_minutes integer DEFAULT 0 NOT NULL,
    booking_horizon_days integer NOT NULL,
    maximum_bookings_per_day integer,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT availability_schedules_id_owner_unique UNIQUE (id, owner_user_id),
    CONSTRAINT availability_schedules_name_length_check CHECK (length(trim(name)) BETWEEN 1 AND 120),
    CONSTRAINT availability_schedules_time_zone_length_check CHECK (length(trim(time_zone)) BETWEEN 1 AND 100),
    CONSTRAINT availability_schedules_version_check CHECK (version > 0),
    CONSTRAINT availability_schedules_start_interval_check CHECK (start_interval_minutes BETWEEN 1 AND 1440),
    CONSTRAINT availability_schedules_buffer_before_check CHECK (buffer_before_minutes BETWEEN 0 AND 10080),
    CONSTRAINT availability_schedules_buffer_after_check CHECK (buffer_after_minutes BETWEEN 0 AND 10080),
    CONSTRAINT availability_schedules_minimum_notice_check CHECK (minimum_notice_minutes BETWEEN 0 AND 525600),
    CONSTRAINT availability_schedules_booking_horizon_check CHECK (booking_horizon_days BETWEEN 1 AND 730),
    CONSTRAINT availability_schedules_maximum_bookings_check CHECK (maximum_bookings_per_day IS NULL OR maximum_bookings_per_day BETWEEN 1 AND 100)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS availability_schedules_default_owner_unique
    ON availability_schedules (owner_user_id) WHERE is_default = true;
  CREATE INDEX IF NOT EXISTS availability_schedules_owner_updated_idx
    ON availability_schedules (owner_user_id, updated_at);

  CREATE TABLE IF NOT EXISTS availability_weekly_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    weekday integer NOT NULL,
    start_minute integer NOT NULL,
    end_minute integer NOT NULL,
    CONSTRAINT availability_weekly_periods_schedule_day_range_unique UNIQUE (schedule_id, weekday, start_minute, end_minute),
    CONSTRAINT availability_weekly_periods_weekday_check CHECK (weekday BETWEEN 1 AND 7),
    CONSTRAINT availability_weekly_periods_range_check CHECK (start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute),
    CONSTRAINT availability_weekly_periods_schedule_owner_fk FOREIGN KEY (schedule_id, owner_user_id)
      REFERENCES availability_schedules(id, owner_user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS availability_weekly_periods_schedule_day_idx
    ON availability_weekly_periods (schedule_id, weekday, start_minute);

  CREATE TABLE IF NOT EXISTS availability_date_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    local_date date NOT NULL,
    mode text NOT NULL,
    CONSTRAINT availability_date_overrides_identity_unique UNIQUE (id, schedule_id, owner_user_id),
    CONSTRAINT availability_date_overrides_schedule_date_unique UNIQUE (schedule_id, local_date),
    CONSTRAINT availability_date_overrides_mode_check CHECK (mode IN ('available', 'unavailable')),
    CONSTRAINT availability_date_overrides_schedule_owner_fk FOREIGN KEY (schedule_id, owner_user_id)
      REFERENCES availability_schedules(id, owner_user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS availability_date_overrides_schedule_date_idx
    ON availability_date_overrides (schedule_id, local_date);

  CREATE TABLE IF NOT EXISTS availability_override_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    override_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    start_minute integer NOT NULL,
    end_minute integer NOT NULL,
    CONSTRAINT availability_override_periods_override_range_unique UNIQUE (override_id, start_minute, end_minute),
    CONSTRAINT availability_override_periods_range_check CHECK (start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute),
    CONSTRAINT availability_override_periods_override_schedule_owner_fk FOREIGN KEY (override_id, schedule_id, owner_user_id)
      REFERENCES availability_date_overrides(id, schedule_id, owner_user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS availability_override_periods_override_start_idx
    ON availability_override_periods (override_id, start_minute);

  CREATE TABLE IF NOT EXISTS availability_product_assignments (
    schedule_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    CONSTRAINT availability_product_assignments_pk PRIMARY KEY (schedule_id, product_id),
    CONSTRAINT availability_product_assignments_schedule_owner_fk FOREIGN KEY (schedule_id, owner_user_id)
      REFERENCES availability_schedules(id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT availability_product_assignments_product_owner_fk FOREIGN KEY (product_id, owner_user_id)
      REFERENCES products(id, owner_user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS availability_product_assignments_owner_product_idx
    ON availability_product_assignments (owner_user_id, product_id);

  CREATE TABLE IF NOT EXISTS schedule_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    kind text NOT NULL,
    lifecycle text DEFAULT 'active' NOT NULL,
    service_start_at timestamptz NOT NULL,
    service_end_at timestamptz NOT NULL,
    occupied_start_at timestamptz NOT NULL,
    occupied_end_at timestamptz NOT NULL,
    source_aggregate_id uuid,
    hold_expires_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT schedule_reservations_id_owner_unique UNIQUE (id, owner_user_id),
    CONSTRAINT schedule_reservations_kind_check CHECK (kind IN ('booking', 'hold', 'manual_block')),
    CONSTRAINT schedule_reservations_lifecycle_check CHECK (lifecycle IN ('active', 'consumed', 'released', 'expired', 'cancelled')),
    CONSTRAINT schedule_reservations_service_range_check CHECK (service_start_at < service_end_at),
    CONSTRAINT schedule_reservations_occupied_range_check CHECK (occupied_start_at < occupied_end_at AND occupied_start_at <= service_start_at AND occupied_end_at >= service_end_at),
    CONSTRAINT schedule_reservations_source_check CHECK ((kind IN ('booking', 'manual_block') AND source_aggregate_id IS NOT NULL) OR kind = 'hold'),
    CONSTRAINT schedule_reservations_hold_expiry_check CHECK ((kind = 'hold' AND hold_expires_at IS NOT NULL) OR (kind <> 'hold' AND hold_expires_at IS NULL)),
    CONSTRAINT schedule_reservations_schedule_owner_fk FOREIGN KEY (schedule_id, owner_user_id)
      REFERENCES availability_schedules(id, owner_user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS schedule_reservations_owner_service_idx
    ON schedule_reservations (owner_user_id, service_start_at, service_end_at);
  CREATE INDEX IF NOT EXISTS schedule_reservations_owner_lifecycle_occupied_idx
    ON schedule_reservations (owner_user_id, lifecycle, occupied_start_at, occupied_end_at);
  CREATE INDEX IF NOT EXISTS schedule_reservations_hold_expiry_idx
    ON schedule_reservations (lifecycle, hold_expires_at);
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint
       WHERE conrelid = 'schedule_reservations'::regclass
         AND conname = 'schedule_reservations_active_owner_range_exclude'
    ) THEN
      ALTER TABLE schedule_reservations
        ADD CONSTRAINT schedule_reservations_active_owner_range_exclude
        EXCLUDE USING gist (
          owner_user_id WITH =,
          tstzrange(occupied_start_at, occupied_end_at, '[)') WITH &&
        ) WHERE (lifecycle = 'active');
    END IF;
  END
  $$;

  CREATE TABLE IF NOT EXISTS manual_calendar_blocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    reservation_id uuid NOT NULL,
    title text NOT NULL,
    state text DEFAULT 'active' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT manual_calendar_blocks_reservation_unique UNIQUE (reservation_id),
    CONSTRAINT manual_calendar_blocks_title_length_check CHECK (length(trim(title)) BETWEEN 1 AND 120),
    CONSTRAINT manual_calendar_blocks_state_check CHECK (state IN ('active', 'released')),
    CONSTRAINT manual_calendar_blocks_reservation_owner_fk FOREIGN KEY (reservation_id, owner_user_id)
      REFERENCES schedule_reservations(id, owner_user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS manual_calendar_blocks_owner_state_updated_idx
    ON manual_calendar_blocks (owner_user_id, state, updated_at);

  CREATE TABLE IF NOT EXISTS bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    client_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    product_id uuid NOT NULL,
    reservation_id uuid NOT NULL,
    source text DEFAULT 'manual' NOT NULL,
    state text DEFAULT 'confirmed' NOT NULL,
    hold_expires_at timestamptz,
    service_start_at timestamptz NOT NULL,
    service_end_at timestamptz NOT NULL,
    product_title_snapshot text NOT NULL,
    duration_minutes_snapshot integer NOT NULL,
    delivery_format_snapshot text NOT NULL,
    price_minor_snapshot integer NOT NULL,
    currency_snapshot text NOT NULL,
    time_zone_snapshot text NOT NULL,
    policy_snapshot jsonb NOT NULL,
    client_data_requirements_snapshot jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT bookings_id_owner_unique UNIQUE (id, owner_user_id),
    CONSTRAINT bookings_reservation_unique UNIQUE (reservation_id),
    CONSTRAINT bookings_state_check CHECK (state IN ('hold', 'pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired')),
    CONSTRAINT bookings_source_check CHECK (source IN ('manual', 'client_paid')),
    CONSTRAINT bookings_hold_expiry_check CHECK (
      (state = 'hold' AND hold_expires_at IS NOT NULL)
      OR (state <> 'hold' AND hold_expires_at IS NULL)
    ),
    CONSTRAINT bookings_service_range_check CHECK (service_start_at < service_end_at),
    CONSTRAINT bookings_product_title_length_check CHECK (length(trim(product_title_snapshot)) BETWEEN 1 AND 200),
    CONSTRAINT bookings_duration_check CHECK (duration_minutes_snapshot BETWEEN 1 AND 1440),
    CONSTRAINT bookings_delivery_format_check CHECK (delivery_format_snapshot IN ('video', 'audio', 'chat', 'text', 'file', 'channel')),
    CONSTRAINT bookings_price_check CHECK (price_minor_snapshot >= 0),
    CONSTRAINT bookings_currency_check CHECK (currency_snapshot IN ('RUB')),
    CONSTRAINT bookings_time_zone_length_check CHECK (length(trim(time_zone_snapshot)) BETWEEN 1 AND 100),
    CONSTRAINT bookings_policy_snapshot_check CHECK (jsonb_typeof(policy_snapshot) = 'object'),
    CONSTRAINT ${bookingClientDataRequirementsConstraintName}
      CHECK (${bookingClientDataRequirementsSnapshotPredicateSql()}),
    CONSTRAINT bookings_reservation_owner_fk FOREIGN KEY (reservation_id, owner_user_id)
      REFERENCES schedule_reservations(id, owner_user_id) ON DELETE RESTRICT,
    CONSTRAINT bookings_product_owner_fk FOREIGN KEY (product_id, owner_user_id)
      REFERENCES products(id, owner_user_id) ON DELETE RESTRICT
  );
  CREATE INDEX IF NOT EXISTS bookings_owner_service_idx
    ON bookings (owner_user_id, service_start_at, id);
  CREATE INDEX IF NOT EXISTS bookings_owner_client_created_idx
    ON bookings (owner_user_id, client_user_id, created_at, id);

  CREATE TABLE IF NOT EXISTS idempotency_commands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    api_surface text NOT NULL,
    actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    command_scope text NOT NULL,
    key text NOT NULL,
    request_hash text NOT NULL,
    state text DEFAULT 'processing' NOT NULL,
    result jsonb,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT idempotency_commands_api_surface_length_check CHECK (length(trim(api_surface)) BETWEEN 1 AND 100),
    CONSTRAINT idempotency_commands_scope_length_check CHECK (length(trim(command_scope)) BETWEEN 1 AND 150),
    CONSTRAINT idempotency_commands_key_length_check CHECK (length(key) BETWEEN 8 AND 255),
    CONSTRAINT idempotency_commands_request_hash_check CHECK (request_hash ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT idempotency_commands_state_check CHECK (state IN ('processing', 'completed')),
    CONSTRAINT idempotency_commands_result_state_check CHECK ((state = 'processing' AND result IS NULL) OR (state = 'completed' AND jsonb_typeof(result) = 'object'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idempotency_commands_scope_key_unique
    ON idempotency_commands (api_surface, actor_user_id, command_scope, key);
  CREATE INDEX IF NOT EXISTS idempotency_commands_expiry_idx ON idempotency_commands (expires_at);
  CREATE INDEX IF NOT EXISTS idempotency_commands_actor_created_idx
    ON idempotency_commands (actor_user_id, created_at);
`;

export const flowRuntimeFoundationBaselineDdl = `
  CREATE TABLE flow_runtime_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    source text NOT NULL,
    source_event_id text NOT NULL,
    dedupe_key text NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    occurred_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT flow_runtime_events_id_owner_unique UNIQUE (id, owner_user_id),
    CONSTRAINT flow_runtime_events_source_check CHECK (
      source IN ('crm', 'product', 'order', 'booking', 'message', 'chart', 'astro_calendar', 'manual')
    ),
    CONSTRAINT flow_runtime_events_subject_type_check CHECK (
      subject_type IN ('client', 'segment', 'order', 'booking', 'global_event', 'manual')
    ),
    CONSTRAINT flow_runtime_events_source_event_id_length_check
      CHECK (length(trim(source_event_id)) BETWEEN 1 AND 180),
    CONSTRAINT flow_runtime_events_dedupe_key_length_check
      CHECK (length(trim(dedupe_key)) BETWEEN 1 AND 240),
    CONSTRAINT flow_runtime_events_subject_id_length_check
      CHECK (length(trim(subject_id)) BETWEEN 1 AND 180),
    CONSTRAINT flow_runtime_events_payload_object_check
      CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT flow_runtime_events_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE flow_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    flow_id uuid NOT NULL,
    flow_version_id uuid NOT NULL,
    runtime_event_id uuid NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    snapshot jsonb NOT NULL,
    current_node_id text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    completed_at timestamptz,
    CONSTRAINT flow_runs_id_owner_unique UNIQUE (id, owner_user_id),
    CONSTRAINT flow_runs_id_event_owner_unique UNIQUE (id, runtime_event_id, owner_user_id),
    CONSTRAINT flow_runs_id_flow_event_owner_unique
      UNIQUE (id, flow_id, runtime_event_id, owner_user_id),
    CONSTRAINT flow_runs_status_check CHECK (
      status IN (
        'pending', 'running', 'waiting', 'approval_required', 'completed', 'skipped',
        'failed_retryable', 'failed_terminal', 'suppressed', 'expired', 'canceled'
      )
    ),
    CONSTRAINT flow_runs_snapshot_object_check CHECK (jsonb_typeof(snapshot) = 'object'),
    CONSTRAINT flow_runs_current_node_id_length_check
      CHECK (current_node_id IS NULL OR length(trim(current_node_id)) BETWEEN 1 AND 160),
    CONSTRAINT flow_runs_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_runs_flow_owner_fk
      FOREIGN KEY (flow_id, owner_user_id)
      REFERENCES flows(id, owner_user_id) ON DELETE RESTRICT,
    CONSTRAINT flow_runs_flow_version_owner_fk
      FOREIGN KEY (flow_id, flow_version_id, owner_user_id)
      REFERENCES flow_versions(flow_id, id, owner_user_id) ON DELETE RESTRICT,
    CONSTRAINT flow_runs_runtime_event_owner_fk
      FOREIGN KEY (runtime_event_id, owner_user_id)
      REFERENCES flow_runtime_events(id, owner_user_id) ON DELETE RESTRICT
  );

  CREATE TABLE flow_step_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    flow_run_id uuid NOT NULL,
    node_id text NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    input_snapshot jsonb NOT NULL,
    output_snapshot jsonb,
    error_code text,
    error_message text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    completed_at timestamptz,
    CONSTRAINT flow_step_runs_id_owner_unique UNIQUE (id, owner_user_id),
    CONSTRAINT flow_step_runs_id_run_owner_unique UNIQUE (id, flow_run_id, owner_user_id),
    CONSTRAINT flow_step_runs_status_check CHECK (
      status IN (
        'pending', 'running', 'waiting', 'approval_required', 'completed', 'skipped',
        'failed_retryable', 'failed_terminal', 'suppressed', 'expired', 'canceled'
      )
    ),
    CONSTRAINT flow_step_runs_node_id_length_check
      CHECK (length(trim(node_id)) BETWEEN 1 AND 160),
    CONSTRAINT flow_step_runs_input_snapshot_object_check
      CHECK (jsonb_typeof(input_snapshot) = 'object'),
    CONSTRAINT flow_step_runs_output_snapshot_object_check
      CHECK (output_snapshot IS NULL OR jsonb_typeof(output_snapshot) = 'object'),
    CONSTRAINT flow_step_runs_error_code_length_check
      CHECK (error_code IS NULL OR length(trim(error_code)) BETWEEN 1 AND 120),
    CONSTRAINT flow_step_runs_error_message_length_check
      CHECK (error_message IS NULL OR length(trim(error_message)) BETWEEN 1 AND 1000),
    CONSTRAINT flow_step_runs_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_step_runs_run_owner_fk
      FOREIGN KEY (flow_run_id, owner_user_id)
      REFERENCES flow_runs(id, owner_user_id) ON DELETE CASCADE
  );

  CREATE TABLE flow_approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    flow_run_id uuid NOT NULL,
    flow_step_run_id uuid,
    status text DEFAULT 'pending' NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    preview text NOT NULL,
    decision_note text,
    decided_by_user_id uuid,
    snoozed_until timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    decided_at timestamptz,
    CONSTRAINT flow_approvals_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'snoozed', 'expired')),
    CONSTRAINT flow_approvals_kind_check
      CHECK (kind IN ('message', 'ai_output', 'delivery', 'payment_offer', 'manual_task')),
    CONSTRAINT flow_approvals_title_length_check
      CHECK (length(trim(title)) BETWEEN 1 AND 180),
    CONSTRAINT flow_approvals_preview_length_check
      CHECK (length(trim(preview)) BETWEEN 1 AND 1000),
    CONSTRAINT flow_approvals_decision_note_length_check
      CHECK (decision_note IS NULL OR length(trim(decision_note)) BETWEEN 1 AND 1000),
    CONSTRAINT flow_approvals_pending_decision_check CHECK (
      status <> 'pending'
      OR (decided_at IS NULL AND decided_by_user_id IS NULL AND snoozed_until IS NULL)
    ),
    CONSTRAINT flow_approvals_decided_status_check CHECK (
      status IN ('pending', 'expired')
      OR (decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL)
    ),
    CONSTRAINT flow_approvals_snoozed_until_check
      CHECK (status <> 'snoozed' OR snoozed_until IS NOT NULL),
    CONSTRAINT flow_approvals_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_approvals_decided_by_user_id_users_id_fk
      FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT flow_approvals_run_owner_fk
      FOREIGN KEY (flow_run_id, owner_user_id)
      REFERENCES flow_runs(id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT flow_approvals_step_run_owner_fk
      FOREIGN KEY (flow_step_run_id, flow_run_id, owner_user_id)
      REFERENCES flow_step_runs(id, flow_run_id, owner_user_id) ON DELETE RESTRICT
  );

  CREATE TABLE flow_delivery_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    flow_run_id uuid NOT NULL,
    flow_step_run_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    attempt_number integer NOT NULL,
    provider text,
    status text DEFAULT 'pending' NOT NULL,
    provider_request_payload jsonb,
    provider_response_payload jsonb,
    error_code text,
    error_message text,
    attempted_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT flow_delivery_attempts_status_check
      CHECK (status IN ('pending', 'sent', 'failed', 'unknown')),
    CONSTRAINT flow_delivery_attempts_idempotency_key_length_check
      CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 240),
    CONSTRAINT flow_delivery_attempts_number_check CHECK (attempt_number > 0),
    CONSTRAINT flow_delivery_attempts_provider_length_check
      CHECK (provider IS NULL OR length(trim(provider)) BETWEEN 1 AND 120),
    CONSTRAINT flow_delivery_attempts_request_payload_object_check CHECK (
      provider_request_payload IS NULL OR jsonb_typeof(provider_request_payload) = 'object'
    ),
    CONSTRAINT flow_delivery_attempts_response_payload_object_check CHECK (
      provider_response_payload IS NULL OR jsonb_typeof(provider_response_payload) = 'object'
    ),
    CONSTRAINT flow_delivery_attempts_error_code_length_check
      CHECK (error_code IS NULL OR length(trim(error_code)) BETWEEN 1 AND 120),
    CONSTRAINT flow_delivery_attempts_error_message_length_check
      CHECK (error_message IS NULL OR length(trim(error_message)) BETWEEN 1 AND 1000),
    CONSTRAINT flow_delivery_attempts_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_delivery_attempts_run_owner_fk
      FOREIGN KEY (flow_run_id, owner_user_id)
      REFERENCES flow_runs(id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT flow_delivery_attempts_step_run_owner_fk
      FOREIGN KEY (flow_step_run_id, flow_run_id, owner_user_id)
      REFERENCES flow_step_runs(id, flow_run_id, owner_user_id) ON DELETE CASCADE
  );

  CREATE TABLE flow_suppressions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    flow_id uuid NOT NULL,
    runtime_event_id uuid NOT NULL,
    flow_run_id uuid,
    reason text NOT NULL,
    details jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT flow_suppressions_reason_check CHECK (
      reason IN (
        'FLOW_NOT_PUBLISHED', 'FLOW_NOT_ACTIVE', 'OWNER_RELATIONSHIP_REQUIRED',
        'CHANNEL_CONSENT_REQUIRED', 'QUIET_HOURS_HOLD', 'FREQUENCY_CAP_HOLD',
        'PLAN_LIMIT_REACHED', 'AUTO_SEND_DISABLED'
      )
    ),
    CONSTRAINT flow_suppressions_details_object_check
      CHECK (jsonb_typeof(details) = 'object'),
    CONSTRAINT flow_suppressions_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_suppressions_flow_owner_fk
      FOREIGN KEY (flow_id, owner_user_id)
      REFERENCES flows(id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT flow_suppressions_runtime_event_owner_fk
      FOREIGN KEY (runtime_event_id, owner_user_id)
      REFERENCES flow_runtime_events(id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT flow_suppressions_run_event_owner_fk
      FOREIGN KEY (flow_run_id, flow_id, runtime_event_id, owner_user_id)
      REFERENCES flow_runs(id, flow_id, runtime_event_id, owner_user_id) ON DELETE RESTRICT
  );

  CREATE UNIQUE INDEX flow_runtime_events_owner_dedupe_unique
    ON flow_runtime_events (owner_user_id, dedupe_key);
  CREATE INDEX flow_runtime_events_owner_occurred_idx
    ON flow_runtime_events (owner_user_id, occurred_at, id);
  CREATE UNIQUE INDEX flow_runs_owner_flow_event_unique
    ON flow_runs (owner_user_id, flow_id, runtime_event_id);
  CREATE INDEX flow_runs_owner_status_updated_idx
    ON flow_runs (owner_user_id, status, updated_at);
  CREATE INDEX flow_runs_flow_created_idx ON flow_runs (flow_id, created_at, id);
  CREATE INDEX flow_runs_runtime_event_idx ON flow_runs (runtime_event_id);
  CREATE INDEX flow_step_runs_owner_run_created_idx
    ON flow_step_runs (owner_user_id, flow_run_id, created_at);
  CREATE INDEX flow_approvals_owner_status_created_idx
    ON flow_approvals (owner_user_id, status, created_at);
  CREATE INDEX flow_approvals_run_created_idx ON flow_approvals (flow_run_id, created_at);
  CREATE UNIQUE INDEX flow_delivery_attempts_owner_idempotency_unique
    ON flow_delivery_attempts (owner_user_id, idempotency_key);
  CREATE UNIQUE INDEX flow_delivery_attempts_step_attempt_unique
    ON flow_delivery_attempts (flow_step_run_id, attempt_number);
  CREATE INDEX flow_delivery_attempts_owner_status_created_idx
    ON flow_delivery_attempts (owner_user_id, status, created_at);
  CREATE UNIQUE INDEX flow_suppressions_owner_flow_event_reason_unique
    ON flow_suppressions (owner_user_id, flow_id, runtime_event_id, reason);
  CREATE INDEX flow_suppressions_owner_created_idx
    ON flow_suppressions (owner_user_id, created_at, id);
  CREATE INDEX flow_suppressions_runtime_event_idx ON flow_suppressions (runtime_event_id);
`;

export const flowExecutionRuntimeBaselineDdl = `
  ALTER TABLE flow_runs
    ADD COLUMN trace_sequence bigint DEFAULT 0 NOT NULL,
    ADD CONSTRAINT flow_runs_id_version_owner_unique
      UNIQUE (id, flow_version_id, owner_user_id),
    ADD CONSTRAINT flow_runs_trace_sequence_check CHECK (trace_sequence >= 0);

  CREATE TABLE flow_execution_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    flow_run_id uuid NOT NULL,
    flow_version_id uuid NOT NULL,
    node_id text NOT NULL,
    node_kind text NOT NULL,
    config_schema_version integer NOT NULL,
    executor_contract_version integer NOT NULL,
    executor_key text NOT NULL,
    state text DEFAULT 'runnable' NOT NULL,
    available_at timestamptz DEFAULT now() NOT NULL,
    claimed_at timestamptz,
    lease_owner text,
    lease_expires_at timestamptz,
    attempt_counter bigint DEFAULT 0 NOT NULL,
    fencing_token bigint DEFAULT 0 NOT NULL,
    terminal_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT flow_execution_tokens_id_run_owner_unique
      UNIQUE (id, flow_run_id, owner_user_id),
    CONSTRAINT flow_execution_tokens_state_check CHECK (
      state IN (
        'runnable', 'claimed', 'waiting_timer', 'waiting_signal', 'waiting_external',
        'waiting_work_item', 'waiting_approval', 'retry_scheduled', 'completed', 'failed',
        'canceled'
      )
    ),
    CONSTRAINT flow_execution_tokens_node_id_length_check
      CHECK (length(trim(node_id)) BETWEEN 1 AND 160),
    CONSTRAINT flow_execution_tokens_node_kind_length_check
      CHECK (length(trim(node_kind)) BETWEEN 1 AND 80),
    CONSTRAINT flow_execution_tokens_executor_versions_check
      CHECK (config_schema_version > 0 AND executor_contract_version > 0),
    CONSTRAINT flow_execution_tokens_executor_key_check CHECK (
      executor_key = node_kind || ':' || config_schema_version::text || ':' || executor_contract_version::text
    ),
    CONSTRAINT flow_execution_tokens_lease_owner_length_check
      CHECK (lease_owner IS NULL OR length(trim(lease_owner)) BETWEEN 1 AND 180),
    CONSTRAINT flow_execution_tokens_lease_state_check CHECK (
      (
        state = 'claimed'
        AND claimed_at IS NOT NULL
        AND lease_owner IS NOT NULL
        AND lease_expires_at IS NOT NULL
      )
      OR (
        state <> 'claimed'
        AND claimed_at IS NULL
        AND lease_owner IS NULL
        AND lease_expires_at IS NULL
      )
    ),
    CONSTRAINT flow_execution_tokens_attempt_counter_check CHECK (attempt_counter >= 0),
    CONSTRAINT flow_execution_tokens_fencing_token_check CHECK (fencing_token >= 0),
    CONSTRAINT flow_execution_tokens_terminal_state_check CHECK (
      (state IN ('completed', 'failed', 'canceled') AND terminal_at IS NOT NULL)
      OR (state NOT IN ('completed', 'failed', 'canceled') AND terminal_at IS NULL)
    ),
    CONSTRAINT flow_execution_tokens_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_execution_tokens_run_version_owner_fk
      FOREIGN KEY (flow_run_id, flow_version_id, owner_user_id)
      REFERENCES flow_runs(id, flow_version_id, owner_user_id) ON DELETE CASCADE
  );

  CREATE TABLE flow_execution_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    flow_run_id uuid NOT NULL,
    token_id uuid NOT NULL,
    flow_version_id uuid NOT NULL,
    node_id text NOT NULL,
    executor_key text NOT NULL,
    attempt_number bigint NOT NULL,
    fencing_token bigint NOT NULL,
    lease_owner text NOT NULL,
    outcome text NOT NULL,
    result_code text NOT NULL,
    trace_summary jsonb NOT NULL,
    started_at timestamptz NOT NULL,
    completed_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT flow_execution_attempts_id_run_owner_unique
      UNIQUE (id, flow_run_id, owner_user_id),
    CONSTRAINT flow_execution_attempts_outcome_check CHECK (
      outcome IN (
        'advanced', 'waiting', 'retry_scheduled', 'completed', 'failed', 'lease_expired',
        'canceled'
      )
    ),
    CONSTRAINT flow_execution_attempts_number_check
      CHECK (attempt_number > 0 AND fencing_token > 0),
    CONSTRAINT flow_execution_attempts_node_id_length_check
      CHECK (length(trim(node_id)) BETWEEN 1 AND 160),
    CONSTRAINT flow_execution_attempts_executor_key_length_check
      CHECK (length(trim(executor_key)) BETWEEN 1 AND 180),
    CONSTRAINT flow_execution_attempts_lease_owner_length_check
      CHECK (length(trim(lease_owner)) BETWEEN 1 AND 180),
    CONSTRAINT flow_execution_attempts_result_code_length_check
      CHECK (length(trim(result_code)) BETWEEN 1 AND 160),
    CONSTRAINT flow_execution_attempts_trace_summary_object_check
      CHECK (jsonb_typeof(trace_summary) = 'object'),
    CONSTRAINT flow_execution_attempts_trace_summary_schema_check CHECK (
      trace_summary ?& ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[]
      AND trace_summary - ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[] = '{}'::jsonb
      AND jsonb_typeof(trace_summary->'schemaVersion') = 'string'
      AND jsonb_typeof(trace_summary->'outcome') = 'string'
      AND jsonb_typeof(trace_summary->'nodeKind') = 'string'
      AND jsonb_typeof(trace_summary->'reasonCode') = 'string'
      AND jsonb_typeof(trace_summary->'resultCode') = 'string'
      AND trace_summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND trace_summary->>'nodeKind' IN (
        'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
        'astrologer_approval', 'completed', 'suppressed', 'failed'
      )
      AND trace_summary->>'nodeKind' = split_part(executor_key, ':', 1)
      AND result_code = trace_summary->>'resultCode'
      AND length(trace_summary->>'resultCode') BETWEEN 1 AND 160
      AND trace_summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (
          outcome = 'completed'
          AND trace_summary->>'outcome' = 'terminal'
          AND trace_summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
        )
        OR (
          outcome = 'lease_expired'
          AND trace_summary->>'outcome' = 'lease_expired'
          AND trace_summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND trace_summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
        )
      )
    ),
    CONSTRAINT flow_execution_attempts_time_order_check CHECK (completed_at >= started_at),
    CONSTRAINT flow_execution_attempts_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_execution_attempts_token_run_owner_fk
      FOREIGN KEY (token_id, flow_run_id, owner_user_id)
      REFERENCES flow_execution_tokens(id, flow_run_id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT flow_execution_attempts_run_version_owner_fk
      FOREIGN KEY (flow_run_id, flow_version_id, owner_user_id)
      REFERENCES flow_runs(id, flow_version_id, owner_user_id) ON DELETE CASCADE
  );

  CREATE TABLE flow_run_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    flow_run_id uuid NOT NULL,
    sequence bigint NOT NULL,
    event_type text NOT NULL,
    node_id text,
    attempt_id uuid,
    summary jsonb NOT NULL,
    occurred_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT flow_run_events_type_check CHECK (
      event_type IN (
        'token_advanced', 'token_waiting', 'token_retry_scheduled', 'token_lease_expired',
        'run_completed', 'run_failed', 'run_suppressed', 'run_canceled'
      )
    ),
    CONSTRAINT flow_run_events_sequence_check CHECK (sequence > 0),
    CONSTRAINT flow_run_events_node_id_length_check
      CHECK (node_id IS NULL OR length(trim(node_id)) BETWEEN 1 AND 160),
    CONSTRAINT flow_run_events_summary_object_check CHECK (jsonb_typeof(summary) = 'object'),
    CONSTRAINT flow_run_events_summary_schema_check CHECK (
      summary ?& ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[]
      AND summary - ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[] = '{}'::jsonb
      AND jsonb_typeof(summary->'schemaVersion') = 'string'
      AND jsonb_typeof(summary->'outcome') = 'string'
      AND jsonb_typeof(summary->'nodeKind') = 'string'
      AND jsonb_typeof(summary->'reasonCode') = 'string'
      AND jsonb_typeof(summary->'resultCode') = 'string'
      AND summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND summary->>'nodeKind' IN (
        'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
        'astrologer_approval', 'completed', 'suppressed', 'failed'
      )
      AND length(summary->>'resultCode') BETWEEN 1 AND 160
      AND summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (
          event_type = 'run_completed'
          AND summary->>'outcome' = 'terminal'
          AND summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
        )
        OR (
          event_type = 'token_lease_expired'
          AND summary->>'outcome' = 'lease_expired'
          AND summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
        )
      )
    ),
    CONSTRAINT flow_run_events_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_run_events_run_owner_fk
      FOREIGN KEY (flow_run_id, owner_user_id)
      REFERENCES flow_runs(id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT flow_run_events_attempt_run_owner_fk
      FOREIGN KEY (attempt_id, flow_run_id, owner_user_id)
      REFERENCES flow_execution_attempts(id, flow_run_id, owner_user_id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX flow_execution_tokens_run_unique
    ON flow_execution_tokens (flow_run_id);
  CREATE INDEX flow_execution_tokens_owner_run_idx
    ON flow_execution_tokens (owner_user_id, flow_run_id);
  CREATE INDEX flow_execution_tokens_runnable_idx
    ON flow_execution_tokens (state, available_at, created_at, id);
  CREATE INDEX flow_execution_tokens_expired_lease_idx
    ON flow_execution_tokens (state, lease_expires_at, id);
  CREATE UNIQUE INDEX flow_execution_attempts_token_fence_unique
    ON flow_execution_attempts (token_id, fencing_token);
  CREATE UNIQUE INDEX flow_execution_attempts_token_attempt_unique
    ON flow_execution_attempts (token_id, attempt_number);
  CREATE INDEX flow_execution_attempts_owner_run_completed_idx
    ON flow_execution_attempts (owner_user_id, flow_run_id, completed_at, id);
  CREATE UNIQUE INDEX flow_run_events_run_sequence_unique
    ON flow_run_events (flow_run_id, sequence);
  CREATE INDEX flow_run_events_owner_occurred_idx
    ON flow_run_events (owner_user_id, occurred_at, id);

  ${flowExecutionHistoryIntegritySql}
`;

export const flowRunCancellationBaselineDdl = `
  CREATE TABLE flow_runtime_commands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    api_surface text NOT NULL,
    actor_user_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    route_template text NOT NULL,
    resource_id uuid NOT NULL,
    command_scope text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    state text DEFAULT 'processing' NOT NULL,
    completed_at timestamptz,
    replay_until timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT flow_runtime_commands_id_resource_owner_unique
      UNIQUE (id, resource_id, owner_user_id),
    CONSTRAINT flow_runtime_commands_scope_check CHECK (
      api_surface = 'astrologer-api'
      AND route_template IN ('/flow-runs/:runId/cancel')
      AND command_scope IN ('flows.runtime.cancel.v1')
      AND route_template = '/flow-runs/:runId/cancel'
      AND command_scope = 'flows.runtime.cancel.v1'
    ),
    CONSTRAINT flow_runtime_commands_key_check CHECK (
      length(idempotency_key) BETWEEN 8 AND 128
      AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
    CONSTRAINT flow_runtime_commands_request_hash_check
      CHECK (request_hash ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT flow_runtime_commands_state_check
      CHECK (state IN ('processing', 'succeeded', 'failed')),
    CONSTRAINT flow_runtime_commands_terminal_state_check CHECK (
      (state = 'processing' AND completed_at IS NULL)
      OR (state IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
    ),
    CONSTRAINT flow_runtime_commands_replay_window_check
      CHECK (replay_until = created_at + interval '24 hours'),
    CONSTRAINT flow_runtime_commands_completion_check
      CHECK (completed_at IS NULL OR completed_at >= created_at),
    CONSTRAINT flow_runtime_commands_actor_user_id_users_id_fk
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_runtime_commands_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE flow_runtime_command_outcomes (
    command_id uuid PRIMARY KEY NOT NULL,
    response_status integer NOT NULL,
    response_body jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT flow_runtime_command_outcomes_response_check CHECK (
      response_status IN (200, 404, 409)
      AND jsonb_typeof(response_body) = 'object'
    ),
    CONSTRAINT flow_runtime_command_outcomes_command_fk
      FOREIGN KEY (command_id) REFERENCES flow_runtime_commands(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX flow_runtime_commands_scope_key_unique
    ON flow_runtime_commands (
      api_surface,
      actor_user_id,
      owner_user_id,
      route_template,
      resource_id,
      idempotency_key
    );
  CREATE INDEX flow_runtime_commands_replay_until_idx
    ON flow_runtime_commands (replay_until);
  CREATE INDEX flow_runtime_commands_owner_resource_created_idx
    ON flow_runtime_commands (owner_user_id, resource_id, created_at);
  CREATE INDEX flow_runtime_command_outcomes_created_idx
    ON flow_runtime_command_outcomes (created_at);

  ALTER TABLE flow_execution_attempts
    DROP CONSTRAINT flow_execution_attempts_trace_summary_schema_check,
    ADD CONSTRAINT flow_execution_attempts_trace_summary_schema_check CHECK (
      trace_summary ?& ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[]
      AND trace_summary - ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[] = '{}'::jsonb
      AND jsonb_typeof(trace_summary->'schemaVersion') = 'string'
      AND jsonb_typeof(trace_summary->'outcome') = 'string'
      AND jsonb_typeof(trace_summary->'nodeKind') = 'string'
      AND jsonb_typeof(trace_summary->'reasonCode') = 'string'
      AND jsonb_typeof(trace_summary->'resultCode') = 'string'
      AND trace_summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND trace_summary->>'nodeKind' IN (
        'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
        'astrologer_approval', 'completed', 'suppressed', 'failed'
      )
      AND trace_summary->>'nodeKind' = split_part(executor_key, ':', 1)
      AND result_code = trace_summary->>'resultCode'
      AND length(trace_summary->>'resultCode') BETWEEN 1 AND 160
      AND trace_summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (
          outcome = 'completed'
          AND trace_summary->>'outcome' = 'terminal'
          AND trace_summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
        )
        OR (
          outcome = 'lease_expired'
          AND trace_summary->>'outcome' = 'lease_expired'
          AND trace_summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND trace_summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
        )
        OR (
          outcome = 'canceled'
          AND trace_summary->>'outcome' = 'canceled'
          AND trace_summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          AND trace_summary->>'resultCode' = 'FLOW_RUN_CANCELED'
        )
      )
    );

  ALTER TABLE flow_run_events
    DROP CONSTRAINT flow_run_events_summary_schema_check;
  ALTER TABLE flow_run_events ADD COLUMN command_id uuid;
  ALTER TABLE flow_run_events
    ADD CONSTRAINT flow_run_events_command_run_owner_fk
      FOREIGN KEY (command_id, flow_run_id, owner_user_id)
      REFERENCES flow_runtime_commands(id, resource_id, owner_user_id) ON DELETE CASCADE,
    ADD CONSTRAINT flow_run_events_summary_schema_check CHECK (
      summary ?& ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[]
      AND summary - ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[] = '{}'::jsonb
      AND jsonb_typeof(summary->'schemaVersion') = 'string'
      AND jsonb_typeof(summary->'outcome') = 'string'
      AND jsonb_typeof(summary->'nodeKind') = 'string'
      AND jsonb_typeof(summary->'reasonCode') = 'string'
      AND jsonb_typeof(summary->'resultCode') = 'string'
      AND summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND summary->>'nodeKind' IN (
        'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
        'astrologer_approval', 'completed', 'suppressed', 'failed'
      )
      AND length(summary->>'resultCode') BETWEEN 1 AND 160
      AND summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (
          event_type = 'run_completed'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'terminal'
          AND summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
        )
        OR (
          event_type = 'token_lease_expired'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'lease_expired'
          AND summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
        )
        OR (
          event_type = 'run_canceled'
          AND command_id IS NOT NULL
          AND summary->>'outcome' = 'canceled'
          AND summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          AND summary->>'resultCode' = 'FLOW_RUN_CANCELED'
        )
      )
    );

  ${flowRuntimeCommandIntegrityV1Sql}
  ${flowRunEventCommandIntegrityV1Sql}
`;

export const flowWorkItemSafetyBaselineDdl = `
  ALTER TABLE flow_runtime_commands ADD COLUMN flow_run_id uuid;

  DROP TRIGGER "flow_runtime_commands_immutable_identity" ON flow_runtime_commands;
  DROP TRIGGER "flow_runtime_command_outcome_consistency" ON flow_runtime_commands;
  DROP TRIGGER "flow_runtime_outcome_command_consistency" ON flow_runtime_command_outcomes;
  DROP TRIGGER "flow_runtime_command_outcomes_retention" ON flow_runtime_command_outcomes;

  UPDATE flow_runtime_commands
     SET flow_run_id = resource_id
   WHERE command_scope = 'flows.runtime.cancel.v1';

  ALTER TABLE flow_runtime_commands
    DROP CONSTRAINT flow_runtime_commands_scope_check,
    ADD CONSTRAINT flow_runtime_commands_id_run_owner_unique
      UNIQUE (id, flow_run_id, owner_user_id),
    ADD CONSTRAINT flow_runtime_commands_scope_check CHECK (
      api_surface = 'astrologer-api'
      AND route_template IN (
        '/flow-runs/:runId/cancel',
        '/flow-approvals/:approvalId/decision',
        '/flow-work-items/:workItemId/start',
        '/flow-work-items/:workItemId/snooze',
        '/flow-work-items/:workItemId/complete'
      )
      AND command_scope IN (
        'flows.runtime.cancel.v1',
        'flows.approvals.decide.v1',
        'flows.work-items.start.v1',
        'flows.work-items.snooze.v1',
        'flows.work-items.complete.v1'
      )
      AND (
        (route_template = '/flow-runs/:runId/cancel'
          AND command_scope = 'flows.runtime.cancel.v1'
          AND flow_run_id = resource_id)
        OR (route_template = '/flow-approvals/:approvalId/decision'
          AND command_scope = 'flows.approvals.decide.v1')
        OR (route_template = '/flow-work-items/:workItemId/start'
          AND command_scope = 'flows.work-items.start.v1')
        OR (route_template = '/flow-work-items/:workItemId/snooze'
          AND command_scope = 'flows.work-items.snooze.v1')
        OR (route_template = '/flow-work-items/:workItemId/complete'
          AND command_scope = 'flows.work-items.complete.v1')
      )
    ) NOT VALID;
  ALTER TABLE flow_runtime_commands
    VALIDATE CONSTRAINT flow_runtime_commands_scope_check;

  ${flowRuntimeCommandIntegritySql}

  ALTER TABLE flow_run_events
    ADD CONSTRAINT flow_run_events_id_run_owner_unique
      UNIQUE (id, flow_run_id, owner_user_id);

  CREATE TABLE flow_work_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    flow_run_id uuid NOT NULL,
    flow_version_id uuid NOT NULL,
    token_id uuid NOT NULL,
    node_activation_sequence bigint NOT NULL,
    node_id text NOT NULL,
    completion_handle text NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    task_kind text NOT NULL,
    title text NOT NULL,
    instructions text,
    assignee_user_id uuid NOT NULL,
    priority text DEFAULT 'normal' NOT NULL,
    due_at timestamptz,
    available_at timestamptz DEFAULT now() NOT NULL,
    snoozed_until timestamptz,
    revision integer DEFAULT 1 NOT NULL,
    result_summary text,
    last_command_id uuid,
    last_run_event_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    started_at timestamptz,
    completed_at timestamptz,
    completed_by_user_id uuid,
    expired_at timestamptz,
    canceled_at timestamptz,
    CONSTRAINT flow_work_items_status_check CHECK (
      status IN ('pending', 'in_progress', 'snoozed', 'completed', 'expired', 'canceled')
    ),
    CONSTRAINT flow_work_items_task_kind_check CHECK (
      task_kind IN ('consultation_preparation', 'birth_data_collection')
    ),
    CONSTRAINT flow_work_items_priority_check CHECK (
      priority IN ('low', 'normal', 'high', 'urgent')
    ),
    CONSTRAINT flow_work_items_node_check CHECK (
      node_activation_sequence > 0
      AND length(trim(node_id)) BETWEEN 1 AND 160
      AND node_id ~ '^[a-z0-9][a-z0-9_-]*$'
      AND completion_handle = 'success'
    ),
    CONSTRAINT flow_work_items_assignment_check CHECK (assignee_user_id = owner_user_id),
    CONSTRAINT flow_work_items_revision_check CHECK (revision > 0),
    CONSTRAINT flow_work_items_provenance_revision_check CHECK (
      (revision = 1 AND status = 'pending'
        AND last_command_id IS NULL AND last_run_event_id IS NULL)
      OR (revision > 1
        AND (last_command_id IS NULL) <> (last_run_event_id IS NULL))
    ),
    CONSTRAINT flow_work_items_content_check CHECK (
      length(trim(title)) BETWEEN 1 AND 180
      AND (instructions IS NULL OR length(trim(instructions)) BETWEEN 1 AND 4000)
      AND (result_summary IS NULL OR length(trim(result_summary)) BETWEEN 1 AND 1000)
      AND (status = 'completed' OR result_summary IS NULL)
    ),
    CONSTRAINT flow_work_items_lifecycle_check CHECK (
      (status = 'pending'
        AND snoozed_until IS NULL AND completed_at IS NULL
        AND completed_by_user_id IS NULL AND expired_at IS NULL AND canceled_at IS NULL)
      OR (status = 'in_progress'
        AND started_at IS NOT NULL AND snoozed_until IS NULL AND completed_at IS NULL
        AND completed_by_user_id IS NULL AND expired_at IS NULL AND canceled_at IS NULL)
      OR (status = 'snoozed'
        AND snoozed_until IS NOT NULL AND available_at = snoozed_until
        AND completed_at IS NULL AND completed_by_user_id IS NULL
        AND expired_at IS NULL AND canceled_at IS NULL)
      OR (status = 'completed'
        AND started_at IS NOT NULL AND completed_at IS NOT NULL
        AND snoozed_until IS NULL
        AND expired_at IS NULL AND canceled_at IS NULL)
      OR (status = 'expired'
        AND expired_at IS NOT NULL AND snoozed_until IS NULL
        AND completed_at IS NULL AND completed_by_user_id IS NULL AND canceled_at IS NULL)
      OR (status = 'canceled'
        AND canceled_at IS NOT NULL AND snoozed_until IS NULL
        AND completed_at IS NULL AND completed_by_user_id IS NULL AND expired_at IS NULL)
    ),
    CONSTRAINT flow_work_items_time_order_check CHECK (
      updated_at >= created_at
      AND available_at >= created_at
      AND (started_at IS NULL OR started_at >= created_at)
      AND (snoozed_until IS NULL OR snoozed_until >= updated_at)
      AND (completed_at IS NULL OR completed_at >= started_at)
      AND (expired_at IS NULL OR expired_at >= created_at)
      AND (canceled_at IS NULL OR canceled_at >= created_at)
    ),
    CONSTRAINT flow_work_items_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_work_items_assignee_user_id_users_id_fk
      FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT flow_work_items_completed_by_user_id_users_id_fk
      FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT flow_work_items_run_version_owner_fk
      FOREIGN KEY (flow_run_id, flow_version_id, owner_user_id)
      REFERENCES flow_runs(id, flow_version_id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT flow_work_items_token_run_owner_fk
      FOREIGN KEY (token_id, flow_run_id, owner_user_id)
      REFERENCES flow_execution_tokens(id, flow_run_id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT flow_work_items_last_command_run_owner_fk
      FOREIGN KEY (last_command_id, flow_run_id, owner_user_id)
      REFERENCES flow_runtime_commands(id, flow_run_id, owner_user_id) ON DELETE RESTRICT,
    CONSTRAINT flow_work_items_last_run_event_run_owner_fk
      FOREIGN KEY (last_run_event_id, flow_run_id, owner_user_id)
      REFERENCES flow_run_events(id, flow_run_id, owner_user_id) ON DELETE RESTRICT,
    CONSTRAINT flow_work_items_id_run_owner_unique
      UNIQUE (id, flow_run_id, owner_user_id)
  );

  CREATE UNIQUE INDEX flow_work_items_token_activation_unique
    ON flow_work_items (token_id, node_activation_sequence);
  CREATE INDEX flow_work_items_owner_status_available_idx
    ON flow_work_items (owner_user_id, status, available_at, created_at, id);
  CREATE INDEX flow_work_items_run_created_idx
    ON flow_work_items (flow_run_id, created_at, id);

  ${flowWorkItemCoreIntegritySql}
  DROP TRIGGER IF EXISTS "flow_run_event_command_consistency" ON flow_run_events;
  ${flowRunEventCommandIntegritySql}
  ${flowWorkItemEventIntegritySql}
`;

export const flowWorkItemWakeSafetyBaselineDdl = `
  DROP TRIGGER "flow_work_items_transition_guard" ON flow_work_items;
  DROP TRIGGER "flow_work_items_truncate_guard" ON flow_work_items;
  DROP TRIGGER "flow_work_items_command_consistency" ON flow_work_items;
  DROP TRIGGER "flow_runtime_commands_work_item_consistency" ON flow_runtime_commands;

  ALTER TABLE flow_run_events
    ADD CONSTRAINT flow_run_events_id_run_owner_unique
      UNIQUE (id, flow_run_id, owner_user_id);

  ALTER TABLE flow_work_items
    DROP CONSTRAINT flow_work_items_command_revision_check,
    ADD COLUMN last_run_event_id uuid,
    ADD CONSTRAINT flow_work_items_last_run_event_run_owner_fk
      FOREIGN KEY (last_run_event_id, flow_run_id, owner_user_id)
      REFERENCES flow_run_events(id, flow_run_id, owner_user_id)
      ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT flow_work_items_id_run_owner_unique
      UNIQUE (id, flow_run_id, owner_user_id),
    ADD CONSTRAINT flow_work_items_provenance_revision_check CHECK (
      (revision = 1 AND status = 'pending'
        AND last_command_id IS NULL AND last_run_event_id IS NULL)
      OR (revision > 1
        AND (last_command_id IS NULL) <> (last_run_event_id IS NULL))
    ) NOT VALID;

  ALTER TABLE flow_work_items
    VALIDATE CONSTRAINT flow_work_items_last_run_event_run_owner_fk;
  ALTER TABLE flow_work_items
    VALIDATE CONSTRAINT flow_work_items_provenance_revision_check;

  ${flowWorkItemCoreIntegritySql}
`;

export const flowWorkItemBookingDeadlineSafetyBaselineDdl = `
  DROP TRIGGER "flow_work_items_transition_guard" ON flow_work_items;
  DROP TRIGGER "flow_work_items_truncate_guard" ON flow_work_items;
  DROP TRIGGER "flow_work_items_command_consistency" ON flow_work_items;
  DROP TRIGGER "flow_runtime_commands_work_item_consistency" ON flow_runtime_commands;

  ALTER TABLE flow_work_items
    ADD COLUMN due_policy_kind text NOT NULL,
    ADD COLUMN due_lead_time_minutes integer,
    ADD COLUMN due_booking_lifecycle_revision integer,
    ADD CONSTRAINT flow_work_items_due_policy_check CHECK (
      (due_policy_kind = 'none'
        AND due_lead_time_minutes IS NULL
        AND due_booking_lifecycle_revision IS NULL
        AND due_at IS NULL)
      OR (due_policy_kind = 'before_booking_start'
        AND due_lead_time_minutes BETWEEN 0 AND 525600
        AND due_booking_lifecycle_revision > 0
        AND due_at IS NOT NULL)
    ) NOT VALID;
  ALTER TABLE flow_work_items
    VALIDATE CONSTRAINT flow_work_items_due_policy_check;

  ${flowWorkItemCoreIntegritySql}
`;

export const flowOutboxSafetyBaselineDdl = `
  ALTER TABLE outbox_events
    ADD COLUMN claim_fence bigint DEFAULT 0 NOT NULL,
    ADD COLUMN quarantined_at timestamptz,
    ADD COLUMN quarantine_reason_code text;

  ALTER TABLE outbox_events
    DROP CONSTRAINT outbox_events_pending_not_published_check,
    DROP CONSTRAINT outbox_events_publishing_locked_check,
    DROP CONSTRAINT outbox_events_published_at_check,
    DROP CONSTRAINT outbox_events_status_check,
    ADD CONSTRAINT outbox_events_status_check CHECK (
      status IN ('pending', 'publishing', 'published', 'quarantined')
    ) NOT VALID,
    ADD CONSTRAINT outbox_events_claim_fence_check CHECK (
      claim_fence >= 0
    ) NOT VALID,
    ADD CONSTRAINT outbox_events_quarantine_reason_code_check CHECK (
      quarantine_reason_code IS NULL OR (
        length(quarantine_reason_code) BETWEEN 3 AND 120
        AND quarantine_reason_code ~ '^[A-Z][A-Z0-9_]+$'
      )
    ) NOT VALID,
    ADD CONSTRAINT outbox_events_state_check CHECK (
      (
        status = 'pending'
        AND locked_at IS NULL
        AND published_at IS NULL
        AND quarantined_at IS NULL
        AND quarantine_reason_code IS NULL
      ) OR (
        status = 'publishing'
        AND locked_at IS NOT NULL
        AND published_at IS NULL
        AND quarantined_at IS NULL
        AND quarantine_reason_code IS NULL
      ) OR (
        status = 'published'
        AND locked_at IS NULL
        AND published_at IS NOT NULL
        AND quarantined_at IS NULL
        AND quarantine_reason_code IS NULL
      ) OR (
        status = 'quarantined'
        AND locked_at IS NULL
        AND published_at IS NULL
        AND quarantined_at IS NOT NULL
        AND quarantine_reason_code IS NOT NULL
      )
    ) NOT VALID;

  ALTER TABLE outbox_events
    VALIDATE CONSTRAINT outbox_events_status_check;
  ALTER TABLE outbox_events
    VALIDATE CONSTRAINT outbox_events_claim_fence_check;
  ALTER TABLE outbox_events
    VALIDATE CONSTRAINT outbox_events_quarantine_reason_code_check;
  ALTER TABLE outbox_events
    VALIDATE CONSTRAINT outbox_events_state_check;

  CREATE INDEX outbox_events_quarantined_index
    ON outbox_events (event_type, quarantined_at, id)
    WHERE status = 'quarantined';
`;

export const flowExecutionRetrySafetyBaselineDdl = `
  ALTER TABLE flow_execution_tokens
    ADD COLUMN retry_policy_key text DEFAULT 'flow-execution-retry.v1' NOT NULL,
    ADD COLUMN max_attempts integer DEFAULT 3 NOT NULL,
    ADD COLUMN retry_base_delay_ms integer DEFAULT 1000 NOT NULL,
    ADD COLUMN retry_max_delay_ms integer DEFAULT 60000 NOT NULL,
    ADD COLUMN failure_disposition text,
    ADD COLUMN failure_reason_code text,
    ADD COLUMN quarantined_at timestamptz;

  ALTER TABLE flow_execution_tokens
    DROP CONSTRAINT flow_execution_tokens_attempt_counter_check,
    DROP CONSTRAINT flow_execution_tokens_fencing_token_check,
    DROP CONSTRAINT flow_execution_tokens_lease_state_check,
    ADD CONSTRAINT flow_execution_tokens_attempt_counter_check CHECK (
      attempt_counter BETWEEN 0 AND max_attempts
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_fencing_token_check CHECK (
      fencing_token >= attempt_counter
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_lease_state_check CHECK (
      (
        state = 'claimed'
        AND claimed_at IS NOT NULL
        AND lease_owner IS NOT NULL
        AND lease_expires_at IS NOT NULL
        AND claimed_at <= lease_expires_at
        AND claimed_at <= updated_at
      ) OR (
        state <> 'claimed'
        AND claimed_at IS NULL
        AND lease_owner IS NULL
        AND lease_expires_at IS NULL
      )
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_counter_state_check CHECK (
      (state NOT IN ('runnable', 'retry_scheduled') OR attempt_counter < max_attempts)
      AND (state NOT IN ('claimed', 'retry_scheduled') OR attempt_counter > 0)
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_node_kind_check CHECK (
      node_kind IN (
        'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
        'astrologer_approval', 'completed', 'suppressed', 'failed'
      )
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_retry_policy_check CHECK (
      retry_policy_key = 'flow-execution-retry.v1'
      AND max_attempts = 3
      AND retry_base_delay_ms = 1000
      AND retry_max_delay_ms = 60000
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_failure_disposition_check CHECK (
      failure_disposition IS NULL
      OR failure_disposition IN ('retry_scheduled', 'failed_terminal', 'quarantined')
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_failure_reason_check CHECK (
      failure_reason_code IS NULL
      OR failure_reason_code IN (
        'FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID',
        'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH',
        'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID',
        'FLOW_RUNTIME_TRACE_INVALID',
        'FLOW_NODE_EXECUTOR_UNAVAILABLE', 'FLOW_NODE_EXECUTION_REJECTED',
        'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE',
        'FLOW_TOKEN_LEASE_EXPIRED'
      )
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_failure_state_check CHECK (
      (
        state = 'retry_scheduled'
        AND failure_disposition IS NOT NULL
        AND failure_disposition = 'retry_scheduled'
        AND failure_reason_code IS NOT NULL
        AND failure_reason_code IN (
          'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE',
          'FLOW_TOKEN_LEASE_EXPIRED'
        )
        AND quarantined_at IS NULL
      ) OR (
        state = 'failed'
        AND failure_disposition IS NOT NULL
        AND failure_reason_code IS NOT NULL
        AND (
          (
            failure_disposition = 'quarantined'
            AND failure_reason_code IN (
              'FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID',
              'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH',
              'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID',
              'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE'
            )
            AND quarantined_at IS NOT NULL
          ) OR (
            failure_disposition = 'failed_terminal'
            AND failure_reason_code IN (
              'FLOW_NODE_EXECUTION_REJECTED', 'FLOW_NODE_EXECUTION_RETRYABLE',
              'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE', 'FLOW_TOKEN_LEASE_EXPIRED'
            )
            AND quarantined_at IS NULL
          )
        )
      ) OR (
        state NOT IN ('retry_scheduled', 'failed')
        AND failure_disposition IS NULL
        AND failure_reason_code IS NULL
        AND quarantined_at IS NULL
      )
    ) NOT VALID;

  ALTER TABLE flow_execution_attempts
    DROP CONSTRAINT flow_execution_attempts_number_check,
    DROP CONSTRAINT flow_execution_attempts_trace_summary_schema_check,
    ADD CONSTRAINT flow_execution_attempts_number_check CHECK (
      attempt_number BETWEEN 1 AND 3
      AND fencing_token >= attempt_number
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_attempts_trace_summary_schema_check CHECK (
      trace_summary ?& ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[]
      AND trace_summary - ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[] = '{}'::jsonb
      AND jsonb_typeof(trace_summary->'schemaVersion') = 'string'
      AND jsonb_typeof(trace_summary->'outcome') = 'string'
      AND jsonb_typeof(trace_summary->'nodeKind') = 'string'
      AND jsonb_typeof(trace_summary->'reasonCode') = 'string'
      AND jsonb_typeof(trace_summary->'resultCode') = 'string'
      AND trace_summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND trace_summary->>'nodeKind' IN (
        'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
        'astrologer_approval', 'completed', 'suppressed', 'failed'
      )
      AND trace_summary->>'nodeKind' = split_part(executor_key, ':', 1)
      AND result_code = trace_summary->>'resultCode'
      AND length(trace_summary->>'resultCode') BETWEEN 1 AND 160
      AND trace_summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (
          outcome = 'completed'
          AND trace_summary->>'outcome' = 'terminal'
          AND trace_summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
        ) OR (
          outcome = 'lease_expired'
          AND trace_summary->>'outcome' = 'lease_expired'
          AND trace_summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND trace_summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
        ) OR (
          outcome = 'canceled'
          AND trace_summary->>'outcome' = 'canceled'
          AND trace_summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          AND trace_summary->>'resultCode' = 'FLOW_RUN_CANCELED'
        ) OR (
          outcome = 'retry_scheduled'
          AND trace_summary->>'outcome' = 'retry_scheduled'
          AND trace_summary->>'reasonCode' IN (
            'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE'
          )
          AND trace_summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
        ) OR (
          outcome = 'failed'
          AND trace_summary->>'outcome' = 'failed'
          AND (
            (
              trace_summary->>'reasonCode' IN (
                'FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID',
                'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH',
                'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID',
                'FLOW_RUNTIME_TRACE_INVALID',
                'FLOW_NODE_EXECUTOR_UNAVAILABLE', 'FLOW_NODE_EXECUTION_REJECTED'
              )
              AND trace_summary->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
            ) OR (
              trace_summary->>'reasonCode' IN (
                'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE',
                'FLOW_TOKEN_LEASE_EXPIRED'
              )
              AND trace_summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
            )
          )
        )
      )
    ) NOT VALID;

  ALTER TABLE flow_run_events
    DROP CONSTRAINT flow_run_events_summary_schema_check,
    ADD CONSTRAINT flow_run_events_summary_schema_check CHECK (
      summary ?& ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[]
      AND summary - ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[] = '{}'::jsonb
      AND jsonb_typeof(summary->'schemaVersion') = 'string'
      AND jsonb_typeof(summary->'outcome') = 'string'
      AND jsonb_typeof(summary->'nodeKind') = 'string'
      AND jsonb_typeof(summary->'reasonCode') = 'string'
      AND jsonb_typeof(summary->'resultCode') = 'string'
      AND summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND summary->>'nodeKind' IN (
        'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
        'astrologer_approval', 'completed', 'suppressed', 'failed'
      )
      AND length(summary->>'resultCode') BETWEEN 1 AND 160
      AND summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (
          event_type = 'run_completed'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'terminal'
          AND summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
        ) OR (
          event_type = 'token_lease_expired'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'lease_expired'
          AND summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
        ) OR (
          event_type = 'run_canceled'
          AND command_id IS NOT NULL
          AND summary->>'outcome' = 'canceled'
          AND summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          AND summary->>'resultCode' = 'FLOW_RUN_CANCELED'
        ) OR (
          event_type = 'token_retry_scheduled'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'retry_scheduled'
          AND summary->>'reasonCode' IN (
            'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE'
          )
          AND summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
        ) OR (
          event_type = 'run_failed'
          AND command_id IS NULL
          AND summary->>'outcome' = 'failed'
          AND (
            (
              summary->>'reasonCode' IN (
                'FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID',
                'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH',
                'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID',
                'FLOW_RUNTIME_TRACE_INVALID',
                'FLOW_NODE_EXECUTOR_UNAVAILABLE', 'FLOW_NODE_EXECUTION_REJECTED'
              )
              AND summary->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
            ) OR (
              summary->>'reasonCode' IN (
                'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE',
                'FLOW_TOKEN_LEASE_EXPIRED'
              )
              AND summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
            )
          )
        )
      )
    ) NOT VALID;

  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_attempt_counter_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_fencing_token_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_lease_state_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_counter_state_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_node_kind_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_retry_policy_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_failure_disposition_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_failure_reason_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_failure_state_check;
  ALTER TABLE flow_execution_attempts
    VALIDATE CONSTRAINT flow_execution_attempts_number_check;
  ALTER TABLE flow_execution_attempts
    VALIDATE CONSTRAINT flow_execution_attempts_trace_summary_schema_check;
  ALTER TABLE flow_run_events
    VALIDATE CONSTRAINT flow_run_events_summary_schema_check;

  CREATE INDEX flow_execution_tokens_quarantined_idx
    ON flow_execution_tokens (failure_disposition, quarantined_at, id);
`;

export const flowExecutionAtomicAdvanceBaselineDdl = `
  ALTER TABLE flow_execution_tokens
    ADD COLUMN node_activation_sequence bigint DEFAULT 1 NOT NULL;

  ALTER TABLE flow_execution_attempts
    ADD COLUMN node_activation_sequence bigint DEFAULT 1 NOT NULL;
  ALTER TABLE flow_execution_attempts
    ALTER COLUMN node_activation_sequence DROP DEFAULT;

  ALTER TABLE flow_execution_tokens
    DROP CONSTRAINT flow_execution_tokens_node_kind_check,
    ADD CONSTRAINT flow_execution_tokens_node_kind_check CHECK (
      node_kind IN (
        'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
        'completed', 'suppressed', 'failed'
      )
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_node_activation_sequence_check CHECK (
      node_activation_sequence > 0
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_completed_node_check CHECK (
      state <> 'completed' OR node_kind = 'completed'
    ) NOT VALID;

  ALTER TABLE flow_execution_attempts
    DROP CONSTRAINT flow_execution_attempts_outcome_check,
    DROP CONSTRAINT flow_execution_attempts_trace_summary_schema_check,
    ADD CONSTRAINT flow_execution_attempts_node_activation_sequence_check CHECK (
      node_activation_sequence > 0
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_attempts_outcome_check CHECK (
      outcome IN (
        'advanced', 'waiting', 'retry_scheduled', 'completed', 'failed',
        'lease_expired', 'canceled'
      )
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_attempts_trace_summary_schema_check CHECK (
      trace_summary ?& ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[]
      AND (
        (
          outcome = 'advanced'
          AND trace_summary ?& ARRAY[
            'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
          ]::text[]
          AND jsonb_typeof(trace_summary->'sourceHandle') = 'string'
          AND jsonb_typeof(trace_summary->'selectedEdgeId') = 'string'
          AND jsonb_typeof(trace_summary->'targetNodeId') = 'string'
          AND jsonb_typeof(trace_summary->'targetNodeKind') = 'string'
          AND trace_summary - ARRAY[
            'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
            'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
          ]::text[] = '{}'::jsonb
        ) OR (
          outcome <> 'advanced'
          AND trace_summary - ARRAY[
            'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
          ]::text[] = '{}'::jsonb
        )
      )
      AND jsonb_typeof(trace_summary->'schemaVersion') = 'string'
      AND jsonb_typeof(trace_summary->'outcome') = 'string'
      AND jsonb_typeof(trace_summary->'nodeKind') = 'string'
      AND jsonb_typeof(trace_summary->'reasonCode') = 'string'
      AND jsonb_typeof(trace_summary->'resultCode') = 'string'
      AND trace_summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND trace_summary->>'nodeKind' IN (
        'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
        'completed', 'suppressed', 'failed'
      )
      AND trace_summary->>'nodeKind' = split_part(executor_key, ':', 1)
      AND result_code = trace_summary->>'resultCode'
      AND length(trace_summary->>'resultCode') BETWEEN 1 AND 160
      AND trace_summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (
          outcome = 'advanced'
          AND trace_summary->>'outcome' = 'advanced'
          AND trace_summary->>'reasonCode' = 'FLOW_EDGE_SELECTED'
          AND trace_summary->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
          AND trace_summary->>'sourceHandle' IN (
            'next', 'true', 'false', 'success', 'error', 'timeout', 'approved', 'rejected'
          )
          AND trace_summary->>'targetNodeKind' IN (
            'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
            'completed', 'suppressed', 'failed'
          )
          AND length(trace_summary->>'selectedEdgeId') BETWEEN 1 AND 160
          AND trace_summary->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
          AND length(trace_summary->>'targetNodeId') BETWEEN 1 AND 160
          AND trace_summary->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        ) OR (
          outcome = 'completed'
          AND trace_summary->>'nodeKind' = 'completed'
          AND trace_summary->>'outcome' = 'terminal'
          AND trace_summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
        ) OR (
          outcome = 'lease_expired'
          AND trace_summary->>'outcome' = 'lease_expired'
          AND trace_summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND trace_summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
        ) OR (
          outcome = 'canceled'
          AND trace_summary->>'outcome' = 'canceled'
          AND trace_summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          AND trace_summary->>'resultCode' = 'FLOW_RUN_CANCELED'
        ) OR (
          outcome = 'retry_scheduled'
          AND trace_summary->>'outcome' = 'retry_scheduled'
          AND trace_summary->>'reasonCode' IN (
            'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE'
          )
          AND trace_summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
        ) OR (
          outcome = 'failed'
          AND trace_summary->>'outcome' = 'failed'
          AND (
            (
              trace_summary->>'reasonCode' IN (
                'FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID',
                'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH',
                'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID',
                'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE',
                'FLOW_NODE_EXECUTION_REJECTED'
              )
              AND trace_summary->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
            ) OR (
              trace_summary->>'reasonCode' IN (
                'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE',
                'FLOW_TOKEN_LEASE_EXPIRED'
              )
              AND trace_summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
            )
          )
        )
      )
    ) NOT VALID;

  ALTER TABLE flow_run_events
    DROP CONSTRAINT flow_run_events_type_check,
    DROP CONSTRAINT flow_run_events_summary_schema_check,
    ADD CONSTRAINT flow_run_events_type_check CHECK (
      event_type IN (
        'token_advanced', 'token_waiting', 'token_retry_scheduled', 'token_lease_expired',
        'run_completed', 'run_failed', 'run_suppressed', 'run_canceled'
      )
    ) NOT VALID,
    ADD CONSTRAINT flow_run_events_summary_schema_check CHECK (
      summary ?& ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[]
      AND (
        (
          event_type = 'token_advanced'
          AND summary ?& ARRAY[
            'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
          ]::text[]
          AND jsonb_typeof(summary->'sourceHandle') = 'string'
          AND jsonb_typeof(summary->'selectedEdgeId') = 'string'
          AND jsonb_typeof(summary->'targetNodeId') = 'string'
          AND jsonb_typeof(summary->'targetNodeKind') = 'string'
          AND summary - ARRAY[
            'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
            'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
          ]::text[] = '{}'::jsonb
        ) OR (
          event_type <> 'token_advanced'
          AND summary - ARRAY[
            'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
          ]::text[] = '{}'::jsonb
        )
      )
      AND jsonb_typeof(summary->'schemaVersion') = 'string'
      AND jsonb_typeof(summary->'outcome') = 'string'
      AND jsonb_typeof(summary->'nodeKind') = 'string'
      AND jsonb_typeof(summary->'reasonCode') = 'string'
      AND jsonb_typeof(summary->'resultCode') = 'string'
      AND summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND summary->>'nodeKind' IN (
        'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
        'completed', 'suppressed', 'failed'
      )
      AND length(summary->>'resultCode') BETWEEN 1 AND 160
      AND summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (
          event_type = 'token_advanced'
          AND node_id IS NOT NULL
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'advanced'
          AND summary->>'reasonCode' = 'FLOW_EDGE_SELECTED'
          AND summary->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
          AND summary->>'sourceHandle' IN (
            'next', 'true', 'false', 'success', 'error', 'timeout', 'approved', 'rejected'
          )
          AND summary->>'targetNodeKind' IN (
            'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
            'completed', 'suppressed', 'failed'
          )
          AND length(summary->>'selectedEdgeId') BETWEEN 1 AND 160
          AND summary->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
          AND length(summary->>'targetNodeId') BETWEEN 1 AND 160
          AND summary->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        ) OR (
          event_type = 'run_completed'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'nodeKind' = 'completed'
          AND summary->>'outcome' = 'terminal'
          AND summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
        ) OR (
          event_type = 'token_lease_expired'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'lease_expired'
          AND summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
        ) OR (
          event_type = 'run_canceled'
          AND command_id IS NOT NULL
          AND summary->>'outcome' = 'canceled'
          AND summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          AND summary->>'resultCode' = 'FLOW_RUN_CANCELED'
        ) OR (
          event_type = 'token_retry_scheduled'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'retry_scheduled'
          AND summary->>'reasonCode' IN (
            'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE'
          )
          AND summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
        ) OR (
          event_type = 'run_failed'
          AND command_id IS NULL
          AND summary->>'outcome' = 'failed'
          AND (
            (
              summary->>'reasonCode' IN (
                'FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID',
                'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH',
                'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID',
                'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE',
                'FLOW_NODE_EXECUTION_REJECTED'
              )
              AND summary->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
            ) OR (
              summary->>'reasonCode' IN (
                'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE',
                'FLOW_TOKEN_LEASE_EXPIRED'
              )
              AND summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
            )
          )
        )
      )
    ) NOT VALID;

  DROP INDEX flow_execution_attempts_token_attempt_unique;
  CREATE UNIQUE INDEX flow_execution_attempts_token_activation_attempt_unique
    ON flow_execution_attempts (token_id, node_activation_sequence, attempt_number);
  CREATE UNIQUE INDEX flow_run_events_attempt_unique
    ON flow_run_events (attempt_id)
    WHERE attempt_id IS NOT NULL;

  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_node_kind_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_node_activation_sequence_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_completed_node_check;
  ALTER TABLE flow_execution_attempts
    VALIDATE CONSTRAINT flow_execution_attempts_node_activation_sequence_check;
  ALTER TABLE flow_execution_attempts
    VALIDATE CONSTRAINT flow_execution_attempts_outcome_check;
  ALTER TABLE flow_execution_attempts
    VALIDATE CONSTRAINT flow_execution_attempts_trace_summary_schema_check;
  ALTER TABLE flow_run_events
    VALIDATE CONSTRAINT flow_run_events_type_check;
  ALTER TABLE flow_run_events
    VALIDATE CONSTRAINT flow_run_events_summary_schema_check;
`;

export const flowExecutionManifestV2SafetyBaselineDdl = `
  ALTER TABLE flow_execution_tokens
    DROP CONSTRAINT flow_execution_tokens_node_kind_check,
    ADD CONSTRAINT flow_execution_tokens_node_kind_check CHECK (
      node_kind IN (
        'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
        'completed', 'suppressed', 'failed'
      )
    ) NOT VALID,
    ADD CONSTRAINT flow_execution_tokens_completed_node_check CHECK (
      state <> 'completed' OR node_kind = 'completed'
    ) NOT VALID;

  ALTER TABLE flow_execution_attempts
    DROP CONSTRAINT flow_execution_attempts_trace_summary_schema_check,
    ADD CONSTRAINT flow_execution_attempts_trace_summary_schema_check CHECK (
      trace_summary ?& ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[]
      AND (
        (
          outcome = 'advanced'
          AND trace_summary ?& ARRAY[
            'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
          ]::text[]
          AND jsonb_typeof(trace_summary->'sourceHandle') = 'string'
          AND jsonb_typeof(trace_summary->'selectedEdgeId') = 'string'
          AND jsonb_typeof(trace_summary->'targetNodeId') = 'string'
          AND jsonb_typeof(trace_summary->'targetNodeKind') = 'string'
          AND trace_summary - ARRAY[
            'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
            'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
          ]::text[] = '{}'::jsonb
        ) OR (
          outcome <> 'advanced'
          AND trace_summary - ARRAY[
            'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
          ]::text[] = '{}'::jsonb
        )
      )
      AND jsonb_typeof(trace_summary->'schemaVersion') = 'string'
      AND jsonb_typeof(trace_summary->'outcome') = 'string'
      AND jsonb_typeof(trace_summary->'nodeKind') = 'string'
      AND jsonb_typeof(trace_summary->'reasonCode') = 'string'
      AND jsonb_typeof(trace_summary->'resultCode') = 'string'
      AND trace_summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND trace_summary->>'nodeKind' IN (
        'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
        'completed', 'suppressed', 'failed'
      )
      AND trace_summary->>'nodeKind' = split_part(executor_key, ':', 1)
      AND result_code = trace_summary->>'resultCode'
      AND length(trace_summary->>'resultCode') BETWEEN 1 AND 160
      AND trace_summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (
          outcome = 'advanced'
          AND trace_summary->>'outcome' = 'advanced'
          AND trace_summary->>'reasonCode' = 'FLOW_EDGE_SELECTED'
          AND trace_summary->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
          AND trace_summary->>'sourceHandle' IN (
            'next', 'true', 'false', 'success', 'error', 'timeout', 'approved', 'rejected'
          )
          AND trace_summary->>'targetNodeKind' IN (
            'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
            'completed', 'suppressed', 'failed'
          )
          AND length(trace_summary->>'selectedEdgeId') BETWEEN 1 AND 160
          AND trace_summary->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
          AND length(trace_summary->>'targetNodeId') BETWEEN 1 AND 160
          AND trace_summary->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        ) OR (
          outcome = 'completed'
          AND trace_summary->>'nodeKind' = 'completed'
          AND trace_summary->>'outcome' = 'terminal'
          AND trace_summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
        ) OR (
          outcome = 'lease_expired'
          AND trace_summary->>'outcome' = 'lease_expired'
          AND trace_summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND trace_summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
        ) OR (
          outcome = 'canceled'
          AND trace_summary->>'outcome' = 'canceled'
          AND trace_summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          AND trace_summary->>'resultCode' = 'FLOW_RUN_CANCELED'
        ) OR (
          outcome = 'retry_scheduled'
          AND trace_summary->>'outcome' = 'retry_scheduled'
          AND trace_summary->>'reasonCode' IN (
            'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE'
          )
          AND trace_summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
        ) OR (
          outcome = 'failed'
          AND trace_summary->>'outcome' = 'failed'
          AND (
            (
              trace_summary->>'reasonCode' IN (
                'FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID',
                'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH',
                'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID',
                'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE',
                'FLOW_NODE_EXECUTION_REJECTED'
              )
              AND trace_summary->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
            ) OR (
              trace_summary->>'reasonCode' IN (
                'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE',
                'FLOW_TOKEN_LEASE_EXPIRED'
              )
              AND trace_summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
            )
          )
        )
      )
    ) NOT VALID;

  ALTER TABLE flow_run_events
    DROP CONSTRAINT flow_run_events_summary_schema_check,
    ADD CONSTRAINT flow_run_events_summary_schema_check CHECK (
      summary ?& ARRAY[
        'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
      ]::text[]
      AND (
        (
          event_type = 'token_advanced'
          AND summary ?& ARRAY[
            'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
          ]::text[]
          AND jsonb_typeof(summary->'sourceHandle') = 'string'
          AND jsonb_typeof(summary->'selectedEdgeId') = 'string'
          AND jsonb_typeof(summary->'targetNodeId') = 'string'
          AND jsonb_typeof(summary->'targetNodeKind') = 'string'
          AND summary - ARRAY[
            'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
            'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
          ]::text[] = '{}'::jsonb
        ) OR (
          event_type <> 'token_advanced'
          AND summary - ARRAY[
            'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
          ]::text[] = '{}'::jsonb
        )
      )
      AND jsonb_typeof(summary->'schemaVersion') = 'string'
      AND jsonb_typeof(summary->'outcome') = 'string'
      AND jsonb_typeof(summary->'nodeKind') = 'string'
      AND jsonb_typeof(summary->'reasonCode') = 'string'
      AND jsonb_typeof(summary->'resultCode') = 'string'
      AND summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND summary->>'nodeKind' IN (
        'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
        'completed', 'suppressed', 'failed'
      )
      AND length(summary->>'resultCode') BETWEEN 1 AND 160
      AND summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (
          event_type = 'token_advanced'
          AND node_id IS NOT NULL
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'advanced'
          AND summary->>'reasonCode' = 'FLOW_EDGE_SELECTED'
          AND summary->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
          AND summary->>'sourceHandle' IN (
            'next', 'true', 'false', 'success', 'error', 'timeout', 'approved', 'rejected'
          )
          AND summary->>'targetNodeKind' IN (
            'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
            'completed', 'suppressed', 'failed'
          )
          AND length(summary->>'selectedEdgeId') BETWEEN 1 AND 160
          AND summary->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
          AND length(summary->>'targetNodeId') BETWEEN 1 AND 160
          AND summary->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        ) OR (
          event_type = 'run_completed'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'nodeKind' = 'completed'
          AND summary->>'outcome' = 'terminal'
          AND summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
        ) OR (
          event_type = 'token_lease_expired'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'lease_expired'
          AND summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
        ) OR (
          event_type = 'run_canceled'
          AND command_id IS NOT NULL
          AND summary->>'outcome' = 'canceled'
          AND summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          AND summary->>'resultCode' = 'FLOW_RUN_CANCELED'
        ) OR (
          event_type = 'token_retry_scheduled'
          AND attempt_id IS NOT NULL
          AND command_id IS NULL
          AND summary->>'outcome' = 'retry_scheduled'
          AND summary->>'reasonCode' IN (
            'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE'
          )
          AND summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
        ) OR (
          event_type = 'run_failed'
          AND command_id IS NULL
          AND summary->>'outcome' = 'failed'
          AND (
            (
              summary->>'reasonCode' IN (
                'FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID',
                'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH',
                'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID',
                'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE',
                'FLOW_NODE_EXECUTION_REJECTED'
              )
              AND summary->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
            ) OR (
              summary->>'reasonCode' IN (
                'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE',
                'FLOW_TOKEN_LEASE_EXPIRED'
              )
              AND summary->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
            )
          )
        )
      )
    ) NOT VALID;

  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_node_kind_check;
  ALTER TABLE flow_execution_tokens
    VALIDATE CONSTRAINT flow_execution_tokens_completed_node_check;
  ALTER TABLE flow_execution_attempts
    VALIDATE CONSTRAINT flow_execution_attempts_trace_summary_schema_check;
  ALTER TABLE flow_run_events
    VALIDATE CONSTRAINT flow_run_events_summary_schema_check;
`;

export const flowExecutionClaimAuthorityEvidenceBaselineDdl = `
ALTER TABLE flow_execution_tokens
  ADD COLUMN claim_control_policy_revision integer,
  ADD COLUMN claim_policy_digest varchar(71),
  ADD COLUMN claim_worker_session_id uuid,
  ADD COLUMN claim_worker_registration_digest varchar(71);

ALTER TABLE flow_execution_attempts
  ADD COLUMN control_policy_revision integer,
  ADD COLUMN policy_digest varchar(71),
  ADD COLUMN worker_session_id uuid,
  ADD COLUMN worker_registration_digest varchar(71);

ALTER TABLE flow_execution_tokens
  ADD CONSTRAINT flow_execution_tokens_claim_policy_fk
  FOREIGN KEY (claim_control_policy_revision)
  REFERENCES flow_runtime_rollout_policy_versions(revision)
  ON DELETE RESTRICT;

ALTER TABLE flow_execution_attempts
  ADD CONSTRAINT flow_execution_attempts_claim_policy_fk
  FOREIGN KEY (control_policy_revision)
  REFERENCES flow_runtime_rollout_policy_versions(revision)
  ON DELETE RESTRICT;

ALTER TABLE flow_execution_tokens
  ADD CONSTRAINT flow_execution_tokens_claim_authority_check CHECK (
    (
      claim_control_policy_revision IS NULL
      AND claim_policy_digest IS NULL
      AND claim_worker_session_id IS NULL
      AND claim_worker_registration_digest IS NULL
    ) OR (
      claim_control_policy_revision > 0
      AND claim_policy_digest ~ '^sha256:[a-f0-9]{64}$'
      AND claim_worker_session_id IS NOT NULL
      AND claim_worker_registration_digest ~ '^sha256:[a-f0-9]{64}$'
      AND (state <> 'claimed' OR lease_owner = claim_worker_session_id::text)
    )
  ) NOT VALID;

ALTER TABLE flow_execution_attempts
  ADD CONSTRAINT flow_execution_attempts_claim_authority_check CHECK (
    (
      control_policy_revision IS NULL
      AND policy_digest IS NULL
      AND worker_session_id IS NULL
      AND worker_registration_digest IS NULL
    ) OR (
      control_policy_revision > 0
      AND policy_digest ~ '^sha256:[a-f0-9]{64}$'
      AND worker_session_id IS NOT NULL
      AND worker_registration_digest ~ '^sha256:[a-f0-9]{64}$'
      AND lease_owner = worker_session_id::text
    )
  ) NOT VALID;

ALTER TABLE flow_execution_tokens
  VALIDATE CONSTRAINT flow_execution_tokens_claim_authority_check;
ALTER TABLE flow_execution_attempts
  VALIDATE CONSTRAINT flow_execution_attempts_claim_authority_check;
`;

export const flowExecutionEnrollmentTraceSafetyBaselineDdl = `
DROP TRIGGER "flow_run_event_command_consistency" ON flow_run_events;
ALTER TABLE flow_run_events
  DROP CONSTRAINT flow_run_events_command_run_owner_fk;
CREATE UNIQUE INDEX flow_run_events_command_unique
  ON flow_run_events (command_id) WHERE command_id IS NOT NULL;
ALTER TABLE flow_run_events
  ADD CONSTRAINT flow_run_events_command_run_owner_fk
  FOREIGN KEY (command_id, flow_run_id, owner_user_id)
  REFERENCES flow_runtime_commands(id, flow_run_id, owner_user_id)
  ON DELETE CASCADE;
${flowRunEventCommandIntegritySql}
${flowEnrollmentTraceConstraintIntegritySql}
${flowWorkItemEventIntegritySql}`;

export const flowExecutionWorkItemWakeSafetyBaselineDdl = `
${flowEnrollmentTraceConstraintIntegritySql}
${flowWorkItemEventIntegritySql}`;

export const flowExecutionSafetyBaselineDdl = `${flowExecutionRetrySafetyBaselineDdl}\n${flowExecutionAtomicAdvanceBaselineDdl}\n${flowExecutionClaimAuthorityEvidenceBaselineDdl}\n${flowExecutionEnrollmentTraceSafetyBaselineDdl}`;
