import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";

import {
  canonicalizePlatformTariffTerms,
  createPlatformTariffDraft,
  publishPlatformTariffDraft
} from "@elevenhouse/domain";
import { createPostgresConnectionConfig } from "../src/index";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(currentDirectory, "../../../.env"), quiet: true });
config({ path: resolve(currentDirectory, "../../../.env.example"), quiet: true });

const repairConfirmation = "--confirm=repair-production-tariff-entitlements";
const applicationName = "elevenhouse_repair_production_tariff_entitlements";
const farFutureEndsAt = "2099-01-01T00:00:00.000Z";

// Only include capabilities whose API surfaces are wired to the tariff entitlement guard.
// The broader marketing plan seed still contains features that intentionally fail publication
// until their enforcement mapping is complete.
const proTariffFeatures = ["funnels", "products"].sort();

const proTariff = publishPlatformTariffDraft(
  createPlatformTariffDraft({
    tariffSeriesId: "pro",
    version: 1,
    name: "Pro",
    tagline: "Для активной практики",
    monthlyPriceMinor: 199_000,
    yearlyPriceMinor: 1_910_000,
    monthlyRecurringFrequencyDays: 31,
    yearlyRecurringFrequencyDays: 365,
    clientSaleCommissionBps: 400,
    seatsLimit: 1,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: true,
    displayOrder: 1,
    features: proTariffFeatures as never
  })
);

type ActiveAstrologerRow = {
  readonly owner_user_id: string;
  readonly public_name: string | null;
  readonly public_handle: string | null;
};

async function main(): Promise<void> {
  const { connectionString } = createPostgresConnectionConfig();
  const parsedUrl = new URL(connectionString);
  const isLocalTarget = ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
  const confirmationArgs = process.argv.slice(2);
  if (!isLocalTarget && !confirmationArgs.includes(repairConfirmation)) {
    throw new Error(`Production repair requires explicit ${repairConfirmation}`);
  }

  const pool = new Pool({
    connectionString,
    application_name: applicationName,
    options: "-c lock_timeout=10s -c statement_timeout=120s"
  });
  try {
    await pool.query("select 1");
    const result = await runRepair(pool);
    console.log(
      [
        `Production tariff entitlement repair completed`,
        `target=${redactedTarget(parsedUrl)}`,
        `tariff=${proTariff.tariffSeriesId}@${proTariff.version}`,
        `digest=${proTariff.canonicalDigest}`,
        `createdTariff=${result.createdTariff}`,
        `createdSubscriptions=${result.createdSubscriptions}`,
        `skippedAstrologersWithCurrentSubscription=${result.skippedAstrologersWithCurrentSubscription}`
      ].join(" ")
    );
  } finally {
    await pool.end();
  }
}

