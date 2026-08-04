import {
  flowDefinitionIntegritySql,
  flowExecutionHistoryIntegritySql,
  flowRunEventCommandIntegritySql,
  flowRuntimeCommandIntegritySql
} from "./augment-flows-baseline";
import { flowCapabilityManifestSchemaPredicate } from "../src/schema/flows/flow-capability-manifest-constraint";

export type MigrationIdentity = {
  readonly hash: string;
  readonly createdAt: string;
};

export type MigrationLedgerRow = {
  readonly hash: string;
  readonly created_at: string;
};

export type BaselineHistoryKind =
  | "current"
  | "previous_atomic_advance"
  | "previous_flow_safety"
  | "previous_cancellation_kernel"
  | "previous_runtime_kernel"
  | "previous_flow_definition_control"
  | "previous_current"
  | "legacy_calculations"
  | "unknown";

export const currentBaseline = {
  hash: "c8c7a9321f324b0b87f1dabc0caf3ab7858f8951fc86a2b766e0d1742002d0ee",
  createdAt: "1785788910481"
} as const satisfies MigrationIdentity;

export const previousAtomicAdvanceBaseline = {
  hash: "bf9787c8efeb873169dabb94ca99af08cdd073675494c03744659142ed73a319",
  createdAt: "1785783440777"
} as const satisfies MigrationIdentity;

export const previousFlowSafetyBaseline = {
  hash: "5831a6c30c9c33aa93058f1f119dd4697253b73d7b2743f7e20ec8d7f014ccc9",
  createdAt: "1785768455149"
} as const satisfies MigrationIdentity;

export const previousCancellationKernelBaseline = {
  hash: "2e4f69f3926545055e0d9f2c3812b2c19a79f571b2533f3ff8aa00b23796fa49",
  createdAt: "1785761073015"
} as const satisfies MigrationIdentity;

export const previousRuntimeKernelBaseline = {
  hash: "bf151129ed85e6bd009a7bc40087938906e6d1497413458b12f66d62e258dff7",
  createdAt: "1785747356544"
} as const satisfies MigrationIdentity;

export const previousFlowDefinitionControlBaseline = {
  hash: "357b63b1fc968f7d20a5dca13006535d80b73db8b6dadf1a426a97312c26fa94",
  createdAt: "1785708843533"
} as const satisfies MigrationIdentity;

export const previousBaseline = {
  hash: "ed87993e6e473fbeee9cbeb7db2166df31161f401b9725e8bb2ad3240628bf39",
  createdAt: "1785010323027"
} as const satisfies MigrationIdentity;

const misrecordedFlowRuntimeBaseline = {
  hash: "8b8e765327792e8946a232199cd3627a68ed14b2419fb62581f8c66482a6a917",
  createdAt: "1785010323027"
} as const satisfies MigrationIdentity;

const preFlowRuntimeBaseline = {
  hash: "a38ad40eeb3418dedda1cb62b1a30be0f9c249dd137f73539b8ef89c9d13d112",
  createdAt: "1785010323027"
} as const satisfies MigrationIdentity;

const natalChartEngineBaseline = {
  hash: "ab1e22a3e02a0c428dfa01e90e48b5f037e66509ecf51fa5674e5e3ab2889b57",
  createdAt: "1784275401007"
} as const satisfies MigrationIdentity;

const telegramMtprotoBaseline = {
  hash: "9502df7bc0155994014951df839fd556213d11e3c370cb5244d65a37a43d704e",
  createdAt: "1785010323027"
} as const satisfies MigrationIdentity;

const approvedPriorBaselines = [
  natalChartEngineBaseline,
  telegramMtprotoBaseline
] as const satisfies readonly MigrationIdentity[];

export const approvedLegacyMigrations = [
  {
    hash: "9a042354672db97fda448a68804c61952d81d2c39e4b67b8581de04984c3fff8",
    createdAt: "1782996784018"
  },
  {
    hash: "9cfb3eebacfd55d703748c65b7a6210c8037cb881f66c3d7bf110d1489357baa",
    createdAt: "1783327724152"
  },
  {
    hash: "c52a5a3cc5c9acd8e50b32643661dbe8f922844711ad08a8e30b22d72eb09829",
    createdAt: "1783335783810"
  },
  {
    hash: "3d071b976aeeb1b5a4954aef46eadce7209a5ecef66a81e1680c3f3986694bd7",
    createdAt: "1783969326835"
  },
  {
    hash: "911332efe5ba14b352244a8176412cf637dccdb25141aa1792dcad35c63831de",
    createdAt: "1784111509389"
  }
] as const satisfies readonly MigrationIdentity[];

