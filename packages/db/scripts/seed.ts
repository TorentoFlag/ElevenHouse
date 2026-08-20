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
import { resolveArcPayProviderAccountSeedData } from "./finance-provider-account-seed-data";
import {
  defaultClientOrderCapturePolicySeedData,
  defaultClientCheckoutPreparePolicySeedData,
  defaultFinanceArtifactRetentionPolicySeedData,
  defaultFinancePolicySeedData,
  defaultFinanceRiskPolicyAuthoritySeedData
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
    await seedDefaultFinanceRiskPolicyAuthority();
    await seedDefaultFinanceArtifactRetentionPolicies();
    await seedDefaultClientOrderResourcePolicies();
    await seedArcPayProviderAccount();
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

async function seedDefaultFinanceRiskPolicyAuthority() {
  const seed = defaultFinanceRiskPolicyAuthoritySeedData;

  await pool.query(
    `insert into finance_risk_policy_versions (
       policy_id,
       policy_version,
       effective_risk_tier,
       hold_anchor,
       hold_duration_hours,
       reserve_bps,
       reserve_release_delay_days,
       provider_settlement_required,
       payout_minimum_amount_minor,
       payout_minimum_currency,
       exception_authority_id,
       exception_authority_version,
       effective_at
     )
     select active_policy.id::varchar,
            active_policy.policy_version::numeric,
            active_policy.risk_tier,
            $2,
            active_policy.hold_duration_hours,
            active_policy.reserve_bps,
            active_policy.reserve_release_delay_days,
            active_policy.provider_settlement_required,
            $3::numeric,
            $4,
            null,
            null,
            to_char(active_policy.snapshotted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     from finance_policies active_policy
     where active_policy.risk_tier = $1
       and active_policy.is_active = true
     on conflict (policy_id, policy_version) do nothing`,
    [
      defaultFinancePolicySeedData.riskTier,
      seed.holdAnchor,
      seed.payoutMinimumAmountMinor,
      seed.payoutMinimumCurrency
    ]
  );

  const result = await pool.query<{
    effective_risk_tier: string;
    hold_anchor: string;
    hold_duration_hours: number;
    reserve_bps: number;
    reserve_release_delay_days: number;
    provider_settlement_required: boolean;
    payout_minimum_amount_minor: string;
    payout_minimum_currency: string;
  }>(
    `select risk.effective_risk_tier,
            risk.hold_anchor,
            risk.hold_duration_hours,
            risk.reserve_bps,
            risk.reserve_release_delay_days,
            risk.provider_settlement_required,
            risk.payout_minimum_amount_minor::text,
            risk.payout_minimum_currency
     from finance_policies active_policy
     inner join finance_risk_policy_versions risk
       on risk.policy_id = active_policy.id::varchar
      and risk.policy_version = active_policy.policy_version::numeric
     where active_policy.risk_tier = $1
       and active_policy.is_active = true`,
    [defaultFinancePolicySeedData.riskTier]
  );

  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    !row ||
    row.effective_risk_tier !== defaultFinancePolicySeedData.riskTier ||
    row.hold_anchor !== seed.holdAnchor ||
    row.hold_duration_hours !== defaultFinancePolicySeedData.holdDurationHours ||
    row.reserve_bps !== defaultFinancePolicySeedData.reserveBps ||
    row.reserve_release_delay_days !== defaultFinancePolicySeedData.reserveReleaseDelayDays ||
    row.provider_settlement_required !== defaultFinancePolicySeedData.providerSettlementRequired ||
    row.payout_minimum_amount_minor !== String(seed.payoutMinimumAmountMinor) ||
    row.payout_minimum_currency !== seed.payoutMinimumCurrency
  ) {
    throw new Error("Active standard finance risk authority does not match the canonical seed");
  }
}

async function seedDefaultClientOrderResourcePolicies() {
  await seedDefaultClientOrderResourcePolicy(defaultClientCheckoutPreparePolicySeedData);
  await seedDefaultClientOrderResourcePolicy(defaultClientOrderCapturePolicySeedData);
}

