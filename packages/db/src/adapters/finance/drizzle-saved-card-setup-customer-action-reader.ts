import type { SavedCardSetupCustomerActionReaderPort } from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import { financeTransientSecretRefs } from "../../schema/finance/provider-credentials.schema";
import { financeSavedCardSetupCustomerActions } from "../../schema/finance/saved-card-setup-actions.schema";
import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";

export function createDrizzleSavedCardSetupCustomerActionReader(
  database: ElevenHouseDatabase
): SavedCardSetupCustomerActionReaderPort {
  return Object.freeze({
    async findPendingForOwner(input) {
      if (!uuid(input.setupSessionId) || !uuid(input.ownerUserId) || !positive(input.expectedSetupSessionVersion)) {
        return null;
      }
      const [row] = await database
        .select({
          session: financeSavedCardSetupSessions,
          action: financeSavedCardSetupCustomerActions,
          artifact: financeArtifacts,
          methodContext: financeTransientSecretRefs
        })
        .from(financeSavedCardSetupCustomerActions)
        .innerJoin(
          financeSavedCardSetupSessions,
          eq(financeSavedCardSetupSessions.id, financeSavedCardSetupCustomerActions.setupSessionId)
        )
        .innerJoin(
          financeArtifacts,
          eq(financeArtifacts.id, financeSavedCardSetupCustomerActions.providerResponseArtifactId)
        )
        .leftJoin(
          financeTransientSecretRefs,
          eq(financeTransientSecretRefs.secretRefId, financeSavedCardSetupSessions.threeDsMethodContextSecretRefId)
        )
        .where(
          and(
            eq(financeSavedCardSetupCustomerActions.setupSessionId, input.setupSessionId),
            eq(financeSavedCardSetupCustomerActions.status, "pending")
          )
        )
        .limit(1);
      if (
        !row ||
        row.session.ownerUserId !== input.ownerUserId ||
        row.session.state !== "requires_customer_action" ||
        row.session.version !== input.expectedSetupSessionVersion ||
        row.session.providerSetupId === null ||
        row.action.setupSessionVersion !== String(row.session.version) ||
        row.artifact.artifactClass !== "provider_response" ||
        row.artifact.bindingKind !== "provider" ||
        row.artifact.sha256Digest !== row.action.providerResponseArtifactDigest ||
        row.artifact.seriesId !== row.session.seriesId ||
        row.artifact.providerAccountId !== row.session.providerAccountId ||
        row.artifact.providerIdentityVersion !== row.session.providerIdentityVersion
      ) {
        return null;
      }
      if (
        row.session.threeDsMethodContextSecretRefId !== null &&
        (!row.methodContext ||
          row.methodContext.secretRefId !== row.session.threeDsMethodContextSecretRefId ||
          row.methodContext.seriesId !== row.session.seriesId ||
          row.methodContext.providerAccountId !== row.session.providerAccountId ||
          row.methodContext.providerIdentityVersion !== row.session.providerIdentityVersion ||
          row.methodContext.providerSetupId !== row.session.providerSetupId)
      ) return null;
      const byteLength = Number(row.artifact.byteLength);
      if (!Number.isSafeInteger(byteLength) || byteLength < 1 || !/^sha256:[a-f0-9]{64}$/.test(row.artifact.sha256Digest)) {
        return null;
      }
      return Object.freeze({
        setupSessionId: row.session.id,
        customerActionId: row.action.id,
        setupSessionVersion: row.session.version,
        ownerUserId: row.session.ownerUserId,
        providerSetupId: row.session.providerSetupId,
        providerAccount: {
          seriesId: row.session.seriesId,
          providerAccountId: row.session.providerAccountId,
          identityVersion: row.session.providerIdentityVersion
        },
        actionType: row.action.actionType as "three_ds_method" | "three_ds_challenge",
        phase: row.action.phase as "method" | "challenge",
        providerResponseArtifact: {
          artifactId: row.artifact.id,
          sha256Digest: row.artifact.sha256Digest as `sha256:${string}`,
          byteLength
        },
        providerResponseArtifactDigest: row.action.providerResponseArtifactDigest as `sha256:${string}`,
        threeDsMethodContextSecretRef: row.methodContext?.sealedSecretRef ?? null,
        threeDsMethodContextProviderExpiresAt:
          row.methodContext?.providerExpiresAt.toISOString().replace(/\.000Z$/, "Z") ?? null
      });
    }
  });
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}
