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
  | "previous_current"
  | "legacy_calculations"
  | "unknown";

export const currentBaseline = {
  hash: "9502df7bc0155994014951df839fd556213d11e3c370cb5244d65a37a43d704e",
  createdAt: "1785010323027"
} as const satisfies MigrationIdentity;

export const previousBaseline = {
  hash: "a867c769a612f24e02e5b1c08e41c2967a1052ad0ee124cf97ddeb63bbe12d46",
  createdAt: "1785010323027"
} as const satisfies MigrationIdentity;

export const approvedLegacyMigrations = [
  {
    hash: "911332efe5ba14b352244a8176412cf637dccdb25141aa1792dcad35c63831de",
    createdAt: "1784111509389"
  },
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
  }
] as const satisfies readonly MigrationIdentity[];

export function classifyBaselineHistory(
  migrations: readonly MigrationLedgerRow[]
): BaselineHistoryKind {
  if (
    matchesMigrationHistory(migrations, [currentBaseline]) ||
    matchesMigrationHistory(migrations, [previousBaseline, currentBaseline]) ||
    matchesMigrationHistory(migrations, [...approvedLegacyMigrations, currentBaseline]) ||
    matchesMigrationHistory(migrations, [
      ...approvedLegacyMigrations,
      previousBaseline,
      currentBaseline
    ])
  ) {
    return "current";
  }
  if (
    matchesMigrationHistory(migrations, [previousBaseline]) ||
    matchesMigrationHistory(migrations, [...approvedLegacyMigrations, previousBaseline])
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
  ALTER TABLE products
    ADD CONSTRAINT products_id_owner_unique UNIQUE (id, owner_user_id);

  CREATE TABLE availability_schedules (
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
  CREATE UNIQUE INDEX availability_schedules_default_owner_unique
    ON availability_schedules (owner_user_id) WHERE is_default = true;
  CREATE INDEX availability_schedules_owner_updated_idx
    ON availability_schedules (owner_user_id, updated_at);

  CREATE TABLE availability_weekly_periods (
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
  CREATE INDEX availability_weekly_periods_schedule_day_idx
    ON availability_weekly_periods (schedule_id, weekday, start_minute);

  CREATE TABLE availability_date_overrides (
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
  CREATE INDEX availability_date_overrides_schedule_date_idx
    ON availability_date_overrides (schedule_id, local_date);

  CREATE TABLE availability_override_periods (
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
  CREATE INDEX availability_override_periods_override_start_idx
    ON availability_override_periods (override_id, start_minute);

  CREATE TABLE availability_product_assignments (
    schedule_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    CONSTRAINT availability_product_assignments_pk PRIMARY KEY (schedule_id, product_id),
    CONSTRAINT availability_product_assignments_schedule_owner_fk FOREIGN KEY (schedule_id, owner_user_id)
      REFERENCES availability_schedules(id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT availability_product_assignments_product_owner_fk FOREIGN KEY (product_id, owner_user_id)
      REFERENCES products(id, owner_user_id) ON DELETE CASCADE
  );
  CREATE INDEX availability_product_assignments_owner_product_idx
    ON availability_product_assignments (owner_user_id, product_id);

  CREATE TABLE schedule_reservations (
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
  CREATE INDEX schedule_reservations_owner_service_idx
    ON schedule_reservations (owner_user_id, service_start_at, service_end_at);
  CREATE INDEX schedule_reservations_owner_lifecycle_occupied_idx
    ON schedule_reservations (owner_user_id, lifecycle, occupied_start_at, occupied_end_at);
  CREATE INDEX schedule_reservations_hold_expiry_idx
    ON schedule_reservations (lifecycle, hold_expires_at);
  ALTER TABLE schedule_reservations
    ADD CONSTRAINT schedule_reservations_active_owner_range_exclude
    EXCLUDE USING gist (
      owner_user_id WITH =,
      tstzrange(occupied_start_at, occupied_end_at, '[)') WITH &&
    ) WHERE (lifecycle = 'active');

  CREATE TABLE manual_calendar_blocks (
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
  CREATE INDEX manual_calendar_blocks_owner_state_updated_idx
    ON manual_calendar_blocks (owner_user_id, state, updated_at);

  CREATE TABLE bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    client_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    product_id uuid NOT NULL,
    reservation_id uuid NOT NULL,
    state text DEFAULT 'confirmed' NOT NULL,
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
    CONSTRAINT bookings_state_check CHECK (state IN ('confirmed', 'cancelled')),
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
  CREATE INDEX bookings_owner_service_idx
    ON bookings (owner_user_id, service_start_at, id);
  CREATE INDEX bookings_owner_client_created_idx
    ON bookings (owner_user_id, client_user_id, created_at, id);

  CREATE TABLE idempotency_commands (
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
  CREATE UNIQUE INDEX idempotency_commands_scope_key_unique
    ON idempotency_commands (api_surface, actor_user_id, command_scope, key);
  CREATE INDEX idempotency_commands_expiry_idx ON idempotency_commands (expires_at);
  CREATE INDEX idempotency_commands_actor_created_idx
    ON idempotency_commands (actor_user_id, created_at);
`;