const approvedBeforeFlowDefinitionControlHistories = [
  [misrecordedFlowRuntimeBaseline],
  [telegramMtprotoBaseline, misrecordedFlowRuntimeBaseline],
  [preFlowRuntimeBaseline],
  [telegramMtprotoBaseline, preFlowRuntimeBaseline],
  [...approvedLegacyMigrations, natalChartEngineBaseline],
  [...approvedLegacyMigrations, natalChartEngineBaseline, misrecordedFlowRuntimeBaseline],
  [...approvedLegacyMigrations, misrecordedFlowRuntimeBaseline],
  [...approvedLegacyMigrations, preFlowRuntimeBaseline],
  [...approvedLegacyMigrations, telegramMtprotoBaseline, preFlowRuntimeBaseline],
  [...approvedLegacyMigrations, ...approvedPriorBaselines, preFlowRuntimeBaseline]
] as const satisfies readonly (readonly MigrationIdentity[])[];

const approvedPreviousCurrentHistories: readonly (readonly MigrationIdentity[])[] = [
  [previousBaseline],
  [telegramMtprotoBaseline, previousBaseline],
  [...approvedLegacyMigrations, previousBaseline],
  ...approvedBeforeFlowDefinitionControlHistories,
  ...approvedBeforeFlowDefinitionControlHistories.map((history) => [...history, previousBaseline])
];

const approvedPreviousFlowDefinitionControlHistories: readonly (readonly MigrationIdentity[])[] = [
  [previousFlowDefinitionControlBaseline],
  [...approvedLegacyMigrations, previousFlowDefinitionControlBaseline],
  ...approvedPreviousCurrentHistories.map((history) => [
    ...history,
    previousFlowDefinitionControlBaseline
  ])
];

const approvedPreviousRuntimeKernelHistories: readonly (readonly MigrationIdentity[])[] = [
  [previousRuntimeKernelBaseline],
  [...approvedLegacyMigrations, previousRuntimeKernelBaseline],
  ...approvedPreviousCurrentHistories.map((history) => [...history, previousRuntimeKernelBaseline]),
  ...approvedPreviousFlowDefinitionControlHistories.map((history) => [
    ...history,
    previousRuntimeKernelBaseline
  ])
];

const approvedPreviousCancellationKernelHistories: readonly (readonly MigrationIdentity[])[] = [
  [previousCancellationKernelBaseline],
  [...approvedLegacyMigrations, previousCancellationKernelBaseline],
  ...approvedPreviousCurrentHistories.map((history) => [
    ...history,
    previousCancellationKernelBaseline
  ]),
  ...approvedPreviousFlowDefinitionControlHistories.map((history) => [
    ...history,
    previousCancellationKernelBaseline
  ]),
  ...approvedPreviousRuntimeKernelHistories.map((history) => [
    ...history,
    previousCancellationKernelBaseline
  ])
];

const approvedPreviousFlowSafetyHistories: readonly (readonly MigrationIdentity[])[] = [
  [previousFlowSafetyBaseline],
  [...approvedLegacyMigrations, previousFlowSafetyBaseline],
  ...approvedPreviousCurrentHistories.map((history) => [...history, previousFlowSafetyBaseline]),
  ...approvedPreviousFlowDefinitionControlHistories.map((history) => [
    ...history,
    previousFlowSafetyBaseline
  ]),
  ...approvedPreviousRuntimeKernelHistories.map((history) => [
    ...history,
    previousFlowSafetyBaseline
  ]),
  ...approvedPreviousCancellationKernelHistories.map((history) => [
    ...history,
    previousFlowSafetyBaseline
  ])
];

const approvedPreviousAtomicAdvanceHistories: readonly (readonly MigrationIdentity[])[] = [
  [previousAtomicAdvanceBaseline],
  [...approvedLegacyMigrations, previousAtomicAdvanceBaseline],
  ...approvedPreviousCurrentHistories.map((history) => [...history, previousAtomicAdvanceBaseline]),
  ...approvedPreviousFlowDefinitionControlHistories.map((history) => [
    ...history,
    previousAtomicAdvanceBaseline
  ]),
  ...approvedPreviousRuntimeKernelHistories.map((history) => [
    ...history,
    previousAtomicAdvanceBaseline
  ]),
  ...approvedPreviousCancellationKernelHistories.map((history) => [
    ...history,
    previousAtomicAdvanceBaseline
  ]),
  ...approvedPreviousFlowSafetyHistories.map((history) => [
    ...history,
    previousAtomicAdvanceBaseline
  ])
];

