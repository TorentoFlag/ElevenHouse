import { and, eq, sql } from "drizzle-orm";
import {
  clientRelationshipStatusSchema,
  clientSubscriptionBillingEconomicsSchema,
  clientSubscriptionCadenceSchema,
  clientSubscriptionContractSchema,
  clientSubscriptionStateSchema,
  type ClientSubscriptionContract,
  productAstroDiaryConfigSchema
} from "@elevenhouse/contracts";
import type {
  CanonicalJson,
  ClientSubscriptionCreationAuthority,
  ClientSubscriptionCreationExecution,
  ClientSubscriptionCreationResult,
  ClientSubscriptionCreationUnitOfWork
} from "@elevenhouse/domain";
import { sha256CanonicalJson, stableJson } from "@elevenhouse/domain";
import { z } from "@elevenhouse/validation";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientSubscriptionContracts,
  clientSubscriptionCreationReceipts,
  clientSubscriptionPurchaseAuthorities,
  clientSubscriptionSlots,
  clientSubscriptions
} from "../../schema/client-subscriptions";
import { clientAstrologerRelationships } from "../../schema/clients/client-astrologer-relationships.schema";
import { financeOrderEconomicsSnapshots } from "../../schema/finance/capture-authorities.schema";

const sha256DigestSchema = z.custom<`sha256:${string}`>(
  (value): value is `sha256:${string}` =>
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)
);

const creationResultSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("created"),
      subscriptionId: z.string().uuid(),
      contractId: z.string().uuid(),
      contractDigest: sha256DigestSchema
    })
    .strict(),
  z.object({ outcome: z.literal("rejected"), code: z.string().min(1) }).strict()
]);

const instantSchema = z.string().datetime({ offset: true });
const subscriptionPeriodSchema = z
  .object({
    id: z.string().uuid(),
    sequence: z.number().int().positive(),
    startsAt: instantSchema,
    endsAt: instantSchema,
    anchor: z
      .object({
        capturedAt: instantSchema,
        serviceTimezone: z.string().min(1),
        originSequence: z.number().int().positive(),
        localDateTime: z.string().min(1)
      })
      .strict(),
    resolvedStartLocal: z.string().min(1),
    resolvedStartOffset: z.string().min(1),
    resolvedEndLocal: z.string().min(1),
    resolvedEndOffset: z.string().min(1)
  })
  .strict();
const creationResultSnapshotSchema = z
  .object({
    outcome: z.literal("created"),
    contract: clientSubscriptionContractSchema,
    subscription: z
      .object({
        id: z.string().uuid(),
        contract: clientSubscriptionContractSchema,
        journalEpochId: z.string().uuid(),
        state: clientSubscriptionStateSchema,
        version: z.number().int().positive(),
        paidPeriods: z.array(subscriptionPeriodSchema),
        endedPeriodIds: z.array(z.string().uuid()),
        appliedFinanceEvidenceIds: z.array(z.string().uuid())
      })
      .strict()
  })
  .strict();

export function createDrizzleClientSubscriptionCreationUnitOfWork(
  database: ElevenHouseDatabase
): ClientSubscriptionCreationUnitOfWork {
  return {
    execute: (input) =>
      database.transaction((transaction) =>
        executeDrizzleClientSubscriptionCreationInTransaction(transaction, input)
      )
  };
}

/**
 * Capture-purpose dispatch composes this under its existing finance transaction. Other callers
 * use the public UoW wrapper.
 */