async function runRepair(pool: Pool): Promise<{
  readonly createdTariff: boolean;
  readonly createdSubscriptions: number;
  readonly skippedAstrologersWithCurrentSubscription: number;
}> {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    await client.query(
      "select pg_advisory_xact_lock(hashtext('elevenhouse:repair-production-tariff-entitlements'))"
    );
    const createdTariff = await ensureProTariff(client);
    const subscriptionResult = await ensureActiveAstrologerSubscriptions(client);
    await client.query("COMMIT");
    inTransaction = false;
    return { createdTariff, ...subscriptionResult };
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureProTariff(client: PoolClient): Promise<boolean> {
  await client.query(
    `insert into platform_tariff_series (id, code)
     values ($1, $1)
     on conflict (id) do nothing`,
    [proTariff.tariffSeriesId]
  );

  const existing = await client.query<{
    readonly canonical_digest: string;
    readonly lifecycle: string;
  }>(
    `select canonical_digest, lifecycle
       from platform_tariff_versions
      where tariff_series_id = $1 and version = $2
      for update`,
    [proTariff.tariffSeriesId, proTariff.version]
  );
  const existingRow = existing.rows[0];
  if (existingRow) {
    if (existingRow.canonical_digest !== proTariff.canonicalDigest) {
      throw new Error(
        `Existing pro tariff digest ${existingRow.canonical_digest} does not match repair digest ${proTariff.canonicalDigest}`
      );
    }
    if (existingRow.lifecycle !== "published" && existingRow.lifecycle !== "retired") {
      throw new Error(`Existing pro tariff lifecycle ${existingRow.lifecycle} is not usable`);
    }
    return false;
  }

  await client.query(
    `insert into platform_tariff_versions (
       tariff_series_id,
       version,
       draft_revision,
       lifecycle,
       name,
       tagline,
       monthly_price_minor,
       yearly_price_minor,
       monthly_recurring_frequency_days,
       yearly_recurring_frequency_days,
       currency,
       client_sale_commission_bps,
       seats_limit,
       bookings_limit,
       ai_requests_limit,
       automation_limit,
       is_popular,
       display_order,
       canonical_preimage,
       canonical_digest,
       published_at
     ) values (
       $1, $2, $3, 'published', $4, $5, $6, $7, $8, $9, 'RUB', $10, $11, $12, $13, $14, $15, $16, $17, $18, clock_timestamp()
     )`,
    [
      proTariff.tariffSeriesId,
      proTariff.version,
      proTariff.draftRevision,
      proTariff.name,
      proTariff.tagline,
      proTariff.monthlyPriceMinor,
      proTariff.yearlyPriceMinor,
      proTariff.monthlyRecurringFrequencyDays,
      proTariff.yearlyRecurringFrequencyDays,
      proTariff.clientSaleCommissionBps,
      proTariff.seatsLimit,
      proTariff.bookingsLimit,
      proTariff.aiRequestsLimit,
      proTariff.automationLimit,
      proTariff.isPopular,
      proTariff.displayOrder,
      canonicalizePlatformTariffTerms(proTariff),
      proTariff.canonicalDigest
    ]
  );

  for (const capability of proTariff.features) {
    await client.query(
      `insert into platform_tariff_version_capabilities (tariff_series_id, tariff_version, capability)
       values ($1, $2, $3)`,
      [proTariff.tariffSeriesId, proTariff.version, capability]
    );
  }
  return true;
}

async function ensureActiveAstrologerSubscriptions(client: PoolClient): Promise<{
  readonly createdSubscriptions: number;
  readonly skippedAstrologersWithCurrentSubscription: number;
}> {
  const astrologers = await client.query<ActiveAstrologerRow>(
    `select profile.owner_user_id,
            profile.public_name,
            profile.public_handle
       from astrologer_profiles profile
       inner join users owner on owner.id = profile.owner_user_id
      where owner.status = 'active'
      order by profile.owner_user_id`
  );

  let createdSubscriptions = 0;
  let skippedAstrologersWithCurrentSubscription = 0;
  for (const astrologer of astrologers.rows) {
    const current = await client.query(
      `select id
         from platform_tariff_subscriptions
        where owner_user_id = $1
          and state in ('incomplete_setup', 'awaiting_initial_payment', 'active', 'past_due')
        limit 1
        for update`,
      [astrologer.owner_user_id]
    );
    if (current.rowCount > 0) {
      skippedAstrologersWithCurrentSubscription += 1;
      continue;
    }

    await client.query(
      `insert into platform_tariff_subscriptions (
         id,
         owner_user_id,
         tariff_series_id,
         tariff_version,
         tariff_version_digest,
         commission_bps_snapshot,
         billing_cycle,
         state,
         version,
         starts_at,
         ends_at
       ) values (
         $1, $2, $3, $4, $5, $6, 'year', 'active', 1, clock_timestamp(), $7::timestamptz
       )`,
      [
        randomUUID(),
        astrologer.owner_user_id,
        proTariff.tariffSeriesId,
        proTariff.version,
        proTariff.canonicalDigest,
        proTariff.clientSaleCommissionBps,
        farFutureEndsAt
      ]
    );
    createdSubscriptions += 1;
  }

  return { createdSubscriptions, skippedAstrologersWithCurrentSubscription };
}

function redactedTarget(url: URL): string {
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  return `${url.protocol}//${url.hostname}:${url.port || "5432"}/${databaseName}`;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