export function classifyBaselineHistory(
  migrations: readonly MigrationLedgerRow[]
): BaselineHistoryKind {
  if (
    matchesMigrationHistory(migrations, [currentBaseline]) ||
    matchesMigrationHistory(migrations, [...approvedLegacyMigrations, currentBaseline]) ||
    approvedPreviousCurrentHistories.some((history) =>
      matchesMigrationHistory(migrations, [...history, currentBaseline])
    ) ||
    approvedPreviousFlowDefinitionControlHistories.some((history) =>
      matchesMigrationHistory(migrations, [...history, currentBaseline])
    ) ||
    approvedPreviousRuntimeKernelHistories.some((history) =>
      matchesMigrationHistory(migrations, [...history, currentBaseline])
    ) ||
    approvedPreviousCancellationKernelHistories.some((history) =>
      matchesMigrationHistory(migrations, [...history, currentBaseline])
    ) ||
    approvedPreviousFlowSafetyHistories.some((history) =>
      matchesMigrationHistory(migrations, [...history, currentBaseline])
    ) ||
    approvedPreviousAtomicAdvanceHistories.some((history) =>
      matchesMigrationHistory(migrations, [...history, currentBaseline])
    )
  ) {
    return "current";
  }
  if (
    approvedPreviousAtomicAdvanceHistories.some((history) =>
      matchesMigrationHistory(migrations, history)
    )
  ) {
    return "previous_atomic_advance";
  }
  if (
    approvedPreviousFlowSafetyHistories.some((history) =>
      matchesMigrationHistory(migrations, history)
    )
  ) {
    return "previous_flow_safety";
  }
  if (
    approvedPreviousCancellationKernelHistories.some((history) =>
      matchesMigrationHistory(migrations, history)
    )
  ) {
    return "previous_cancellation_kernel";
  }
  if (
    approvedPreviousRuntimeKernelHistories.some((history) =>
      matchesMigrationHistory(migrations, history)
    )
  ) {
    return "previous_runtime_kernel";
  }
  if (
    approvedPreviousFlowDefinitionControlHistories.some((history) =>
      matchesMigrationHistory(migrations, history)
    )
  ) {
    return "previous_flow_definition_control";
  }
  if (
    approvedPreviousCurrentHistories.some((history) => matchesMigrationHistory(migrations, history))
  ) {
    return "previous_current";
  }
  if (matchesMigrationHistory(migrations, approvedLegacyMigrations)) {
    return "legacy_calculations";
  }
  return "unknown";
}

