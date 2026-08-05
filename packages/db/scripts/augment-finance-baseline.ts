import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { financeArtifactImmutabilitySql } from "../src/schema/finance/finance-artifacts.schema";
import { financeBankCashIntegritySql } from "../src/schema/finance/bank-cash.schema";
import { financeBankLiquidityIntegritySql } from "../src/schema/finance/bank-liquidity.schema";
import { financeCanonicalJsonV1Sql } from "../src/schema/finance/canonical-json.sql";
import { financeCaptureAuthoritiesIntegritySql } from "../src/schema/finance/capture-authorities.schema";
import { financeVerifiedCaptureApplicationIntegritySql } from "../src/schema/finance/capture-application.schema";
import { financeClientCheckoutAuthorizationIntegritySql } from "../src/schema/finance/client-checkout-authorizations.schema";
import { financeClientCheckoutPreparationIntegritySql } from "../src/schema/finance/client-checkouts.schema";
import { financeEconomicPaymentIntegritySql } from "../src/schema/finance/economic-payments.schema";
import { financeFiscalProfileIntegritySql } from "../src/schema/finance/fiscal-profiles.schema";
import { financeJournalIntegritySql } from "../src/schema/finance/journal-integrity.sql";
import { financeMerchantPayoutStatementIntegritySql } from "../src/schema/finance/merchant-payout-statements.schema";
import { financeOperationResourcePolicyIntegritySql } from "../src/schema/finance/operation-resource-policies.schema";
import { financeOnlineSaleCaptureIntegritySql } from "../src/schema/finance/online-sale-capture.schema";
import { financeOnlineWalletMutationIntegritySql } from "../src/schema/finance/online-wallet-mutations.schema";
import { financeOnlineWalletRefundApplicationIntegritySql } from "../src/schema/finance/online-wallet-refund-applications.schema";
import { financeOnlineWalletChargebackCaseIntegritySql } from "../src/schema/finance/online-wallet-chargeback-cases.schema";
import { financeOnlinePayoutIntegritySql } from "../src/schema/finance/online-payouts.schema";
import { financeProviderIdentityImmutabilitySql } from "../src/schema/finance/provider-accounts.schema";
import { financeProviderCredentialImmutabilitySql } from "../src/schema/finance/provider-credentials.schema";
import { financeRestrictedProviderCredentialActivationEvidenceImmutabilitySql } from "../src/schema/finance/provider-credential-activation-evidence.schema";
import { financeProviderOperationIntegritySql } from "../src/schema/finance/provider-operations.schema";
import { financeArcPayRateBudgetIntegritySql } from "../src/schema/finance/rate-budget.schema";
import { financeReadinessEvidenceImmutabilitySql } from "../src/schema/finance/readiness-evidence.schema";
import { financeRefundCandidateIntegritySql } from "../src/schema/finance/refund-candidates.schema";
import { financeRefundAllocationAuthorityIntegritySql } from "../src/schema/finance/refund-cases.schema";
import { financeSavedCardConsentIntegritySql } from "../src/schema/finance/saved-card-consents.schema";
import { financeSavedCardDisclosureIntegritySql } from "../src/schema/finance/saved-card-disclosures.schema";
import { financeSavedCardSetupSessionIntegritySql } from "../src/schema/finance/saved-card-setup-sessions.schema";
import { financeSavedCardSetupCustomerActionIntegritySql } from "../src/schema/finance/saved-card-setup-actions.schema";
import { financePlatformTariffInvoiceCustomerActionIntegritySql } from "../src/schema/finance/platform-tariff-invoice-customer-actions.schema";
import { financePayoutIntegritySql } from "../src/schema/finance/payouts.schema";
import { financeSettlementIntegritySql } from "../src/schema/finance/settlement.schema";
import { financeWalletIntegritySql } from "../src/schema/finance/wallet.schema";
import { financeWebhookInboxIntegritySql } from "../src/schema/finance/webhook-inbox.schema";
import { financeWebAuthnIdentityIntegritySql } from "../src/schema/identity/finance-webauthn.schema";

const statementBreakpoint = "--> statement-breakpoint";
const markerStart = "-- ElevenHouse finance integrity objects: begin";
const markerEnd = "-- ElevenHouse finance integrity objects: end";
const savedCardDisclosureMarkerStart = "-- ElevenHouse saved-card disclosure integrity objects: begin";
const savedCardDisclosureMarkerEnd = "-- ElevenHouse saved-card disclosure integrity objects: end";
const savedCardDisclosureTableDdl = 'CREATE TABLE "finance_saved_card_disclosure_versions"';

/**
 * Drizzle owns table DDL. Finance's reviewed PostgreSQL functions/triggers are deliberately
 * appended as one idempotent block, so a fresh baseline has the same money-integrity contract
 * that adapters and workers rely on at runtime.
 */