async function seedDefaultClientOrderResourcePolicy(seed: typeof defaultClientCheckoutPreparePolicySeedData) {
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

async function seedDefaultFinanceArtifactRetentionPolicies() {
  if (defaultFinanceArtifactRetentionPolicySeedData.length === 0) {
    return;
  }

  const valuesSql = defaultFinanceArtifactRetentionPolicySeedData
    .map((_, index) => {
      const parameterOffset = index * 5;

      return `($${parameterOffset + 1}, $${parameterOffset + 2}, $${parameterOffset + 3}, $${parameterOffset + 4}, $${parameterOffset + 5})`;
    })
    .join(", ");
  const values = defaultFinanceArtifactRetentionPolicySeedData.flatMap((policy) => [
    policy.policyId,
    policy.policyVersion,
    policy.artifactClass,
    policy.retainForSeconds,
    policy.authorityRef
  ]);

  await pool.query(
    `insert into finance_artifact_retention_policies (
       policy_id,
       policy_version,
       artifact_class,
       retain_for_seconds,
       authority_ref,
       effective_at,
       created_at
     )
     select seed_policies.policy_id,
            seed_policies.policy_version::numeric,
            seed_policies.artifact_class,
            seed_policies.retain_for_seconds::numeric,
            seed_policies.authority_ref,
            timestamp with time zone '2026-08-20 00:00:00+00',
            now()
     from (values ${valuesSql})
       as seed_policies(policy_id, policy_version, artifact_class, retain_for_seconds, authority_ref)
     on conflict (policy_id, policy_version) do nothing`,
    values
  );

  const result = await pool.query<{
    policy_id: string;
    policy_version: string;
    artifact_class: string;
    retain_for_seconds: string;
    authority_ref: string;
  }>(
    `select policy_id,
            policy_version::text,
            artifact_class,
            retain_for_seconds::text,
            authority_ref
     from finance_artifact_retention_policies
     where (policy_id, policy_version) in (${defaultFinanceArtifactRetentionPolicySeedData
       .map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2}::numeric)`)
       .join(", ")})
     order by policy_id`,
    defaultFinanceArtifactRetentionPolicySeedData.flatMap((policy) => [
      policy.policyId,
      policy.policyVersion
    ])
  );

  const actualPolicies = new Map(
    result.rows.map((row) => [
      `${row.policy_id}:${row.policy_version}`,
      {
        artifactClass: row.artifact_class,
        retainForSeconds: row.retain_for_seconds,
        authorityRef: row.authority_ref
      }
    ])
  );

  for (const policy of defaultFinanceArtifactRetentionPolicySeedData) {
    const actual = actualPolicies.get(`${policy.policyId}:${policy.policyVersion}`);
    if (
      !actual ||
      actual.artifactClass !== policy.artifactClass ||
      actual.retainForSeconds !== policy.retainForSeconds ||
      actual.authorityRef !== policy.authorityRef
    ) {
      throw new Error(
        `Finance artifact retention policy ${policy.policyId}@${policy.policyVersion} does not match the canonical seed`
      );
    }
  }
}

async function seedArcPayProviderAccount() {
  const seed = resolveArcPayProviderAccountSeedData(process.env);
  if (!seed) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into finance_provider_account_series (
         series_id,
         provider,
         active_identity_version,
         head_version,
         created_at
       )
       select $1::varchar,
              $2::text,
              $3::integer,
              $3::numeric,
              now()
       where not exists (
         select 1
         from finance_provider_account_series
         where provider = $2::text
       )`,
      [seed.seriesId, seed.provider, seed.identityVersion]
    );
    await client.query(
      `insert into finance_provider_accounts (
         series_id,
         provider_account_id,
         identity_version,
         provider,
         merchant_tenant_id,
         terminal_scope,
         settlement_scope,
         predecessor_provider_account_id,
         predecessor_identity_version,
         created_at
       )
       select $1::varchar,
              $2::varchar,
              $3::integer,
              $4::text,
              $5::varchar,
              $6::varchar,
              $7::varchar,
              null,
              null,
              now()
       where exists (
         select 1
         from finance_provider_account_series
         where series_id = $1::varchar
           and provider = $4::text
           and active_identity_version = $3::integer
       )
         and not exists (
           select 1
           from finance_provider_accounts
           where provider = $4::text
         )`,
      [
        seed.seriesId,
        seed.providerAccountId,
        seed.identityVersion,
        seed.provider,
        seed.merchantTenantId,
        seed.terminalScope,
        seed.settlementScope
      ]
    );
    const result = await client.query<{
      series_id: string;
      provider_account_id: string;
      identity_version: number;
      provider: "arc_pay";
      merchant_tenant_id: string;
      terminal_scope: string;
      settlement_scope: string;
    }>(
      `select series.series_id,
              account.provider_account_id,
              account.identity_version,
              account.provider,
              account.merchant_tenant_id,
              account.terminal_scope,
              account.settlement_scope
       from finance_provider_account_series series
       inner join finance_provider_accounts account
         on account.series_id = series.series_id
        and account.provider = series.provider
        and account.identity_version = series.active_identity_version
       where series.provider = $1`,
      [seed.provider]
    );

    const row = result.rows[0];
    if (
      result.rowCount !== 1 ||
      row?.series_id !== seed.seriesId ||
      row.provider_account_id !== seed.providerAccountId ||
      row.identity_version !== seed.identityVersion ||
      row.provider !== seed.provider ||
      row.merchant_tenant_id !== seed.merchantTenantId ||
      row.terminal_scope !== seed.terminalScope ||
      row.settlement_scope !== seed.settlementScope
    ) {
      throw new Error("Active ArcPay provider account does not match the canonical seed");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
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