export async function executeDrizzleClientSubscriptionCreationInTransaction(
  transaction: CreationTransaction,
  input: Parameters<ClientSubscriptionCreationUnitOfWork["execute"]>[0]
): Promise<ClientSubscriptionCreationExecution> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`client-subscription-creation:${input.orderId}:${input.idempotencyKey}`}, 0))`
  );
  const prior = await readCreationReceipt(transaction, input.orderId, input.idempotencyKey);
  if (prior) {
    if (prior.requestHash !== input.requestHash) return { outcome: "idempotency_conflict" };
    return {
      outcome: "replayed",
      result: hydrateCreationResult(prior)
    };
  }

  const slotIdentity = await readCreationSlotIdentity(transaction, input);
  if (!slotIdentity) return { outcome: "not_found" };

  await transaction
    .insert(clientSubscriptionSlots)
    .values({
      relationshipId: input.relationshipId,
      productId: input.productId,
      clientUserId: slotIdentity.clientUserId,
      astrologerUserId: slotIdentity.astrologerUserId,
      version: 0,
      currentSubscriptionId: null,
      createdAt: sql`clock_timestamp()`,
      updatedAt: sql`clock_timestamp()`
    })
    .onConflictDoNothing();
  const [slot] = await transaction
    .select()
    .from(clientSubscriptionSlots)
    .where(
      and(
        eq(clientSubscriptionSlots.relationshipId, input.relationshipId),
        eq(clientSubscriptionSlots.productId, input.productId)
      )
    )
    .for("update")
    .limit(1);
  if (!slot) throw new Error("Expected client subscription slot after insert");
  if (slot.version !== input.expectedSlotVersion) {
    return {
      outcome: "version_conflict",
      expectedVersion: input.expectedSlotVersion,
      currentVersion: slot.version
    };
  }

  const authority = await loadCreationAuthority(transaction, input);
  if (!authority) return { outcome: "not_found" };

  const decision = input.decide(authority.value);
  if (decision.outcome === "rejected") {
    const receipt = {
      orderId: input.orderId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      slot: {
        relationshipId: input.relationshipId,
        productId: input.productId,
        expectedVersion: input.expectedSlotVersion,
        resultVersion: input.expectedSlotVersion,
        effect: "retain" as const
      },
      result: { outcome: "rejected" as const, code: decision.code }
    };
    await transaction.insert(clientSubscriptionCreationReceipts).values({
      orderId: input.orderId,
      relationshipId: input.relationshipId,
      productId: input.productId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      expectedSlotVersion: input.expectedSlotVersion,
      slotEffect: "retain",
      resultKind: "rejected",
      result: receipt.result,
      resultSnapshot: null,
      resultSlotVersion: input.expectedSlotVersion,
      subscriptionId: null,
      contractId: null,
      contractDigest: null,
      createdAt: sql`clock_timestamp()`
    });
    return { ...decision, persistenceReceipt: receipt };
  }

  if (
    decision.subscription.id !== input.subscriptionId ||
    decision.subscription.contract.id !== decision.contract.id ||
    decision.contract.orderId !== input.orderId ||
    decision.contract.productId !== input.productId ||
    decision.contract.relationshipId !== input.relationshipId ||
    decision.subscription.version !== 1 ||
    decision.subscription.state !== "pending_initial_payment"
  ) {
    throw new Error("Client subscription creation decision does not match locked authority");
  }
  await insertContract(transaction, authority.purchaseAuthorityDigest, decision.contract);
  await transaction.insert(clientSubscriptions).values({
    id: decision.subscription.id,
    contractId: decision.contract.id,
    relationshipId: decision.contract.relationshipId,
    productId: decision.contract.productId,
    journalEpochId: decision.subscription.journalEpochId,
    state: decision.subscription.state,
    version: decision.subscription.version,
    // Historical column remains physically present until the next isolated DB migration.
    cancellationEffectiveAt: null,
    currentPeriodId: null,
    futurePeriodId: null,
    createdAt: new Date(decision.contract.createdAt),
    updatedAt: new Date(decision.contract.createdAt)
  });
  const resultSlotVersion = input.expectedSlotVersion + 1;
  await transaction
    .update(clientSubscriptionSlots)
    .set({
      version: resultSlotVersion,
      currentSubscriptionId: decision.subscription.id,
      updatedAt: sql`clock_timestamp()`
    })
    .where(
      and(
        eq(clientSubscriptionSlots.relationshipId, input.relationshipId),
        eq(clientSubscriptionSlots.productId, input.productId),
        eq(clientSubscriptionSlots.version, input.expectedSlotVersion)
      )
    );
  const receipt = {
    orderId: input.orderId,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    slot: {
      relationshipId: input.relationshipId,
      productId: input.productId,
      expectedVersion: input.expectedSlotVersion,
      resultVersion: resultSlotVersion,
      effect: "assign" as const
    },
    result: {
      outcome: "created" as const,
      subscriptionId: decision.subscription.id,
      contractId: decision.contract.id,
      contractDigest: sha256DigestSchema.parse(decision.contract.canonicalDigest)
    }
  };
  await transaction.insert(clientSubscriptionCreationReceipts).values({
    orderId: input.orderId,
    relationshipId: input.relationshipId,
    productId: input.productId,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    expectedSlotVersion: input.expectedSlotVersion,
    slotEffect: "assign",
    resultKind: "created",
    result: receipt.result,
    resultSnapshot: decision,
    resultSlotVersion,
    subscriptionId: decision.subscription.id,
    contractId: decision.contract.id,
    contractDigest: decision.contract.canonicalDigest,
    createdAt: sql`clock_timestamp()`
  });
  return { ...decision, persistenceReceipt: receipt };
}

type CreationTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type CreationReceiptRow = typeof clientSubscriptionCreationReceipts.$inferSelect;

async function readCreationReceipt(
  transaction: CreationTransaction,
  orderId: string,
  idempotencyKey: string
): Promise<CreationReceiptRow | null> {
  const [row] = await transaction
    .select()
    .from(clientSubscriptionCreationReceipts)
    .where(
      and(
        eq(clientSubscriptionCreationReceipts.orderId, orderId),
        eq(clientSubscriptionCreationReceipts.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return row ?? null;
}

function hydrateCreationResult(row: CreationReceiptRow): ClientSubscriptionCreationResult {
  const result = creationResultSchema.parse(row.result);
  const slotEffect = z.enum(["assign", "retain"]).parse(row.slotEffect);
  const slot = {
    relationshipId: row.relationshipId,
    productId: row.productId,
    expectedVersion: row.expectedSlotVersion,
    resultVersion: row.resultSlotVersion,
    effect: slotEffect
  };
  if (result.outcome === "rejected") {
    return {
      outcome: "rejected",
      code: result.code,
      persistenceReceipt: {
        orderId: row.orderId,
        idempotencyKey: row.idempotencyKey,
        requestHash: sha256DigestSchema.parse(row.requestHash),
        slot,
        result
      }
    };
  }
  const snapshot = creationResultSnapshotSchema.parse(row.resultSnapshot);
  if (
    snapshot.contract.id !== result.contractId ||
    snapshot.contract.canonicalDigest !== result.contractDigest ||
    snapshot.subscription.id !== result.subscriptionId ||
    snapshot.subscription.contract.id !== snapshot.contract.id
  ) {
    throw new Error("Persisted client subscription creation snapshot is inconsistent");
  }
  return {
    outcome: "created",
    contract: snapshot.contract,
    subscription: snapshot.subscription,
    persistenceReceipt: {
      orderId: row.orderId,
      idempotencyKey: row.idempotencyKey,
      requestHash: sha256DigestSchema.parse(row.requestHash),
      slot,
      result
    }
  };
}

async function readCreationSlotIdentity(
  transaction: CreationTransaction,
  input: {
    readonly orderId: string;
    readonly productId: string;
    readonly relationshipId: string;
  }
): Promise<Readonly<{ clientUserId: string; astrologerUserId: string }> | null> {
  const [row] = await transaction
    .select({
      clientUserId: clientSubscriptionPurchaseAuthorities.clientUserId,
      astrologerUserId: clientSubscriptionPurchaseAuthorities.astrologerUserId
    })
    .from(clientSubscriptionPurchaseAuthorities)
    .where(
      and(
        eq(clientSubscriptionPurchaseAuthorities.orderId, input.orderId),
        eq(clientSubscriptionPurchaseAuthorities.productId, input.productId),
        eq(clientSubscriptionPurchaseAuthorities.relationshipId, input.relationshipId)
      )
    )
    .limit(1);
  return row ?? null;
}

async function loadCreationAuthority(
  transaction: CreationTransaction,
  input: {
    readonly orderId: string;
    readonly productId: string;
    readonly relationshipId: string;
  }
): Promise<{
  readonly purchaseAuthorityDigest: `sha256:${string}`;
  readonly value: ClientSubscriptionCreationAuthority;
} | null> {
  const [row] = await transaction
    .select({
      authority: clientSubscriptionPurchaseAuthorities,
      relationshipStatus: clientAstrologerRelationships.status,
      economics: financeOrderEconomicsSnapshots
    })
    .from(clientSubscriptionPurchaseAuthorities)
    .innerJoin(
      clientAstrologerRelationships,
      eq(clientAstrologerRelationships.id, clientSubscriptionPurchaseAuthorities.relationshipId)
    )
    .innerJoin(
      financeOrderEconomicsSnapshots,
      and(
        eq(
          financeOrderEconomicsSnapshots.orderId,
          clientSubscriptionPurchaseAuthorities.billingEconomicsOrderId
        ),
        eq(
          financeOrderEconomicsSnapshots.canonicalDigest,
          clientSubscriptionPurchaseAuthorities.billingEconomicsDigest
        )
      )
    )
    .where(
      and(
        eq(clientSubscriptionPurchaseAuthorities.orderId, input.orderId),
        eq(clientSubscriptionPurchaseAuthorities.productId, input.productId),
        eq(clientSubscriptionPurchaseAuthorities.relationshipId, input.relationshipId)
      )
    )
    .for("no key update", { of: clientSubscriptionPurchaseAuthorities })
    .limit(1);
  if (!row) return null;
  const economics = clientSubscriptionBillingEconomicsSchema.parse({
    orderId: row.economics.orderId,
    astrologerUserId: row.economics.astrologerUserId,
    planId: row.economics.planId,
    planVersionId: row.economics.planVersionId,
    gross: {
      amountMinor: Number(row.economics.grossAmountMinor),
      currency: row.economics.grossCurrency
    },
    commission: {
      amountMinor: Number(row.economics.commissionAmountMinor),
      currency: row.economics.commissionCurrency
    },
    payable: {
      amountMinor: Number(row.economics.payableAmountMinor),
      currency: row.economics.payableCurrency
    },
    commissionBps: row.economics.commissionBps,
    allocationRevision: row.economics.allocationRevision
  });
  const astroDiaryConfig = productAstroDiaryConfigSchema.parse(row.authority.astroDiaryConfig);
  const status = clientRelationshipStatusSchema.parse(row.relationshipStatus);
  const order: ClientSubscriptionCreationAuthority["order"] = {
    orderId: row.authority.orderId,
    productId: row.authority.productId,
    productRevision: row.authority.productRevision,
    relationshipId: row.authority.relationshipId,
    astrologerUserId: row.authority.astrologerUserId,
    clientUserId: row.authority.clientUserId,
    priceMinor: row.authority.priceMinor,
    currency: z.literal("RUB").parse(row.authority.currency),
    cadence: clientSubscriptionCadenceSchema.parse(row.authority.cadence),
    billingEconomics: economics,
    accessGrants: row.authority.accessGrants,
    deliveryFormats: row.authority.deliveryFormats,
    requiredClientData: row.authority.requiredClientData,
    methods: row.authority.methods,
    modifiers: row.authority.modifiers,
    astroDiaryConfig
  };
  return {
    purchaseAuthorityDigest: sha256DigestSchema.parse(row.authority.canonicalDigest),
    value: {
      order,
      product: {
        productId: order.productId,
        revision: order.productRevision,
        ownerUserId: order.astrologerUserId,
        status: "active",
        type: "async",
        paymentModel: "once",
        executionMode: "async",
        participantMode: "solo",
        priceMinor: order.priceMinor,
        currency: order.currency,
        cadence: order.cadence,
        trialDays: null,
        groupSize: null,
        packageSessionCount: null,
        accessGrants: order.accessGrants,
        deliveryFormats: order.deliveryFormats,
        requiredClientData: order.requiredClientData,
        methods: order.methods,
        modifiers: order.modifiers,
        astroDiaryConfig
      },
      relationship: {
        relationshipId: order.relationshipId,
        astrologerUserId: order.astrologerUserId,
        clientUserId: order.clientUserId,
        status
      }
    }
  };
}

async function insertContract(
  transaction: CreationTransaction,
  purchaseAuthorityDigest: `sha256:${string}`,
  contract: ClientSubscriptionContract
): Promise<void> {
  const terms: CanonicalJson = {
    id: contract.id,
    orderId: contract.orderId,
    productId: contract.productId,
    productRevision: contract.productRevision,
    relationshipId: contract.relationshipId,
    astrologerUserId: contract.astrologerUserId,
    clientUserId: contract.clientUserId,
    priceMinor: contract.priceMinor,
    currency: contract.currency,
    cadence: contract.cadence,
    billingEconomics: {
      orderId: contract.billingEconomics.orderId,
      astrologerUserId: contract.billingEconomics.astrologerUserId,
      planId: contract.billingEconomics.planId,
      planVersionId: contract.billingEconomics.planVersionId,
      gross: {
        amountMinor: contract.billingEconomics.gross.amountMinor,
        currency: contract.billingEconomics.gross.currency
      },
      commission: {
        amountMinor: contract.billingEconomics.commission.amountMinor,
        currency: contract.billingEconomics.commission.currency
      },
      payable: {
        amountMinor: contract.billingEconomics.payable.amountMinor,
        currency: contract.billingEconomics.payable.currency
      },
      commissionBps: contract.billingEconomics.commissionBps,
      allocationRevision: contract.billingEconomics.allocationRevision
    },
    accessGrants: contract.accessGrants,
    deliveryFormats: contract.deliveryFormats,
    requiredClientData: contract.requiredClientData,
    methods: contract.methods,
    modifiers: contract.modifiers,
    astroDiaryConfig: {
      reflectionCyclesPerPeriod: contract.astroDiaryConfig.reflectionCyclesPerPeriod,
      responseSlaWorkingDays: contract.astroDiaryConfig.responseSlaWorkingDays,
      clientResponseWindowCalendarDays: contract.astroDiaryConfig.clientResponseWindowCalendarDays,
      workingWeekdays: contract.astroDiaryConfig.workingWeekdays,
      serviceTimezone: contract.astroDiaryConfig.serviceTimezone
    },
    createdAt: contract.createdAt
  };
  const canonicalPreimage = stableJson(terms);
  if (sha256CanonicalJson(terms) !== contract.canonicalDigest) {
    throw new Error("Client subscription contract digest is invalid");
  }
  await transaction.insert(clientSubscriptionContracts).values({
    id: contract.id,
    orderId: contract.orderId,
    purchaseAuthorityDigest,
    productId: contract.productId,
    productRevision: contract.productRevision,
    relationshipId: contract.relationshipId,
    astrologerUserId: contract.astrologerUserId,
    clientUserId: contract.clientUserId,
    priceMinor: contract.priceMinor,
    currency: contract.currency,
    cadence: contract.cadence,
    billingEconomicsOrderId: contract.billingEconomics.orderId,
    billingEconomicsDigest: sha256DigestSchema.parse(
      await readBillingEconomicsDigest(transaction, contract.billingEconomics.orderId)
    ),
    billingAstrologerUserId: contract.billingEconomics.astrologerUserId,
    billingPlanId: contract.billingEconomics.planId,
    billingPlanVersionId: contract.billingEconomics.planVersionId,
    billingGrossAmountMinor: contract.billingEconomics.gross.amountMinor,
    billingGrossCurrency: contract.billingEconomics.gross.currency,
    billingCommissionAmountMinor: contract.billingEconomics.commission.amountMinor,
    billingCommissionCurrency: contract.billingEconomics.commission.currency,
    billingPayableAmountMinor: contract.billingEconomics.payable.amountMinor,
    billingPayableCurrency: contract.billingEconomics.payable.currency,
    billingCommissionBps: contract.billingEconomics.commissionBps,
    billingAllocationRevision: contract.billingEconomics.allocationRevision,
    accessGrants: contract.accessGrants,
    deliveryFormats: contract.deliveryFormats,
    requiredClientData: contract.requiredClientData,
    methods: contract.methods,
    modifiers: contract.modifiers,
    astroDiaryConfig: contract.astroDiaryConfig,
    canonicalPreimage,
    canonicalDigest: contract.canonicalDigest,
    createdAt: contract.createdAt
  });
}

async function readBillingEconomicsDigest(
  transaction: CreationTransaction,
  orderId: string
): Promise<string> {
  const [row] = await transaction
    .select({ digest: financeOrderEconomicsSnapshots.canonicalDigest })
    .from(financeOrderEconomicsSnapshots)
    .where(eq(financeOrderEconomicsSnapshots.orderId, orderId))
    .limit(1);
  if (!row) throw new Error("Client subscription billing economics authority is missing");
  return row.digest;
}