function matchesMigrationHistory(
  migrations: readonly MigrationLedgerRow[],
  expected: readonly MigrationIdentity[]
): boolean {
  return (
    migrations.length === expected.length &&
    migrations.every(
      (migration, index) =>
        migration.hash === expected[index]?.hash &&
        migration.created_at === expected[index]?.createdAt
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
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
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

export { flowCapabilityManifestSchemaPredicate };

export const flowCapabilityManifestSafetyBaselineDdl = `
  ALTER TABLE flow_versions
    ADD CONSTRAINT flow_versions_capability_manifest_schema_check
      CHECK (${flowCapabilityManifestSchemaPredicate}) NOT VALID;
  ALTER TABLE flow_versions
    VALIDATE CONSTRAINT flow_versions_capability_manifest_schema_check;
`;

export const flowDefinitionControlBaselineDdl = `
  CREATE TABLE IF NOT EXISTS flows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    name text NOT NULL,
    origin jsonb,
    status text DEFAULT 'draft' NOT NULL,
    definition_state text DEFAULT 'draft' NOT NULL,
    approval_mode text DEFAULT 'manual_approve' NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    draft_base_version_id uuid,
    draft_graph jsonb NOT NULL,
    draft_presentation jsonb,
    published_version_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    published_at timestamptz,
    CONSTRAINT flows_id_owner_unique UNIQUE (id, owner_user_id),
    CONSTRAINT flows_name_length_check CHECK (length(trim(name)) BETWEEN 1 AND 180),
    CONSTRAINT flows_status_check CHECK (status IN ('draft', 'published', 'active', 'paused', 'archived')),
    CONSTRAINT flows_approval_mode_check CHECK (approval_mode IN ('draft_only', 'manual_approve', 'auto_internal', 'auto_send')),
    CONSTRAINT flows_draft_graph_object_check CHECK (jsonb_typeof(draft_graph) = 'object'),
    CONSTRAINT flows_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS flow_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    version integer NOT NULL,
    source_revision integer,
    approval_mode text NOT NULL,
    graph_schema_version text,
    graph jsonb NOT NULL,
    presentation jsonb,
    capability_manifest jsonb,
    published_at timestamptz NOT NULL,
    CONSTRAINT flow_versions_id_owner_unique UNIQUE (id, owner_user_id),
    CONSTRAINT flow_versions_flow_id_id_owner_unique UNIQUE (flow_id, id, owner_user_id),
    CONSTRAINT flow_versions_positive_version_check CHECK (version > 0),
    CONSTRAINT flow_versions_approval_mode_check CHECK (approval_mode IN ('draft_only', 'manual_approve', 'auto_internal', 'auto_send')),
    CONSTRAINT flow_versions_graph_object_check CHECK (jsonb_typeof(graph) = 'object'),
    CONSTRAINT flow_versions_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_versions_flow_owner_fk
      FOREIGN KEY (flow_id, owner_user_id) REFERENCES flows(id, owner_user_id) ON DELETE CASCADE
  );

  ALTER TABLE flows
    ADD COLUMN IF NOT EXISTS origin jsonb,
    ADD COLUMN IF NOT EXISTS definition_state text,
    ADD COLUMN IF NOT EXISTS revision integer,
    ADD COLUMN IF NOT EXISTS draft_base_version_id uuid,
    ADD COLUMN IF NOT EXISTS draft_presentation jsonb;

  ALTER TABLE flow_versions
    ADD COLUMN IF NOT EXISTS source_revision integer,
    ADD COLUMN IF NOT EXISTS graph_schema_version text,
    ADD COLUMN IF NOT EXISTS presentation jsonb,
    ADD COLUMN IF NOT EXISTS capability_manifest jsonb;

  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM flows
       WHERE draft_graph ? 'schemaVersion'
         AND draft_graph->>'schemaVersion' <> 'flow-graph.v1'
    ) OR EXISTS (
      SELECT 1 FROM flow_versions
       WHERE graph ? 'schemaVersion'
         AND graph->>'schemaVersion' <> 'flow-graph.v1'
    ) THEN
      RAISE EXCEPTION 'Refusing to relabel a non-V1 Flows graph during baseline reconciliation';
    END IF;
  END
  $$;

  UPDATE flows
     SET draft_graph = jsonb_set(draft_graph, '{schemaVersion}', '"flow-graph.v1"'::jsonb, true)
   WHERE NOT (draft_graph ? 'schemaVersion');
  UPDATE flow_versions
     SET graph = jsonb_set(graph, '{schemaVersion}', '"flow-graph.v1"'::jsonb, true)
   WHERE NOT (graph ? 'schemaVersion');

  UPDATE flows
     SET definition_state = CASE
       WHEN status = 'archived' THEN 'archived'
       WHEN published_version_id IS NULL THEN 'draft'
       ELSE 'versioned'
     END
   WHERE definition_state IS NULL;
  UPDATE flows SET revision = 1 WHERE revision IS NULL;

  ALTER TABLE flows
    ALTER COLUMN definition_state SET DEFAULT 'draft',
    ALTER COLUMN definition_state SET NOT NULL,
    ALTER COLUMN revision SET DEFAULT 1,
    ALTER COLUMN revision SET NOT NULL;

  ALTER TABLE flows
    ADD CONSTRAINT flows_definition_state_check
      CHECK (definition_state IN ('draft', 'versioned', 'archived')),
    ADD CONSTRAINT flows_revision_check CHECK (revision > 0),
    ADD CONSTRAINT flows_definition_lifecycle_check CHECK (
      (
        definition_state = 'draft'
        AND (
          (
            published_version_id IS NULL
            AND published_at IS NULL
            AND draft_base_version_id IS NULL
          )
          OR (
            published_version_id IS NOT NULL
            AND published_at IS NOT NULL
            AND draft_base_version_id = published_version_id
          )
        )
      )
      OR (
        definition_state = 'versioned'
        AND published_version_id IS NOT NULL
        AND published_at IS NOT NULL
        AND draft_base_version_id IS NULL
      )
      OR (
        definition_state = 'archived'
        AND (
          (
            published_version_id IS NULL
            AND published_at IS NULL
            AND draft_base_version_id IS NULL
          )
          OR (
            published_version_id IS NOT NULL
            AND published_at IS NOT NULL
            AND (
              draft_base_version_id IS NULL
              OR draft_base_version_id = published_version_id
            )
          )
        )
      )
    ),
    ADD CONSTRAINT flows_graph_origin_check CHECK (
      (
        draft_graph->>'schemaVersion' = 'flow-graph.v1'
        AND origin IS NULL
        AND draft_presentation IS NULL
      )
      OR (
        draft_graph->>'schemaVersion' = 'flow-graph.v2'
        AND jsonb_typeof(origin) = 'object'
        AND origin->>'schemaVersion' = 'flow-definition-origin.v1'
        AND origin->>'type' IN ('blank', 'template', 'migration')
      )
    ),
    ADD CONSTRAINT flows_draft_presentation_object_check
      CHECK (draft_presentation IS NULL OR jsonb_typeof(draft_presentation) = 'object');

  ALTER TABLE flow_versions
    ADD CONSTRAINT flow_versions_flow_id_id_owner_published_unique
      UNIQUE (flow_id, id, owner_user_id, published_at),
    ADD CONSTRAINT flow_versions_source_revision_check
      CHECK (source_revision IS NULL OR source_revision > 0),
    ADD CONSTRAINT flow_versions_presentation_object_check
      CHECK (presentation IS NULL OR jsonb_typeof(presentation) = 'object'),
    ADD CONSTRAINT flow_versions_v2_metadata_check CHECK (
      (
        source_revision IS NULL
        AND graph_schema_version IS NULL
        AND capability_manifest IS NULL
      )
      OR (
        source_revision > 0
        AND graph_schema_version = 'flow-graph.v2'
        AND graph->>'schemaVersion' = 'flow-graph.v2'
        AND jsonb_typeof(capability_manifest) = 'object'
      )
    ),
    ADD CONSTRAINT flow_versions_capability_manifest_schema_check CHECK (
      ${flowCapabilityManifestSchemaPredicate}
    );

  ALTER TABLE flows DROP CONSTRAINT IF EXISTS flows_published_version_owner_fk;
  ALTER TABLE flows
    ADD CONSTRAINT flows_published_version_owner_fk
      FOREIGN KEY (id, published_version_id, owner_user_id, published_at)
      REFERENCES flow_versions(flow_id, id, owner_user_id, published_at) ON DELETE RESTRICT,
    ADD CONSTRAINT flows_draft_base_version_owner_fk
      FOREIGN KEY (id, draft_base_version_id, owner_user_id)
      REFERENCES flow_versions(flow_id, id, owner_user_id) ON DELETE RESTRICT;

  CREATE INDEX IF NOT EXISTS flows_owner_status_updated_idx
    ON flows (owner_user_id, status, updated_at);
  CREATE INDEX IF NOT EXISTS flows_owner_definition_state_updated_idx
    ON flows (owner_user_id, definition_state, updated_at, id);
  CREATE INDEX IF NOT EXISTS flows_owner_name_idx ON flows (owner_user_id, name);
  CREATE INDEX IF NOT EXISTS flow_versions_owner_published_idx
    ON flow_versions (owner_user_id, published_at);
  CREATE UNIQUE INDEX IF NOT EXISTS flow_versions_flow_version_unique
    ON flow_versions (flow_id, version);
  CREATE UNIQUE INDEX flow_versions_flow_source_revision_unique
    ON flow_versions (flow_id, source_revision) WHERE source_revision IS NOT NULL;

  CREATE TABLE flow_definition_commands (
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
    CONSTRAINT flow_definition_commands_id_resource_owner_unique
      UNIQUE (id, resource_id, owner_user_id),
    CONSTRAINT flow_definition_commands_scope_check CHECK (
      api_surface = 'astrologer-api'
      AND command_scope IN (
        'flows.definition.create.v2',
        'flows.definition.update-draft.v2',
        'flows.definition.publish.v2',
        'flows.definition.create-next-draft.v2',
        'flows.definition.migrate.v2'
      )
      AND (
        (
          route_template = '/flows'
          AND command_scope = 'flows.definition.create.v2'
          AND resource_id = owner_user_id
        )
        OR (route_template = '/flows/:flowId/draft' AND command_scope = 'flows.definition.update-draft.v2')
        OR (route_template = '/flows/:flowId/publish' AND command_scope = 'flows.definition.publish.v2')
        OR (route_template = '/flows/:flowId/next-draft' AND command_scope = 'flows.definition.create-next-draft.v2')
        OR (route_template = '/flows/:flowId/migrations/v2' AND command_scope = 'flows.definition.migrate.v2')
      )
    ),
    CONSTRAINT flow_definition_commands_key_check CHECK (
      length(idempotency_key) BETWEEN 8 AND 128
      AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
    CONSTRAINT flow_definition_commands_request_hash_check
      CHECK (request_hash ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT flow_definition_commands_state_check
      CHECK (state IN ('processing', 'succeeded', 'failed')),
    CONSTRAINT flow_definition_commands_terminal_state_check CHECK (
      (state = 'processing' AND completed_at IS NULL)
      OR (state IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
    ),
    CONSTRAINT flow_definition_commands_replay_window_check
      CHECK (replay_until = created_at + interval '24 hours'),
    CONSTRAINT flow_definition_commands_completion_check
      CHECK (completed_at IS NULL OR completed_at >= created_at),
    CONSTRAINT flow_definition_commands_actor_user_id_users_id_fk
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT flow_definition_commands_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE flow_definition_command_outcomes (
    command_id uuid PRIMARY KEY NOT NULL,
    response_status integer NOT NULL,
    response_body jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT flow_definition_command_outcomes_response_check CHECK (
      (
        response_status IN (200, 201)
        OR response_status BETWEEN 400 AND 499
      )
      AND jsonb_typeof(response_body) = 'object'
    ),
    CONSTRAINT flow_definition_command_outcomes_command_fk
      FOREIGN KEY (command_id) REFERENCES flow_definition_commands(id) ON DELETE CASCADE
  );

  CREATE TABLE flow_definition_migrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    command_id uuid NOT NULL,
    source_graph_schema_version text NOT NULL,
    target_graph_schema_version text NOT NULL,
    source_version_id uuid,
    source_revision integer NOT NULL,
    source_graph_hash text NOT NULL,
    target_revision integer NOT NULL,
    migrated_at timestamptz NOT NULL,
    CONSTRAINT flow_definition_migrations_schema_versions_check CHECK (
      source_graph_schema_version = 'flow-graph.v1'
      AND target_graph_schema_version = 'flow-graph.v2'
    ),
    CONSTRAINT flow_definition_migrations_revision_check CHECK (
      source_revision > 0
      AND target_revision = source_revision + 1
    ),
    CONSTRAINT flow_definition_migrations_graph_hash_check
      CHECK (source_graph_hash ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT flow_definition_migrations_flow_owner_fk
      FOREIGN KEY (flow_id, owner_user_id)
      REFERENCES flows(id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT flow_definition_migrations_source_version_owner_fk
      FOREIGN KEY (flow_id, source_version_id, owner_user_id)
      REFERENCES flow_versions(flow_id, id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT flow_definition_migrations_command_resource_owner_fk
      FOREIGN KEY (command_id, flow_id, owner_user_id)
      REFERENCES flow_definition_commands(id, resource_id, owner_user_id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX flow_definition_commands_scope_key_unique
    ON flow_definition_commands (
      api_surface,
      actor_user_id,
      owner_user_id,
      route_template,
      resource_id,
      idempotency_key
    );
  CREATE INDEX flow_definition_commands_replay_until_idx
    ON flow_definition_commands (replay_until);
  CREATE INDEX flow_definition_commands_owner_resource_created_idx
    ON flow_definition_commands (owner_user_id, resource_id, created_at);
  CREATE INDEX flow_definition_command_outcomes_created_idx
    ON flow_definition_command_outcomes (created_at);
  CREATE UNIQUE INDEX flow_definition_migrations_command_unique
    ON flow_definition_migrations (command_id);
  CREATE UNIQUE INDEX flow_definition_migrations_flow_target_revision_unique
    ON flow_definition_migrations (flow_id, target_revision);
  CREATE INDEX flow_definition_migrations_owner_migrated_idx
    ON flow_definition_migrations (owner_user_id, migrated_at);

  ${flowDefinitionIntegritySql}
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

  ${flowRuntimeCommandIntegritySql}
  ${flowRunEventCommandIntegritySql}
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

export const flowExecutionSafetyBaselineDdl = `${flowExecutionRetrySafetyBaselineDdl}\n${flowExecutionAtomicAdvanceBaselineDdl}`;
