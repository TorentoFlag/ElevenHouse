import type { OnlineWalletChargebackResolutionPreparationReader } from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import { financeOnlineWalletChargebackCases } from "../../schema/finance/online-wallet-chargeback-cases.schema";
import { financeOnlineWalletHeads } from "../../schema/finance/online-sale-capture.schema";
import { financeWebhookInbox } from "../../schema/finance/webhook-inbox.schema";

type ReadExecutor = Pick<ElevenHouseDatabase, "select">;

/**
 * No payload field of the undocumented terminal event is trusted here. The operator selects an
 * event ID, while this reader verifies its signature state, provider account and sealed artifact.
 */
export function createDrizzleOnlineWalletChargebackResolutionPreparationReader(
  database: ReadExecutor
): OnlineWalletChargebackResolutionPreparationReader {
  return Object.freeze({
    async findForResolution(input) {
      const caseId = identifier(input.chargebackCaseId);
      const eventId = identifier(input.outcomeWebhookEventId);
      const [caseRow] = await database.select().from(financeOnlineWalletChargebackCases)
        .where(eq(financeOnlineWalletChargebackCases.chargebackCaseId, caseId)).limit(2);
      if (!caseRow || caseRow.status !== "provisional_loss") return null;
      const [wallet] = await database.select().from(financeOnlineWalletHeads)
        .where(eq(financeOnlineWalletHeads.id, caseRow.walletId)).limit(2);
      if (!wallet || wallet.currency !== "RUB") return null;
      const rows = await database.select({ inbox: financeWebhookInbox, artifact: financeArtifacts })
        .from(financeWebhookInbox)
        .innerJoin(financeArtifacts, eq(financeWebhookInbox.artifactId, financeArtifacts.id))
        .where(and(
          eq(financeWebhookInbox.transportEventId, eventId),
          eq(financeWebhookInbox.providerEventType, "chargeback.outcome"),
          eq(financeWebhookInbox.signatureStatus, "verified"),
          eq(financeWebhookInbox.seriesId, caseRow.providerAccountSeriesId),
          eq(financeWebhookInbox.providerAccountId, caseRow.providerAccountId),
          eq(financeWebhookInbox.providerIdentityVersion, caseRow.providerIdentityVersion),
          eq(financeArtifacts.artifactClass, "provider_webhook"),
          eq(financeArtifacts.bindingKind, "provider")
        )).limit(2);
      const row = rows[0];
      if (rows.length !== 1 || !row || row.artifact.sha256Digest !== row.inbox.rawBodyDigest) return null;
      const byteLength = Number(row.artifact.byteLength);
      if (!Number.isSafeInteger(byteLength) || byteLength < 0) return null;
      return Object.freeze({
        chargebackCaseId: caseRow.chargebackCaseId,
        chargebackCaseVersion: caseRow.caseVersion,
        walletId: caseRow.walletId,
        walletRevision: wallet.revision,
        providerAccount: Object.freeze({ seriesId: caseRow.providerAccountSeriesId, providerAccountId: caseRow.providerAccountId, identityVersion: caseRow.providerIdentityVersion }),
        providerPaymentId: caseRow.providerPaymentId,
        cumulativePrincipalMinor: caseRow.disputedPrincipalMinor,
        outcomeWebhookEventId: row.inbox.transportEventId,
        outcomeArtifact: Object.freeze({ artifactId: row.artifact.id, sha256Digest: row.artifact.sha256Digest as `sha256:${string}`, byteLength }),
        outcomeObservedAt: row.inbox.signedTimestamp.toISOString()
      });
    }
  } satisfies OnlineWalletChargebackResolutionPreparationReader);
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.trim() !== value) throw new TypeError("Invalid chargeback resolution identifier");
  return value;
}
