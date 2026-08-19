import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Pool } from "pg";
import { createPostgresConnectionConfig } from "../src/index";
import { reconcileAuditActorSubjects } from "./audit-actor-subject-reconciliation";
import {
  dictionarySeedCategories,
  dictionarySeedPlatformEntries
} from "./dictionary-seed-data/index";
import {
  defaultClientCheckoutPreparePolicySeedData,
  defaultFinancePolicySeedData
} from "./finance-policy-seed-data";
import { reconcileFlowRuntimeControlAuthority } from "./flow-runtime-control-reconciliation";
import { productTemplateSeedData } from "./product-template-seed-data/index";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(currentDirectory, "../../../.env"), quiet: true });
config({ path: resolve(currentDirectory, "../../../.env.example"), quiet: true });

const { connectionString } = createPostgresConnectionConfig();
const pool = new Pool({ connectionString });

async function main() {
  try {
    await pool.query("select 1");
    await seedFlowRuntimeControlAuthority();
    await seedDictionaryCategories();
    await seedDictionaryPlatformEntries();
    await seedDefaultFinancePolicy();
    await seedDefaultClientCheckoutPreparePolicy();
    await seedProductTemplates();
    console.log(
      `Database seed completed: ${dictionarySeedCategories.length} dictionary categories, ${dictionarySeedPlatformEntries.length} dictionary platform entries, default finance prerequisites reconciled and ${productTemplateSeedData.length} product templates upserted`
    );
  } finally {
    await pool.end();
  }
}

async function seedFlowRuntimeControlAuthority() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await reconcileAuditActorSubjects(client);
    await reconcileFlowRuntimeControlAuthority(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedDictionaryCategories() {
  const valuesSql = dictionarySeedCategories
    .map((_, index) => {
      const parameterOffset = index * 3;

      return `($${parameterOffset + 1}, $${parameterOffset + 2}, $${parameterOffset + 3})`;
    })
    .join(", ");
  const values = dictionarySeedCategories.flatMap((category) => [
    category.code,
    category.name,
    category.order
  ]);

  await pool.query(
    `insert into dictionary_categories (code, name, "order")
     values ${valuesSql}
     on conflict (code) do update
     set name = excluded.name,
         "order" = excluded."order",
         updated_at = now()`,
    values
  );
}

async function seedDictionaryPlatformEntries() {
  if (dictionarySeedPlatformEntries.length === 0) {
    return;
  }

  const valuesSql = dictionarySeedPlatformEntries
    .map((_, index) => {
      const parameterOffset = index * 6;

      return `($${parameterOffset + 1}, $${parameterOffset + 2}, $${parameterOffset + 3}, $${parameterOffset + 4}, $${parameterOffset + 5}, $${parameterOffset + 6})`;
    })
    .join(", ");
  const values = dictionarySeedPlatformEntries.flatMap((entry) => [
    entry.categoryCode,
    entry.code,
    entry.locale,
    entry.title,
    entry.content,
    entry.status
  ]);

  await pool.query(
    `insert into dictionary_platform_entries (category_id, code, locale, title, content, status)
     select categories.id,
            seed_entries.code,
            seed_entries.locale,
            seed_entries.title,
            seed_entries.content,
            seed_entries.status
     from (values ${valuesSql})
       as seed_entries(category_code, code, locale, title, content, status)
     inner join dictionary_categories categories
       on categories.code = seed_entries.category_code
     on conflict (category_id, code, locale) do update
     set title = excluded.title,
         content = excluded.content,
         status = excluded.status,
         updated_at = now()`,
    values
  );
}

async function seedDefaultFinancePolicy() {
  await pool.query(
    `insert into finance_policies (
       policy_version,
       risk_tier,
       hold_duration_hours,
       reserve_bps,
       reserve_release_delay_days,
       provider_settlement_required,
       is_active,
       created_by_user_id,
       snapshotted_at,
       created_at
     )
     select seed_versions.next_policy_version,
            $1,
            $2,
            $3,
            $4,
            $5,
            true,
            null,
            now(),
            now()
     from (
       select coalesce(max(policy_version), 0) + 1 as next_policy_version
       from finance_policies
     ) seed_versions
     where not exists (
       select 1
       from finance_policies
       where risk_tier = $1
         and is_active = true
     )`,
    [
      defaultFinancePolicySeedData.riskTier,
      defaultFinancePolicySeedData.holdDurationHours,
      defaultFinancePolicySeedData.reserveBps,
      defaultFinancePolicySeedData.reserveReleaseDelayDays,
      defaultFinancePolicySeedData.providerSettlementRequired
    ]
  );
}

async function seedDefaultClientCheckoutPreparePolicy() {
  const seed = defaultClientCheckoutPreparePolicySeedData;

  await pool.query(
    `insert into finance_operation_resource_policy_versions (
       policy_id,
       version,
       operation_kind,
       draft_revision,
       lifecycle,
       maximum_rows,
       maximum_decimal_digits,
       maximum_artifact_bytes,
       canonical_preimage,
       canonical_digest,
       created_at,
       published_at,
       retired_at
     )
     select $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            now(),
            now(),
            null
     where not exists (
       select 1
       from finance_operation_resource_policy_versions
       where operation_kind = $3
         and lifecycle = 'published'
     )`,
    [
      seed.policyId,
      seed.version,
      seed.operationKind,
      seed.draftRevision,
      seed.lifecycle,
      seed.maximumRows,
      seed.maximumDecimalDigits,
      seed.maximumArtifactBytes,
      seed.canonicalPreimage,
      seed.canonicalDigest
    ]
  );

  const result = await pool.query<{ canonical_digest: string }>(
    `select canonical_digest
     from finance_operation_resource_policy_versions
     where operation_kind = $1
       and lifecycle = 'published'`,
    [seed.operationKind]
  );

  if (result.rowCount !== 1 || result.rows[0]?.canonical_digest !== seed.canonicalDigest) {
    throw new Error(
      `Published ${seed.operationKind} resource policy does not match the canonical seed`
    );
  }
}

async function seedProductTemplates() {
  if (productTemplateSeedData.length === 0) {
    return;
  }

  const valuesSql = productTemplateSeedData
    .map((_, index) => {
      const parameterOffset = index * 9;

      return `($${parameterOffset + 1}, $${parameterOffset + 2}, $${parameterOffset + 3}, $${parameterOffset + 4}, $${parameterOffset + 5}, $${parameterOffset + 6}, $${parameterOffset + 7}, $${parameterOffset + 8}, $${parameterOffset + 9}::jsonb)`;
    })
    .join(", ");
  const values = productTemplateSeedData.flatMap((template) => [
    template.code,
    template.locale,
    template.type,
    template.status,
    template.title,
    template.subtitle,
    template.description,
    template.sortOrder,
    JSON.stringify(template.payload)
  ]);

  await pool.query(
    `insert into product_templates (
       code, locale, type, status, title, subtitle, description, sort_order, payload
     )
     values ${valuesSql}
     on conflict (code, locale) do update
     set type = excluded.type,
         status = excluded.status,
         title = excluded.title,
         subtitle = excluded.subtitle,
         description = excluded.description,
         sort_order = excluded.sort_order,
         payload = excluded.payload,
         updated_at = now()`,
    values
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
