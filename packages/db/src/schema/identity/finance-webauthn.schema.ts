import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { users } from "./accounts.schema";
import { userSessions } from "./auth-sessions.schema";

const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");
const base64UrlPattern = sql.raw("'^[A-Za-z0-9_-]+$'");
const financeActionKinds = sql.raw(
  "('tariff_publish', 'fiscal_policy_publish', 'risk_policy_publish', 'refund_execute', 'chargeback_principal_allocate', 'chargeback_resolution', 'payout_destination_reveal', 'payout_destination_change', 'payout_approve', 'payout_start_processing', 'payout_confirm_paid', 'bank_snapshot_attest', 'bank_statement_match', 'ledger_correction')"
);
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea"
});

/** Public, scoped WebAuthn credential material only. Private credential material never reaches PostgreSQL. */
export const financeWebAuthnCredentials = pgTable(
  "finance_webauthn_credentials",
  {
    credentialId: varchar("credential_id", { length: 4096 }).primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publicKey: bytea("public_key").notNull(),
    transports: jsonb("transports").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    signatureCounter: bigint("signature_counter", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true })
  },
  (table) => [
    check(
      "finance_webauthn_credentials_identifier_check",
      sql`length(${table.credentialId}) between 1 and 4096 and ${table.credentialId} ~ ${base64UrlPattern}`
    ),
    check("finance_webauthn_credentials_public_key_check", sql`octet_length(${table.publicKey}) > 0`),
    check(
      "finance_webauthn_credentials_transport_check",
      sql`jsonb_typeof(${table.transports}) = 'array'`
    ),
    check(
      "finance_webauthn_credentials_device_type_check",
      sql`${table.deviceType} in ('singleDevice', 'multiDevice')`
    ),
    check(
      "finance_webauthn_credentials_counter_check",
      sql`${table.signatureCounter} >= 0`
    ),
    check(
      "finance_webauthn_credentials_lifecycle_check",
      sql`(${table.status} = 'active' and ${table.quarantinedAt} is null) or (${table.status} = 'quarantined' and ${table.quarantinedAt} is not null)`
    ),
    index("finance_webauthn_credentials_owner_active_index")
      .on(table.ownerUserId, table.createdAt)
      .where(sql`${table.status} = 'active'`),
    index("finance_webauthn_credentials_status_index").on(table.status, table.createdAt)
  ]
);