export const financeIntegritySql = [
  financeCanonicalJsonV1Sql,
  financeProviderIdentityImmutabilitySql,
  financeReadinessEvidenceImmutabilitySql,
  financeOperationResourcePolicyIntegritySql,
  financeFiscalProfileIntegritySql,
  financeArtifactImmutabilitySql,
  financeSavedCardConsentIntegritySql,
  financeSavedCardSetupSessionIntegritySql,
  financeProviderCredentialImmutabilitySql,
  financeRestrictedProviderCredentialActivationEvidenceImmutabilitySql,
  financeSavedCardSetupCustomerActionIntegritySql,
  financePlatformTariffInvoiceCustomerActionIntegritySql,
  financeProviderOperationIntegritySql,
  financeArcPayRateBudgetIntegritySql,
  financeEconomicPaymentIntegritySql,
  financeClientCheckoutAuthorizationIntegritySql,
  financeClientCheckoutPreparationIntegritySql,
  financeCaptureAuthoritiesIntegritySql,
  financeWalletIntegritySql,
  financeJournalIntegritySql,
  financeBankCashIntegritySql,
  financeBankLiquidityIntegritySql,
  financeSettlementIntegritySql,
  financeMerchantPayoutStatementIntegritySql,
  financePayoutIntegritySql,
  financeWebhookInboxIntegritySql,
  financeRefundCandidateIntegritySql,
  financeRefundAllocationAuthorityIntegritySql,
  financeVerifiedCaptureApplicationIntegritySql,
  financeOnlineSaleCaptureIntegritySql,
  financeOnlineWalletMutationIntegritySql,
  financeOnlineWalletRefundApplicationIntegritySql,
  financeOnlineWalletChargebackCaseIntegritySql,
  financeOnlinePayoutIntegritySql,
  financeWebAuthnIdentityIntegritySql
].join(`\n${statementBreakpoint}\n`);

export async function augmentFinanceBaseline(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  assertRequiredFinanceTables(source);
  const augmented = replaceManagedIntegrityBlock(source, markerStart, markerEnd, financeIntegritySql);
  if (augmented !== source) await writeFile(migrationPath, augmented, "utf8");
}

/**
 * Finance tables may be introduced after the initial Drizzle baseline while parallel work is
 * still stabilizing. Their triggers must be emitted in that same or a later migration, never
 * into 0000 before PostgreSQL knows the table exists.
 */
export function augmentSavedCardDisclosureMigrationSource(source: string): string {
  if (!source.includes(savedCardDisclosureTableDdl)) {
    throw new Error("Cannot augment saved-card disclosure migration: missing finance_saved_card_disclosure_versions");
  }
  return replaceManagedIntegrityBlock(
    source,
    savedCardDisclosureMarkerStart,
    savedCardDisclosureMarkerEnd,
    financeSavedCardDisclosureIntegritySql
  );
}

async function augmentSavedCardDisclosureMigration(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  const augmented = augmentSavedCardDisclosureMigrationSource(source);
  if (augmented !== source) await writeFile(migrationPath, augmented, "utf8");
}

function replaceManagedIntegrityBlock(
  source: string,
  startMarker: string,
  endMarker: string,
  integritySql: string
): string {
  const expectedBlock = `${startMarker}\n${integritySql}\n${endMarker}`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 && end !== -1) throw new Error("Finance integrity marker is malformed");
  if (start !== -1 && (end === -1 || end < start)) throw new Error("Finance integrity marker is malformed");
  return start === -1
    ? `${source.trimEnd()}\n${statementBreakpoint}\n${expectedBlock}\n`
    : `${source.slice(0, start)}${expectedBlock}${source.slice(end + endMarker.length)}`;
}

function assertRequiredFinanceTables(source: string): void {
  for (const table of [
    "finance_artifacts",
    "finance_restricted_provider_credential_activation_evidence",
    "finance_provider_accounts",
    "finance_economic_payment_intents",
    "finance_client_checkout_preparations",
    "finance_webhook_inbox",
    "finance_webhook_stored_receipts",
    "finance_journal_transactions",
    "finance_wallet_heads",
    "finance_settlement_cursors",
    "finance_bank_cash_pools",
    "finance_refund_candidates",
    "finance_refund_candidate_reviews",
    "finance_online_wallet_heads",
    "finance_online_wallet_commitments",
    "finance_online_sale_capture_root_lots",
    "finance_online_wallet_mutations",
    "finance_online_payable_source_allocations",
    "finance_online_payable_source_consumptions",
    "finance_online_wallet_refund_applications",
    "finance_online_wallet_chargeback_cases",
    "finance_online_payout_requests",
    "finance_online_payout_request_allocations",
    "finance_online_payout_state_transitions"
  ]) {
    if (!source.includes(`CREATE TABLE "${table}"`)) {
      throw new Error(`Cannot augment finance baseline: missing ${table}`);
    }
  }
}

async function findCurrentBaseline(): Promise<string> {
  const migrationDirectory = join(__dirname, "../drizzle");
  const baselines = (await readdir(migrationDirectory))
    .filter((entry) => /^0000_.+\.sql$/.test(entry))
    .sort();
  if (baselines.length !== 1) {
    throw new Error(`Expected exactly one generated 0000 baseline, found ${baselines.length}`);
  }
  return join(migrationDirectory, baselines[0]!);
}

async function findSavedCardDisclosureMigration(): Promise<string> {
  const migrationDirectory = join(__dirname, "../drizzle");
  const migrations = (await readdir(migrationDirectory))
    .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
    .sort();
  const matches = (await Promise.all(migrations.map(async (entry) => {
    const migrationPath = join(migrationDirectory, entry);
    return (await readFile(migrationPath, "utf8")).includes(savedCardDisclosureTableDdl) ? migrationPath : null;
  }))).filter((migrationPath): migrationPath is string => migrationPath !== null);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one saved-card disclosure table migration, found ${matches.length}`);
  }
  return matches[0]!;
}

async function main(): Promise<void> {
  const migrationPath = await findCurrentBaseline();
  await augmentFinanceBaseline(migrationPath);
  const savedCardDisclosureMigrationPath = await findSavedCardDisclosureMigration();
  await augmentSavedCardDisclosureMigration(savedCardDisclosureMigrationPath);
  console.log(`Finance integrity objects verified in ${migrationPath}; saved-card disclosure integrity verified in ${savedCardDisclosureMigrationPath}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
