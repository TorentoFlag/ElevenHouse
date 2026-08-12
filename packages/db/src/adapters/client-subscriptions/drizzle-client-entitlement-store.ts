import { and, asc, eq, gt, lte } from "drizzle-orm";
import type {
  ClientEntitlement,
  ClientEntitlementProjectionStore,
  ProjectClientEntitlementBatchOutcome
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import { clientEntitlementGrants } from "../../schema/client-subscriptions";
import {
  mapEntitlementGrant,
  persistEntitlementProjection
} from "./drizzle-client-subscription-transition-persistence";

export function createDrizzleClientEntitlementProjectionStore(
  database: ElevenHouseDatabase
): ClientEntitlementProjectionStore {
  return {
    applySubscriptionTransition: (input) =>
      database.transaction(async (transaction) => {
        const rows = await transaction
          .select()
          .from(clientEntitlementGrants)
          .where(eq(clientEntitlementGrants.subscriptionId, input.receipt.subscriptionId))
          .orderBy(asc(clientEntitlementGrants.startsAt), asc(clientEntitlementGrants.id))
          .for("update");
        const grants = rows.map(mapEntitlementGrant);
        const conflict = findGrantVersionConflict(
          grants,
          input.receipt.entitlementScope === "period" ? (input.receipt.period?.id ?? null) : null,
          input.expectedGrantVersions
        );
        if (conflict !== null) return { outcome: "version_conflict", currentVersion: conflict };
        return persistEntitlementProjection(transaction, input.receipt, input.entitlementId);
      }),
    findBySubscriptionAndPeriod: async (input) => {
      const [row] = await database
        .select()
        .from(clientEntitlementGrants)
        .where(
          and(
            eq(clientEntitlementGrants.subscriptionId, input.subscriptionId),
            eq(clientEntitlementGrants.periodId, input.periodId)
          )
        )
        .limit(1);
      return row ? mapEntitlementGrant(row) : null;
    },
    findGrantingAt: async (input) => {
      const instant = new Date(input.at);
      const [row] = await database
        .select()
        .from(clientEntitlementGrants)
        .where(
          and(
            eq(clientEntitlementGrants.subscriptionId, input.subscriptionId),
            eq(clientEntitlementGrants.state, "active"),
            lte(clientEntitlementGrants.startsAt, instant),
            gt(clientEntitlementGrants.endsAt, instant)
          )
        )
        .orderBy(asc(clientEntitlementGrants.startsAt), asc(clientEntitlementGrants.id))
        .limit(1);
      return row ? mapEntitlementGrant(row) : null;
    },
    listBySubscription: async (subscriptionId) => {
      const rows = await database
        .select()
        .from(clientEntitlementGrants)
        .where(eq(clientEntitlementGrants.subscriptionId, subscriptionId))
        .orderBy(asc(clientEntitlementGrants.startsAt), asc(clientEntitlementGrants.id));
      return rows.map(mapEntitlementGrant);
    }
  };
}

function findGrantVersionConflict(
  grants: readonly ClientEntitlement[],
  periodId: string | null,
  expected: Readonly<Record<string, number>>
): number | null {
  if (periodId) {
    const current = grants.find((grant) => grant.periodId === periodId);
    const currentVersion = current?.version ?? 0;
    const expectedVersion = expected[periodId];
    return expectedVersion === currentVersion ? null : currentVersion;
  }
  for (const grant of grants) {
    const expectedVersion = expected[grant.periodId];
    if (expectedVersion !== grant.version) return grant.version;
  }
  return null;
}

export type DrizzleClientEntitlementProjectionOutcome =
  | ProjectClientEntitlementBatchOutcome
  | { readonly outcome: "version_conflict"; readonly currentVersion: number };