/** One-use passkey enrollment ceremony. It is separate from a money-moving transaction proof. */
export const financeWebAuthnRegistrationChallenges = pgTable(
  "finance_webauthn_registration_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => userSessions.id, { onDelete: "restrict" }),
    challenge: varchar("challenge", { length: 128 }).notNull(),
    rpId: varchar("rp_id", { length: 253 }).notNull(),
    origin: varchar("origin", { length: 255 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"),
    consumedAt: timestamp("consumed_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("finance_webauthn_registration_challenges_challenge_unique").on(table.challenge),
    check(
      "finance_webauthn_registration_challenges_challenge_check",
      sql`length(${table.challenge}) = 43 and ${table.challenge} ~ ${base64UrlPattern}`
    ),
    check(
      "finance_webauthn_registration_challenges_expiry_check",
      sql`${table.expiresAt} > ${table.issuedAt} and ${table.expiresAt} <= ${table.issuedAt} + interval '300 seconds'`
    ),
    check(
      "finance_webauthn_registration_challenges_lifecycle_check",
      sql`(${table.status} = 'active' and ${table.consumedAt} is null) or (${table.status} = 'consumed' and ${table.consumedAt} is not null and ${table.consumedAt} >= ${table.issuedAt})`
    ),
    index("finance_webauthn_registration_challenges_active_session_index")
      .on(table.actorUserId, table.sessionId, table.expiresAt)
      .where(sql`${table.status} = 'active'`)
  ]
);

/** Persisted exact finance-command challenge. Its random value and binding are the replay boundary. */
export const financeAuthorizationChallenges = pgTable(
  "finance_authorization_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => userSessions.id, { onDelete: "restrict" }),
    actionKind: text("action_kind").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    expectedVersion: bigint("expected_version", { mode: "number" }).notNull(),
    payloadHash: varchar("payload_hash", { length: 71 }).notNull(),
    challenge: varchar("challenge", { length: 128 }).notNull(),
    rpId: varchar("rp_id", { length: 253 }).notNull(),
    origin: varchar("origin", { length: 255 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"),
    consumedAt: timestamp("consumed_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("finance_authorization_challenges_challenge_unique").on(table.challenge),
    check(
      "finance_authorization_challenges_action_check",
      sql`${table.actionKind} in ${financeActionKinds}`
    ),
    check(
      "finance_authorization_challenges_binding_check",
      sql`${table.expectedVersion} between 0 and 9007199254740991 and ${table.payloadHash} ~ ${digestPattern} and length(${table.challenge}) = 43 and ${table.challenge} ~ ${base64UrlPattern}`
    ),
    check(
      "finance_authorization_challenges_expiry_check",
      sql`${table.expiresAt} > ${table.issuedAt} and ${table.expiresAt} <= ${table.issuedAt} + interval '300 seconds'`
    ),
    check(
      "finance_authorization_challenges_lifecycle_check",
      sql`(${table.status} = 'active' and ${table.consumedAt} is null) or (${table.status} = 'consumed' and ${table.consumedAt} is not null and ${table.consumedAt} >= ${table.issuedAt})`
    ),
    index("finance_authorization_challenges_active_binding_index")
      .on(table.actorUserId, table.sessionId, table.actionKind, table.aggregateId, table.expiresAt)
      .where(sql`${table.status} = 'active'`)
  ]
);

/** One-use proof issued only after a verified WebAuthn assertion consumes a transaction challenge. */
export const financeAuthorizationGrants = pgTable(
  "finance_authorization_grants",
  {
    authorizationId: uuid("authorization_id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => userSessions.id, { onDelete: "restrict" }),
    actionKind: text("action_kind").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    expectedVersion: bigint("expected_version", { mode: "number" }).notNull(),
    payloadHash: varchar("payload_hash", { length: 71 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"),
    consumedAt: timestamp("consumed_at", { withTimezone: true })
  },
  (table) => [
    check(
      "finance_authorization_grants_action_check",
      sql`${table.actionKind} in ${financeActionKinds}`
    ),
    check(
      "finance_authorization_grants_binding_check",
      sql`${table.expectedVersion} between 0 and 9007199254740991 and ${table.payloadHash} ~ ${digestPattern}`
    ),
    check(
      "finance_authorization_grants_expiry_check",
      sql`${table.expiresAt} > ${table.verifiedAt} and ${table.expiresAt} <= ${table.verifiedAt} + interval '300 seconds'`
    ),
    check(
      "finance_authorization_grants_lifecycle_check",
      sql`(${table.status} = 'active' and ${table.consumedAt} is null) or (${table.status} = 'consumed' and ${table.consumedAt} is not null and ${table.consumedAt} >= ${table.verifiedAt})`
    ),
    index("finance_authorization_grants_active_binding_index")
      .on(table.actorUserId, table.sessionId, table.actionKind, table.aggregateId, table.expiresAt)
      .where(sql`${table.status} = 'active'`)
  ]
);

/**
 * Drizzle expresses table-local checks; these guards additionally bind every ceremony to the
 * owning authenticated session and make replay/counter state append-only at the database edge.
 */
export const financeWebAuthnIdentityIntegritySql = `
create or replace function finance_assert_webauthn_session_owner()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from public.user_sessions session_row
    where session_row.id = new.session_id and session_row.user_id = new.actor_user_id
  ) then
    raise exception 'finance WebAuthn actor does not own the bound session' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function finance_guard_authorization_challenge_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'finance authorization challenges are immutable' using errcode = '23514';
  end if;
  if old.actor_user_id is distinct from new.actor_user_id
    or old.session_id is distinct from new.session_id
    or old.action_kind is distinct from new.action_kind
    or old.aggregate_id is distinct from new.aggregate_id
    or old.expected_version is distinct from new.expected_version
    or old.payload_hash is distinct from new.payload_hash
    or old.challenge is distinct from new.challenge
    or old.rp_id is distinct from new.rp_id
    or old.origin is distinct from new.origin
    or old.issued_at is distinct from new.issued_at
    or old.expires_at is distinct from new.expires_at then
    raise exception 'finance authorization challenge binding is immutable' using errcode = '23514';
  end if;
  if old.status <> 'active' or new.status <> 'consumed'
    or new.consumed_at is null or new.consumed_at < old.issued_at then
    raise exception 'finance authorization challenge transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function finance_guard_authorization_grant_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'finance authorization grants are immutable' using errcode = '23514';
  end if;
  if old.actor_user_id is distinct from new.actor_user_id
    or old.session_id is distinct from new.session_id
    or old.action_kind is distinct from new.action_kind
    or old.aggregate_id is distinct from new.aggregate_id
    or old.expected_version is distinct from new.expected_version
    or old.payload_hash is distinct from new.payload_hash
    or old.verified_at is distinct from new.verified_at
    or old.expires_at is distinct from new.expires_at then
    raise exception 'finance authorization grant binding is immutable' using errcode = '23514';
  end if;
  if old.status <> 'active' or new.status <> 'consumed'
    or new.consumed_at is null or new.consumed_at < old.verified_at then
    raise exception 'finance authorization grant transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function finance_guard_webauthn_registration_challenge_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'finance WebAuthn registration challenges are immutable' using errcode = '23514';
  end if;
  if old.actor_user_id is distinct from new.actor_user_id
    or old.session_id is distinct from new.session_id
    or old.challenge is distinct from new.challenge
    or old.rp_id is distinct from new.rp_id
    or old.origin is distinct from new.origin
    or old.issued_at is distinct from new.issued_at
    or old.expires_at is distinct from new.expires_at then
    raise exception 'finance WebAuthn registration challenge binding is immutable' using errcode = '23514';
  end if;
  if old.status <> 'active' or new.status <> 'consumed'
    or new.consumed_at is null or new.consumed_at < old.issued_at then
    raise exception 'finance WebAuthn registration challenge transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function finance_guard_webauthn_credential_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'finance WebAuthn credentials are immutable; quarantine instead' using errcode = '23514';
  end if;
  if old.owner_user_id is distinct from new.owner_user_id
    or old.public_key is distinct from new.public_key
    or old.transports is distinct from new.transports
    or old.device_type is distinct from new.device_type
    or old.backed_up is distinct from new.backed_up
    or old.created_at is distinct from new.created_at then
    raise exception 'finance WebAuthn credential identity is immutable' using errcode = '23514';
  end if;
  if old.status = 'quarantined' then
    raise exception 'quarantined finance WebAuthn credential cannot be reactivated' using errcode = '23514';
  end if;
  if new.status = 'active' then
    if new.quarantined_at is not null
      or not ((old.signature_counter = 0 and new.signature_counter = 0) or new.signature_counter > old.signature_counter) then
      raise exception 'finance WebAuthn credential counter transition is not allowed' using errcode = '23514';
    end if;
  elsif new.status = 'quarantined' then
    if new.quarantined_at is null or new.signature_counter <> old.signature_counter then
      raise exception 'finance WebAuthn credential quarantine transition is not allowed' using errcode = '23514';
    end if;
  else
    raise exception 'finance WebAuthn credential state is invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function finance_reject_webauthn_truncate()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'finance WebAuthn authorization records cannot be truncated' using errcode = '23514';
end;
$$;

create trigger finance_webauthn_registration_challenges_session_owner
before insert or update on finance_webauthn_registration_challenges
for each row execute function finance_assert_webauthn_session_owner();
create trigger finance_authorization_challenges_session_owner
before insert or update on finance_authorization_challenges
for each row execute function finance_assert_webauthn_session_owner();
create trigger finance_authorization_grants_session_owner
before insert or update on finance_authorization_grants
for each row execute function finance_assert_webauthn_session_owner();
create trigger finance_webauthn_registration_challenges_mutation_guard
before update or delete on finance_webauthn_registration_challenges
for each row execute function finance_guard_webauthn_registration_challenge_mutation();
create trigger finance_authorization_challenges_mutation_guard
before update or delete on finance_authorization_challenges
for each row execute function finance_guard_authorization_challenge_mutation();
create trigger finance_authorization_grants_mutation_guard
before update or delete on finance_authorization_grants
for each row execute function finance_guard_authorization_grant_mutation();
create trigger finance_webauthn_credentials_mutation_guard
before update or delete on finance_webauthn_credentials
for each row execute function finance_guard_webauthn_credential_mutation();
create trigger finance_webauthn_credentials_reject_truncate
before truncate on finance_webauthn_credentials
for each statement execute function finance_reject_webauthn_truncate();
create trigger finance_webauthn_registration_challenges_reject_truncate
before truncate on finance_webauthn_registration_challenges
for each statement execute function finance_reject_webauthn_truncate();
create trigger finance_authorization_challenges_reject_truncate
before truncate on finance_authorization_challenges
for each statement execute function finance_reject_webauthn_truncate();
create trigger finance_authorization_grants_reject_truncate
before truncate on finance_authorization_grants
for each statement execute function finance_reject_webauthn_truncate();
`;
