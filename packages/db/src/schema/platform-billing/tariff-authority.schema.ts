import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import { formatPlatformBillingSqlValues, platformPlanFeatureValues } from "./platform-billing-values";

const tariffLifecycleValues = ["draft", "published", "retired"] as const;
export const tariffSubscriptionStateValues = [
  "incomplete_setup",
  "awaiting_initial_payment",
  "active",
  "past_due",
  "cancelled",
  "expired"
] as const;
export const tariffInvoiceStateValues = [
  "open",
  "payment_pending",
  "requires_customer_action",
  "captured",
  "declined",
  "failed",
  "provider_unknown",
  "void",
  "uncollectible"
] as const;
const tariffBillingCycleValues = ["month", "year"] as const;
const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/** Stable admin-facing tariff identity. Commercial terms live only in immutable version rows. */
export const platformTariffSeries = pgTable(
  "platform_tariff_series",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    code: varchar("code", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("platform_tariff_series_code_unique").on(table.code),
    check(
      "platform_tariff_series_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160 and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]' and length(trim(${table.code})) between 1 and 80
        and ${table.code} = trim(${table.code}) and ${table.code} !~ '[[:cntrl:]]'`
    )
  ]
);

/**
 * A publication seals commercial terms and entitlement payload. Revisions are never overwritten;
 * a correction is a new draft version of the same series.
 */
export const platformTariffVersions = pgTable(
  "platform_tariff_versions",
  {
    tariffSeriesId: varchar("tariff_series_id", { length: 160 }).notNull(),
    version: integer("version").notNull(),
    draftRevision: integer("draft_revision").notNull().default(1),
    lifecycle: text("lifecycle").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    tagline: varchar("tagline", { length: 240 }).notNull(),
    monthlyPriceMinor: integer("monthly_price_minor").notNull(),
    yearlyPriceMinor: integer("yearly_price_minor").notNull(),
    monthlyRecurringFrequencyDays: integer("monthly_recurring_frequency_days"),
    yearlyRecurringFrequencyDays: integer("yearly_recurring_frequency_days"),
    currency: text("currency").notNull().default("RUB"),
    clientSaleCommissionBps: integer("client_sale_commission_bps").notNull(),
    seatsLimit: integer("seats_limit"),
    bookingsLimit: integer("bookings_limit"),
    aiRequestsLimit: integer("ai_requests_limit"),
    automationLimit: integer("automation_limit"),
    isPopular: boolean("is_popular").notNull().default(false),
    displayOrder: integer("display_order").notNull(),
    canonicalPreimage: text("canonical_preimage").notNull().default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull().default(sql`''`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true })
  },
  (table) => [
    primaryKey({ columns: [table.tariffSeriesId, table.version], name: "platform_tariff_versions_pk" }),
    foreignKey({
      columns: [table.tariffSeriesId],
      foreignColumns: [platformTariffSeries.id],
      name: "platform_tariff_versions_series_fk"
    }).onDelete("restrict"),
    unique("platform_tariff_versions_exact_digest_unique").on(
      table.tariffSeriesId,
      table.version,
      table.canonicalDigest
    ),
    uniqueIndex("platform_tariff_versions_digest_unique").on(table.canonicalDigest),
    check(
      "platform_tariff_versions_lifecycle_check",
      sql`${table.lifecycle} in ${sql.raw(formatPlatformBillingSqlValues(tariffLifecycleValues))}
        and ${table.currency} = 'RUB'
        and ${table.version} >= 1 and ${table.draftRevision} >= 1
        and ${table.monthlyPriceMinor} >= 0 and ${table.yearlyPriceMinor} >= 0
        and ((${table.monthlyPriceMinor} = 0 and ${table.monthlyRecurringFrequencyDays} is null)
          or (${table.monthlyPriceMinor} > 0 and ${table.monthlyRecurringFrequencyDays} between 1 and 366))
        and ((${table.yearlyPriceMinor} = 0 and ${table.yearlyRecurringFrequencyDays} is null)
          or (${table.yearlyPriceMinor} > 0 and ${table.yearlyRecurringFrequencyDays} between 1 and 366))
        and ${table.clientSaleCommissionBps} between 0 and 10000
        and ${table.displayOrder} >= 0
        and (${table.seatsLimit} is null or ${table.seatsLimit} > 0)
        and (${table.bookingsLimit} is null or ${table.bookingsLimit} > 0)
        and (${table.aiRequestsLimit} is null or ${table.aiRequestsLimit} > 0)
        and (${table.automationLimit} is null or ${table.automationLimit} > 0)
        and ${table.canonicalDigest} ~ ${digestPattern}
        and length(${table.canonicalPreimage}) between 1 and 32000
        and ((${table.lifecycle} = 'draft' and ${table.publishedAt} is null and ${table.retiredAt} is null)
          or (${table.lifecycle} = 'published' and ${table.publishedAt} is not null and ${table.retiredAt} is null)
          or (${table.lifecycle} = 'retired' and ${table.publishedAt} is not null and ${table.retiredAt} is not null))`
    ),
    index("platform_tariff_versions_public_lookup_idx").on(
      table.lifecycle,
      table.displayOrder,
      table.tariffSeriesId,
      table.version
    )
  ]
);

export const platformTariffVersionCapabilities = pgTable(
  "platform_tariff_version_capabilities",
  {
    tariffSeriesId: varchar("tariff_series_id", { length: 160 }).notNull(),
    tariffVersion: integer("tariff_version").notNull(),
    capability: text("capability").notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.tariffSeriesId, table.tariffVersion, table.capability],
      name: "platform_tariff_version_capabilities_pk"
    }),
    foreignKey({
      columns: [table.tariffSeriesId, table.tariffVersion],
      foreignColumns: [platformTariffVersions.tariffSeriesId, platformTariffVersions.version],
      name: "platform_tariff_version_capabilities_version_fk"
    }).onDelete("restrict"),
    check(
      "platform_tariff_version_capabilities_value_check",
      sql`${table.capability} in ${sql.raw(formatPlatformBillingSqlValues(platformPlanFeatureValues))}`
    )
  ]
);

/** Exact commercial/entitlement snapshot accepted by an astrologer. */
export const platformTariffSubscriptions = pgTable(
  "platform_tariff_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull(),
    tariffSeriesId: varchar("tariff_series_id", { length: 160 }).notNull(),
    tariffVersion: integer("tariff_version").notNull(),
    tariffVersionDigest: varchar("tariff_version_digest", { length: 71 }).notNull(),
    commissionBpsSnapshot: integer("commission_bps_snapshot").notNull(),
    billingCycle: text("billing_cycle").notNull(),
    state: text("state").notNull(),
    version: integer("version").notNull().default(1),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({ columns: [table.ownerUserId], foreignColumns: [users.id], name: "platform_tariff_subscriptions_owner_fk" }).onDelete("restrict"),
    foreignKey({
      columns: [table.tariffSeriesId, table.tariffVersion, table.tariffVersionDigest],
      foreignColumns: [
        platformTariffVersions.tariffSeriesId,
        platformTariffVersions.version,
        platformTariffVersions.canonicalDigest
      ],
      name: "platform_tariff_subscriptions_version_fk"
    }).onDelete("restrict"),
    unique("platform_tariff_subscriptions_exact_tariff_snapshot_unique").on(
      table.id,
      table.ownerUserId,
      table.tariffSeriesId,
      table.tariffVersion,
      table.tariffVersionDigest
    ),
    uniqueIndex("platform_tariff_subscriptions_one_current_owner_unique")
      .on(table.ownerUserId)
      .where(sql`${table.state} in ('incomplete_setup', 'awaiting_initial_payment', 'active', 'past_due')`),
    check(
      "platform_tariff_subscriptions_shape_check",
      sql`${table.state} in ${sql.raw(formatPlatformBillingSqlValues(tariffSubscriptionStateValues))}
        and ${table.billingCycle} in ${sql.raw(formatPlatformBillingSqlValues(tariffBillingCycleValues))}
        and ${table.commissionBpsSnapshot} between 0 and 10000 and ${table.version} >= 1
        and ${table.tariffVersionDigest} ~ ${digestPattern}
        and ((${table.state} in ('incomplete_setup', 'awaiting_initial_payment') and ${table.startsAt} is null and ${table.endsAt} is null and ${table.cancelledAt} is null)
          or (${table.state} in ('active', 'past_due', 'expired') and ${table.startsAt} is not null and ${table.endsAt} is not null and ${table.endsAt} > ${table.startsAt})
          or (${table.state} = 'cancelled' and ${table.cancelledAt} is not null
            and ((${table.startsAt} is null and ${table.endsAt} is null) or (${table.startsAt} is not null and ${table.endsAt} is not null and ${table.endsAt} > ${table.startsAt}))))`
    ),
    index("platform_tariff_subscriptions_owner_state_idx").on(table.ownerUserId, table.state, table.endsAt)
  ]
);

/** Immutable invoice authority; later capture binds this ID as economic payment sourceId. */
export const platformTariffInvoices = pgTable(
  "platform_tariff_invoices",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    subscriptionId: uuid("subscription_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    tariffSeriesId: varchar("tariff_series_id", { length: 160 }).notNull(),
    tariffVersion: integer("tariff_version").notNull(),
    tariffVersionDigest: varchar("tariff_version_digest", { length: 71 }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("RUB"),
    state: text("state").notNull(),
    /** Monotonic optimistic-lock revision for every invoice state transition. */
    version: integer("version").notNull().default(1),
    billingPeriodStartAt: timestamp("billing_period_start_at", { withTimezone: true }).notNull(),
    billingPeriodEndAt: timestamp("billing_period_end_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [
        table.subscriptionId,
        table.ownerUserId,
        table.tariffSeriesId,
        table.tariffVersion,
        table.tariffVersionDigest
      ],
      foreignColumns: [
        platformTariffSubscriptions.id,
        platformTariffSubscriptions.ownerUserId,
        platformTariffSubscriptions.tariffSeriesId,
        platformTariffSubscriptions.tariffVersion,
        platformTariffSubscriptions.tariffVersionDigest
      ],
      name: "platform_tariff_invoices_subscription_snapshot_fk"
    }).onDelete("restrict"),
    foreignKey({ columns: [table.ownerUserId], foreignColumns: [users.id], name: "platform_tariff_invoices_owner_fk" }).onDelete("restrict"),
    foreignKey({
      columns: [table.tariffSeriesId, table.tariffVersion, table.tariffVersionDigest],
      foreignColumns: [
        platformTariffVersions.tariffSeriesId,
        platformTariffVersions.version,
        platformTariffVersions.canonicalDigest
      ],
      name: "platform_tariff_invoices_version_fk"
    }).onDelete("restrict"),
    uniqueIndex("platform_tariff_invoices_subscription_open_unique")
      .on(table.subscriptionId)
      .where(sql`${table.state} in ('open', 'payment_pending', 'requires_customer_action', 'provider_unknown')`),
    unique("platform_tariff_invoices_subscription_period_unique").on(
      table.subscriptionId,
      table.billingPeriodStartAt
    ),
    check(
      "platform_tariff_invoices_shape_check",
      sql`${table.state} in ${sql.raw(formatPlatformBillingSqlValues(tariffInvoiceStateValues))}
        and ${table.amountMinor} >= 0 and ${table.currency} = 'RUB' and ${table.version} >= 1
        and ${table.tariffVersionDigest} ~ ${digestPattern}
        and ${table.billingPeriodEndAt} > ${table.billingPeriodStartAt}
        and ((${table.state} in ('open', 'payment_pending', 'requires_customer_action', 'declined', 'failed', 'provider_unknown', 'uncollectible') and ${table.capturedAt} is null and ${table.voidedAt} is null)
          or (${table.state} = 'captured' and ${table.capturedAt} is not null and ${table.voidedAt} is null)
          or (${table.state} = 'void' and ${table.voidedAt} is not null))`
    ),
    index("platform_tariff_invoices_owner_created_idx").on(table.ownerUserId, table.createdAt)
  ]
);

/** Baseline owner executes after tariff tables exist to reject mutation of published evidence. */
export const platformTariffAuthorityIntegritySql = `
create or replace function platform_reject_sealed_tariff_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' and old.lifecycle in ('published', 'retired') then
    raise exception 'published tariff version is immutable' using errcode = '55000';
  end if;
  if old.lifecycle = 'retired' then
    raise exception 'published tariff version is immutable' using errcode = '55000';
  end if;
  if old.lifecycle = 'published' and not (
    new.lifecycle = 'retired' and new.retired_at is not null
    and new.tariff_series_id = old.tariff_series_id and new.version = old.version
    and new.draft_revision = old.draft_revision
    and new.name = old.name and new.tagline = old.tagline
    and new.monthly_price_minor = old.monthly_price_minor
    and new.yearly_price_minor = old.yearly_price_minor
    and new.monthly_recurring_frequency_days is not distinct from old.monthly_recurring_frequency_days
    and new.yearly_recurring_frequency_days is not distinct from old.yearly_recurring_frequency_days
    and new.currency = old.currency
    and new.client_sale_commission_bps = old.client_sale_commission_bps
    and new.seats_limit is not distinct from old.seats_limit
    and new.bookings_limit is not distinct from old.bookings_limit
    and new.ai_requests_limit is not distinct from old.ai_requests_limit
    and new.automation_limit is not distinct from old.automation_limit
    and new.is_popular = old.is_popular and new.display_order = old.display_order
    and new.canonical_preimage = old.canonical_preimage and new.canonical_digest = old.canonical_digest
    and new.created_at = old.created_at and new.published_at = old.published_at
  ) then
    raise exception 'published tariff version is immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger platform_tariff_versions_sealed_immutable
before update or delete on platform_tariff_versions
for each row execute function platform_reject_sealed_tariff_mutation();

create or replace function platform_reject_sealed_tariff_capability_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare tariff_lifecycle text;
begin
  select lifecycle into strict tariff_lifecycle
    from platform_tariff_versions
    where tariff_series_id = coalesce(new.tariff_series_id, old.tariff_series_id)
      and version = coalesce(new.tariff_version, old.tariff_version);
  if tariff_lifecycle in ('published', 'retired') then
    raise exception 'published tariff capability set is immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger platform_tariff_version_capabilities_sealed_immutable
before insert or update or delete on platform_tariff_version_capabilities
for each row execute function platform_reject_sealed_tariff_capability_mutation();

create or replace function platform_validate_tariff_subscription_snapshot()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare tariff_state text; tariff_commission integer; tariff_price integer; requires_captured_invoice boolean := false; has_captured_invoice boolean;
begin
  select lifecycle, client_sale_commission_bps,
         case new.billing_cycle when 'month' then monthly_price_minor else yearly_price_minor end
    into strict tariff_state, tariff_commission, tariff_price
    from platform_tariff_versions
   where tariff_series_id = new.tariff_series_id
     and version = new.tariff_version
     and canonical_digest = new.tariff_version_digest;
  if new.commission_bps_snapshot <> tariff_commission then
    raise exception 'tariff subscription commission does not match sealed version' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.state in ('incomplete_setup', 'awaiting_initial_payment', 'active') and tariff_state <> 'published' then
    raise exception 'new tariff subscription requires a published version' using errcode = '23514';
  end if;
  if new.state = 'active' and tariff_price > 0 then
    if tg_op = 'INSERT' then
      requires_captured_invoice := true;
    elsif old.state <> 'active'
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at then
      requires_captured_invoice := true;
    end if;
  end if;
  if requires_captured_invoice then
    select exists (
      select 1 from platform_tariff_invoices invoice
       where invoice.subscription_id = new.id
         and invoice.owner_user_id = new.owner_user_id
         and invoice.tariff_series_id = new.tariff_series_id
         and invoice.tariff_version = new.tariff_version
         and invoice.tariff_version_digest = new.tariff_version_digest
         and invoice.state = 'captured'
         and invoice.billing_period_start_at = new.starts_at
         and invoice.billing_period_end_at = new.ends_at
    ) into has_captured_invoice;
    if not has_captured_invoice then
      raise exception 'paid tariff activation requires a captured invoice for the exact period' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.owner_user_id <> old.owner_user_id
       or new.tariff_series_id <> old.tariff_series_id
       or new.tariff_version <> old.tariff_version
       or new.tariff_version_digest <> old.tariff_version_digest
       or new.commission_bps_snapshot <> old.commission_bps_snapshot
       or new.billing_cycle <> old.billing_cycle
       or new.created_at <> old.created_at then
      raise exception 'tariff subscription snapshot is immutable' using errcode = '55000';
    end if;
    if (old.state = 'incomplete_setup' and new.state not in ('incomplete_setup', 'awaiting_initial_payment', 'cancelled'))
       or (old.state = 'awaiting_initial_payment' and new.state not in ('awaiting_initial_payment', 'active', 'cancelled'))
       or (old.state = 'active' and new.state not in ('active', 'past_due', 'cancelled', 'expired'))
       or (old.state = 'past_due' and new.state not in ('past_due', 'active', 'cancelled', 'expired'))
       or (old.state in ('cancelled', 'expired') and new.state <> old.state) then
      raise exception 'invalid tariff subscription transition' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger platform_tariff_subscriptions_snapshot_immutable
before insert or update on platform_tariff_subscriptions
for each row execute function platform_validate_tariff_subscription_snapshot();

create or replace function platform_validate_tariff_invoice_snapshot()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'tariff invoice is immutable' using errcode = '55000';
  end if;
  if new.subscription_id <> old.subscription_id
     or new.owner_user_id <> old.owner_user_id
     or new.tariff_series_id <> old.tariff_series_id
     or new.tariff_version <> old.tariff_version
     or new.tariff_version_digest <> old.tariff_version_digest
     or new.amount_minor <> old.amount_minor
     or new.currency <> old.currency
     or new.billing_period_start_at <> old.billing_period_start_at
     or new.billing_period_end_at <> old.billing_period_end_at
     or new.created_at <> old.created_at then
    raise exception 'tariff invoice snapshot is immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'tariff invoice version must advance by one' using errcode = '40001';
  end if;
  if (old.state = 'open' and new.state not in ('open', 'payment_pending', 'requires_customer_action', 'declined', 'failed', 'provider_unknown', 'void', 'uncollectible'))
     or (old.state = 'payment_pending' and new.state not in ('payment_pending', 'requires_customer_action', 'captured', 'declined', 'failed', 'provider_unknown', 'void', 'uncollectible'))
     or (old.state = 'requires_customer_action' and new.state not in ('requires_customer_action', 'payment_pending', 'declined', 'failed', 'provider_unknown', 'void', 'uncollectible'))
     or (old.state = 'provider_unknown' and new.state not in ('provider_unknown', 'payment_pending', 'requires_customer_action', 'captured', 'declined', 'failed', 'void', 'uncollectible'))
     or (old.state = 'declined' and new.state not in ('declined', 'payment_pending', 'requires_customer_action', 'failed', 'uncollectible', 'void'))
     or (old.state = 'failed' and new.state not in ('failed', 'payment_pending', 'requires_customer_action', 'uncollectible', 'void'))
     or (old.state in ('captured', 'void', 'uncollectible') and new.state <> old.state) then
    raise exception 'invalid tariff invoice transition' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger platform_tariff_invoices_snapshot_immutable
before update or delete on platform_tariff_invoices
for each row execute function platform_validate_tariff_invoice_snapshot();
`;
