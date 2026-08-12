import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./accounts.schema";

export const mobileSessions = pgTable(
  "mobile_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    deviceLabel: text("device_label").notNull(),
    status: text("status").notNull().default("active"),
    accessTokenHash: text("access_token_hash").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason")
  },
  (table) => [
    check("mobile_sessions_platform_check", sql`${table.platform} in ('ios', 'android')`),
    check("mobile_sessions_status_check", sql`${table.status} in ('active', 'revoked')`),
    check(
      "mobile_sessions_device_label_check",
      sql`${table.deviceLabel} = btrim(${table.deviceLabel}) and char_length(${table.deviceLabel}) between 1 and 120`
    ),
    check(
      "mobile_sessions_access_token_hash_check",
      sql`${table.accessTokenHash} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "mobile_sessions_timestamp_order_check",
      sql`${table.lastUsedAt} >= ${table.createdAt}
        and ${table.accessTokenExpiresAt} > ${table.lastUsedAt}
        and ${table.accessTokenExpiresAt} <= ${table.expiresAt}`
    ),
    check(
      "mobile_sessions_lifecycle_check",
      sql`(${table.status} = 'active' and ${table.revokedAt} is null and ${table.revokedReason} is null)
        or (${table.status} = 'revoked' and ${table.revokedAt} is not null
          and ${table.revokedAt} >= ${table.createdAt}
          and ${table.revokedReason} is not null
          and ${table.revokedReason} = btrim(${table.revokedReason})
          and char_length(${table.revokedReason}) between 1 and 120)`
    ),
    uniqueIndex("mobile_sessions_access_token_hash_unique").on(table.accessTokenHash),
    index("mobile_sessions_active_user_index")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    index("mobile_sessions_expires_at_index").on(table.expiresAt)
  ]
);

export const mobileRefreshTokens = pgTable(
  "mobile_refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => mobileSessions.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "mobile_refresh_tokens_status_check",
      sql`${table.status} in ('active', 'consumed', 'revoked')`
    ),
    check("mobile_refresh_tokens_token_hash_check", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "mobile_refresh_tokens_timestamp_order_check",
      sql`${table.expiresAt} > ${table.createdAt}
        and (${table.consumedAt} is null
          or (${table.consumedAt} >= ${table.createdAt} and ${table.consumedAt} <= ${table.expiresAt}))`
    ),
    check(
      "mobile_refresh_tokens_lifecycle_check",
      sql`(${table.status} = 'active' and ${table.consumedAt} is null)
        or (${table.status} = 'consumed' and ${table.consumedAt} is not null)
        or (${table.status} = 'revoked' and ${table.consumedAt} is null)`
    ),
    uniqueIndex("mobile_refresh_tokens_token_hash_unique").on(table.tokenHash),
    uniqueIndex("mobile_refresh_tokens_one_active_per_session")
      .on(table.sessionId)
      .where(sql`${table.status} = 'active'`),
    index("mobile_refresh_tokens_session_id_index").on(table.sessionId),
    index("mobile_refresh_tokens_consumed_at_index").on(table.consumedAt)
  ]
);

export const mobileRefreshRetryReceipts = pgTable(
  "mobile_refresh_retry_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    refreshTokenId: uuid("refresh_token_id")
      .notNull()
      .references(() => mobileRefreshTokens.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id").notNull(),
    encryptedTokenPair: text("encrypted_token_pair").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "mobile_refresh_retry_receipts_timestamp_order_check",
      sql`${table.expiresAt} > ${table.createdAt}`
    ),
    check(
      "mobile_refresh_retry_receipts_ciphertext_check",
      sql`char_length(${table.encryptedTokenPair}) between 1 and 4096`
    ),
    uniqueIndex("mobile_refresh_retry_receipts_operation_unique").on(
      table.refreshTokenId,
      table.operationId
    ),
    index("mobile_refresh_retry_receipts_expires_at_index").on(table.expiresAt)
  ]
);

/**
 * Commit-time family integrity cannot be expressed by a PostgreSQL CHECK because it spans the
 * session parent and refresh-token children. The migration must append this SQL after both tables.
 */
export const mobileSessionIntegritySql = `
create or replace function mobile_validate_session_family()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  target_session_id uuid;
  family mobile_sessions%rowtype;
  active_refresh_count bigint;
  invalid_expiry_count bigint;
begin
  if tg_table_name = 'mobile_sessions' then
    target_session_id := coalesce(new.id, old.id);
  else
    target_session_id := coalesce(new.session_id, old.session_id);
  end if;

  select * into family
  from public.mobile_sessions
  where id = target_session_id
  for update;

  if not found then
    return null;
  end if;

  select
    count(*) filter (where status = 'active'),
    count(*) filter (
      where expires_at > family.expires_at
        or (status = 'active' and expires_at is distinct from family.expires_at)
        or created_at < family.created_at
    )
  into active_refresh_count, invalid_expiry_count
  from public.mobile_refresh_tokens
  where session_id = target_session_id;

  if invalid_expiry_count <> 0 then
    raise exception 'mobile refresh token expiry is outside its session family'
      using errcode = '23514';
  end if;

  if family.status = 'active' and active_refresh_count <> 1 then
    raise exception 'active mobile session must have exactly one active refresh token'
      using errcode = '23514';
  end if;

  if family.status = 'revoked' and active_refresh_count <> 0 then
    raise exception 'revoked mobile session cannot have an active refresh token'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create or replace function mobile_guard_session_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' then
      raise exception 'mobile sessions must be created active' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'revoked' then
    raise exception 'revoked mobile session is immutable' using errcode = '23514';
  end if;

  if old.user_id is distinct from new.user_id
    or old.platform is distinct from new.platform
    or old.device_label is distinct from new.device_label
    or old.created_at is distinct from new.created_at then
    raise exception 'mobile session identity is immutable' using errcode = '23514';
  end if;

  if new.status = 'active' then
    if new.revoked_at is not null or new.revoked_reason is not null
      or new.last_used_at < old.last_used_at
      or new.expires_at < old.expires_at then
      raise exception 'mobile session active transition is not allowed' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status <> 'revoked'
    or new.revoked_at is null
    or new.revoked_at < old.created_at
    or new.revoked_reason is null
    or btrim(new.revoked_reason) = ''
    or new.access_token_hash is distinct from old.access_token_hash
    or new.access_token_expires_at is distinct from old.access_token_expires_at
    or new.last_used_at is distinct from old.last_used_at
    or new.expires_at is distinct from old.expires_at then
    raise exception 'mobile session revocation transition is not allowed' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function mobile_guard_refresh_token_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' or new.consumed_at is not null then
      raise exception 'mobile refresh tokens must be created active' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.session_id is distinct from new.session_id
    or old.token_hash is distinct from new.token_hash
    or old.created_at is distinct from new.created_at
    or old.expires_at is distinct from new.expires_at then
    raise exception 'mobile refresh token binding is immutable' using errcode = '23514';
  end if;

  if old.status <> 'active'
    or (new.status = 'consumed' and (new.consumed_at is null
      or new.consumed_at < old.created_at or new.consumed_at > old.expires_at))
    or (new.status = 'revoked' and new.consumed_at is not null)
    or new.status not in ('consumed', 'revoked') then
    raise exception 'mobile refresh token transition is not allowed' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger mobile_sessions_mutation_guard
before insert or update on mobile_sessions
for each row execute function mobile_guard_session_mutation();

create trigger mobile_refresh_tokens_mutation_guard
before insert or update on mobile_refresh_tokens
for each row execute function mobile_guard_refresh_token_mutation();

create constraint trigger mobile_sessions_family_integrity
after insert or update or delete on mobile_sessions
deferrable initially deferred
for each row execute function mobile_validate_session_family();

create constraint trigger mobile_refresh_tokens_family_integrity
after insert or update or delete on mobile_refresh_tokens
deferrable initially deferred
for each row execute function mobile_validate_session_family();
`;
