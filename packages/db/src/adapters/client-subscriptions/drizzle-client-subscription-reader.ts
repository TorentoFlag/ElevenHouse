import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  clientSubscriptionContractSchema,
  clientSubscriptionStateSchema,
  type ClientSubscriptionContract
} from "@elevenhouse/contracts";
import type {
  ClientSubscription,
  ClientSubscriptionPeriod,
  ClientSubscriptionReader
} from "@elevenhouse/domain";
import { z } from "@elevenhouse/validation";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientSubscriptionContracts,
  clientSubscriptionEventApplicationReceipts,
  clientSubscriptionLifecycleEvents,
  clientSubscriptionPeriods,
  clientSubscriptionRenewalRequests,
  clientSubscriptionSlots,
  clientSubscriptions
} from "../../schema/client-subscriptions";

export type ClientSubscriptionDatabase =
  | ElevenHouseDatabase
  | Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

export function createDrizzleClientSubscriptionReader(
  database: ElevenHouseDatabase
): ClientSubscriptionReader {
  return {
    findById: (subscriptionId) => findClientSubscriptionById(database, subscriptionId),
    findCurrentByRelationshipAndProduct: async (input) => {
      const [slot] = await database
        .select({ subscriptionId: clientSubscriptionSlots.currentSubscriptionId })
        .from(clientSubscriptionSlots)
        .where(
          and(
            eq(clientSubscriptionSlots.relationshipId, input.relationshipId),
            eq(clientSubscriptionSlots.productId, input.productId)
          )
        )
        .limit(1);
      return slot?.subscriptionId
        ? findClientSubscriptionById(database, slot.subscriptionId)
        : null;
    }
  };
}

export async function findClientSubscriptionById(
  database: ClientSubscriptionDatabase,
  subscriptionId: string,
  lock: "none" | "update" = "none"
): Promise<ClientSubscription | null> {
  const headQuery = database
    .select({
      head: clientSubscriptions,
      contract: clientSubscriptionContracts
    })
    .from(clientSubscriptions)
    .innerJoin(
      clientSubscriptionContracts,
      eq(clientSubscriptionContracts.id, clientSubscriptions.contractId)
    )
    .where(eq(clientSubscriptions.id, subscriptionId))
    .limit(1);
  const rows =
    lock === "update"
      ? await headQuery.for("update", { of: clientSubscriptions })
      : await headQuery;
  const row = rows[0];
  if (!row) return null;

  const periodRows = await database
    .select()
    .from(clientSubscriptionPeriods)
    .where(eq(clientSubscriptionPeriods.subscriptionId, subscriptionId))
    .orderBy(asc(clientSubscriptionPeriods.sequence));
  const renewalRows = await database
    .select()
    .from(clientSubscriptionRenewalRequests)
    .where(
      row.head.renewalRequestId
        ? and(
            eq(clientSubscriptionRenewalRequests.subscriptionId, subscriptionId),
            eq(clientSubscriptionRenewalRequests.id, row.head.renewalRequestId)
          )
        : sql`false`
    )
    .limit(1);
  const evidenceRows = await database
    .select({ evidenceId: clientSubscriptionEventApplicationReceipts.evidenceId })
    .from(clientSubscriptionEventApplicationReceipts)
    .where(
      and(
        eq(clientSubscriptionEventApplicationReceipts.subscriptionId, subscriptionId),
        inArray(clientSubscriptionEventApplicationReceipts.resultKind, ["applied", "idempotent"])
      )
    );
  const endedPeriodRows = await database
    .select({ periodId: sql<string>`${clientSubscriptionLifecycleEvents.data}->>'periodId'` })
    .from(clientSubscriptionLifecycleEvents)
    .where(
      and(
        eq(clientSubscriptionLifecycleEvents.subscriptionId, subscriptionId),
        eq(clientSubscriptionLifecycleEvents.eventType, "client_subscription.period_ended.v1")
      )
    );

  const contract = mapContract(row.contract);
  const paidPeriods = periodRows.map(mapPeriod);
  const renewal = renewalRows[0];
  return {
    id: row.head.id,
    contract,
    journalEpochId: row.head.journalEpochId,
    state: clientSubscriptionStateSchema.parse(row.head.state),
    version: row.head.version,
    cancellationEffectiveAt: row.head.cancellationEffectiveAt?.toISOString() ?? null,
    renewalStoppedAt: row.head.renewalStoppedAt?.toISOString() ?? null,
    renewalRequest: renewal
      ? {
          id: renewal.id,
          sourcePeriodId: renewal.sourcePeriodId,
          intendedPeriodId: renewal.intendedPeriodId,
          requestedAt: renewal.requestedAt.toISOString()
        }
      : null,
    paidPeriods,
    endedPeriodIds: endedPeriodRows.map((ended) => z.string().uuid().parse(ended.periodId)),
    appliedFinanceEvidenceIds: evidenceRows.map((evidence) => evidence.evidenceId)
  };
}

function mapContract(
  row: typeof clientSubscriptionContracts.$inferSelect
): ClientSubscriptionContract {
  return clientSubscriptionContractSchema.parse({
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    productRevision: row.productRevision,
    relationshipId: row.relationshipId,
    astrologerUserId: row.astrologerUserId,
    clientUserId: row.clientUserId,
    priceMinor: row.priceMinor,
    currency: row.currency,
    cadence: row.cadence,
    billingEconomics: {
      orderId: row.billingEconomicsOrderId,
      astrologerUserId: row.billingAstrologerUserId,
      planId: row.billingPlanId,
      planVersionId: row.billingPlanVersionId,
      gross: { amountMinor: row.billingGrossAmountMinor, currency: row.billingGrossCurrency },
      commission: {
        amountMinor: row.billingCommissionAmountMinor,
        currency: row.billingCommissionCurrency
      },
      payable: {
        amountMinor: row.billingPayableAmountMinor,
        currency: row.billingPayableCurrency
      },
      commissionBps: row.billingCommissionBps,
      allocationRevision: row.billingAllocationRevision
    },
    accessGrants: row.accessGrants,
    deliveryFormats: row.deliveryFormats,
    requiredClientData: row.requiredClientData,
    methods: row.methods,
    modifiers: row.modifiers,
    astroDiaryConfig: row.astroDiaryConfig,
    canonicalDigest: row.canonicalDigest,
    createdAt: row.createdAt
  });
}

function mapPeriod(row: typeof clientSubscriptionPeriods.$inferSelect): ClientSubscriptionPeriod {
  return {
    id: row.id,
    sequence: row.sequence,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    anchor: {
      capturedAt: row.anchorCapturedAt.toISOString(),
      serviceTimezone: row.anchorServiceTimezone,
      originSequence: row.anchorOriginSequence,
      localDateTime: row.anchorLocalDateTime
    },
    resolvedStartLocal: row.resolvedStartLocal,
    resolvedStartOffset: row.resolvedStartOffset,
    resolvedEndLocal: row.resolvedEndLocal,
    resolvedEndOffset: row.resolvedEndOffset
  };
}
