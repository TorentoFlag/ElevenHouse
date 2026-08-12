import { and, eq, sql } from "drizzle-orm";
import {
  clientSubscriptionContractSchema,
  clientSubscriptionEventSchema,
  clientSubscriptionRenewalRequestSchema,
  clientSubscriptionStateSchema
} from "@elevenhouse/contracts";
import type {
  ClientSubscription,
  ClientSubscriptionCommandApplied,
  ClientSubscriptionCommandExecution,
  ClientSubscriptionCommandPersistedResult,
  ClientSubscriptionCommandPersistenceReceipt,
  ClientSubscriptionCommandUnitOfWork,
  ClientSubscriptionSourceEventApplicationExecution,
  ClientSubscriptionSourceEventApplicationReceipt,
  ClientSubscriptionSourceEventApplicationResult,
  ClientSubscriptionSourceEventApplicationUnitOfWork
} from "@elevenhouse/domain";
import { z } from "@elevenhouse/validation";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientSubscriptionCommandReceipts,
  clientSubscriptionEventApplicationReceipts
} from "../../schema/client-subscriptions";
import { findClientSubscriptionById } from "./drizzle-client-subscription-reader";
import {
  persistClientSubscriptionTransition,
  type ClientSubscriptionTransaction
} from "./drizzle-client-subscription-transition-persistence";

const sha256DigestSchema = z.custom<`sha256:${string}`>(
  (value): value is `sha256:${string}` =>
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)
);
const rejectedCodeSchema = z.enum([
  "initial_capture_already_applied",
  "initial_payment_ended",
  "initial_capture_required",
  "future_period_exists",
  "subscription_revoked",
  "no_paid_period",
  "cancellation_already_effective",
  "cancellation_not_scheduled",
  "paid_access_not_ended",
  "renewal_disabled",
  "renewal_request_exists",
  "renewal_request_mismatch",
  "renewal_period_mismatch",
  "paid_access_ended"
]);
const persistenceResultSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("applied"),
      subscriptionVersion: z.number().int().positive(),
      transitionId: z.string().uuid(),
      slotEffect: z.enum(["retain", "release"])
    })
    .strict(),
  z
    .object({
      outcome: z.literal("idempotent"),
      subscriptionVersion: z.number().int().positive()
    })
    .strict(),
  z.object({ outcome: z.literal("rejected"), code: rejectedCodeSchema }).strict()
]);
const periodSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    sequence: z.number().int().positive(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    anchor: z
      .object({
        capturedAt: z.string().datetime({ offset: true }),
        serviceTimezone: z.string().min(1),
        originSequence: z.number().int().positive(),
        localDateTime: z.string().min(1)
      })
      .strict(),
    resolvedStartLocal: z.string().min(1),
    resolvedStartOffset: z.string().regex(/^[+-][0-9]{2}:[0-9]{2}$/),
    resolvedEndLocal: z.string().min(1),
    resolvedEndOffset: z.string().regex(/^[+-][0-9]{2}:[0-9]{2}$/)
  })
  .strict();
const subscriptionSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    contract: clientSubscriptionContractSchema,
    journalEpochId: z.string().uuid(),
    state: clientSubscriptionStateSchema,
    version: z.number().int().positive(),
    cancellationEffectiveAt: z.string().datetime({ offset: true }).nullable(),
    renewalStoppedAt: z.string().datetime({ offset: true }).nullable(),
    renewalRequest: clientSubscriptionRenewalRequestSchema.nullable(),
    paidPeriods: z.array(periodSnapshotSchema),
    endedPeriodIds: z.array(z.string().uuid()),
    appliedFinanceEvidenceIds: z.array(z.string().uuid())
  })
  .strict();
const transitionReceiptSnapshotSchema = z
  .object({
    source: z.literal("client_subscription_transition"),
    transitionId: z.string().uuid(),
    subscriptionId: z.string().uuid(),
    contractId: z.string().uuid(),
    relationshipId: z.string().uuid(),
    journalEpochId: z.string().uuid(),
    subscriptionVersion: z.number().int().positive(),
    state: clientSubscriptionStateSchema,
    entitlementState: z.enum(["active", "ended", "revoked"]),
    entitlementScope: z.enum(["none", "period", "subscription_all"]),
    period: periodSnapshotSchema.nullable(),
    slotEffect: z.enum(["retain", "release"]),
    occurredAt: z.string().datetime({ offset: true })
  })
  .strict();
const resultSnapshotSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("applied"),
      subscription: subscriptionSnapshotSchema,
      events: z.array(clientSubscriptionEventSchema),
      receipt: transitionReceiptSnapshotSchema
    })
    .strict(),
  z
    .object({
      outcome: z.literal("idempotent"),
      subscription: subscriptionSnapshotSchema,
      events: z.tuple([])
    })
    .strict()
]);

type AppliedTransitionData = Omit<ClientSubscriptionCommandApplied, "commandReceipt">;

export function createDrizzleClientSubscriptionCommandUnitOfWork(
  database: ElevenHouseDatabase
): ClientSubscriptionCommandUnitOfWork {
  return {
    execute: (input) =>
      database.transaction(async (transaction): Promise<ClientSubscriptionCommandExecution> => {
        await lockPersistenceScope(
          transaction,
          `client-subscription-command:${input.subscriptionId}:${input.idempotencyKey}`
        );
        const [prior] = await transaction
          .select()
          .from(clientSubscriptionCommandReceipts)
          .where(
            and(
              eq(clientSubscriptionCommandReceipts.subscriptionId, input.subscriptionId),
              eq(clientSubscriptionCommandReceipts.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);
        if (prior) {
          if (prior.requestHash !== input.requestHash) return { outcome: "idempotency_conflict" };
          return {
            outcome: "replayed",
            result: hydrateCommandResult(prior)
          };
        }

        const current = await findClientSubscriptionById(
          transaction,
          input.subscriptionId,
          "update"
        );
        if (!current) return { outcome: "not_found" };
        if (current.version !== input.expectedVersion) {
          return {
            outcome: "version_conflict",
            expectedVersion: input.expectedVersion,
            currentVersion: current.version
          };
        }
        const decision = input.decide(current);
        if (decision.outcome === "rejected") {
          const commandReceipt = commandReceiptForRejected(input, decision.code);
          await transaction.insert(clientSubscriptionCommandReceipts).values({
            subscriptionId: input.subscriptionId,
            expectedVersion: input.expectedVersion,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            resultKind: "rejected",
            result: commandReceipt.result,
            resultSnapshot: null,
            resultVersion: input.expectedVersion,
            transitionId: null,
            slotEffect: null,
            createdAt: sql`clock_timestamp()`
          });
          return { outcome: "rejected", decision, commandReceipt };
        }
        if (decision.outcome === "idempotent") {
          assertIdempotentHead(current, decision.subscription);
          const commandReceipt: ClientSubscriptionCommandPersistenceReceipt = {
            subscriptionId: input.subscriptionId,
            expectedVersion: input.expectedVersion,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            result: { outcome: "idempotent", subscriptionVersion: current.version }
          };
          await transaction.insert(clientSubscriptionCommandReceipts).values({
            subscriptionId: input.subscriptionId,
            expectedVersion: input.expectedVersion,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            resultKind: "idempotent",
            result: commandReceipt.result,
            resultSnapshot: resultSnapshotSchema.parse({
              outcome: "idempotent",
              subscription: current,
              events: []
            }),
            resultVersion: current.version,
            transitionId: null,
            slotEffect: null,
            createdAt: sql`clock_timestamp()`
          });
          return {
            outcome: "idempotent",
            subscription: current,
            events: [],
            commandReceipt
          };
        }

        await persistClientSubscriptionTransition(transaction, {
          current,
          next: decision.subscription,
          receipt: decision.receipt,
          events: decision.events,
          captureEvidenceId: null
        });
        const commandReceipt = commandReceiptForApplied(input, decision);
        await transaction.insert(clientSubscriptionCommandReceipts).values({
          subscriptionId: input.subscriptionId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          resultKind: "applied",
          result: commandReceipt.result,
          resultSnapshot: resultSnapshotSchema.parse({
            outcome: "applied",
            subscription: decision.subscription,
            events: decision.events,
            receipt: decision.receipt
          }),
          resultVersion: decision.subscription.version,
          transitionId: decision.receipt.transitionId,
          slotEffect: decision.receipt.slotEffect,
          createdAt: new Date(decision.receipt.occurredAt)
        });
        return { ...decision, commandReceipt };
      })
  };
}

export function createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork(
  database: ElevenHouseDatabase
): ClientSubscriptionSourceEventApplicationUnitOfWork {
  return {
    apply: (input) =>
      database.transaction(
        async (transaction): Promise<ClientSubscriptionSourceEventApplicationExecution> => {
          await lockPersistenceScope(
            transaction,
            `client-subscription-source-event:${input.sourceEventId}`
          );
          await lockPersistenceScope(
            transaction,
            `client-subscription-evidence:${input.evidenceId}`
          );
          const [bySource] = await transaction
            .select()
            .from(clientSubscriptionEventApplicationReceipts)
            .where(
              eq(clientSubscriptionEventApplicationReceipts.sourceEventId, input.sourceEventId)
            )
            .limit(1);
          if (bySource) {
            if (
              bySource.sourceEventDigest !== input.sourceEventDigest ||
              bySource.evidenceId !== input.evidenceId ||
              bySource.subscriptionId !== input.subscriptionId
            ) {
              return { outcome: "source_event_conflict" };
            }
            return {
              outcome: "replayed",
              result: hydrateSourceEventResult(bySource)
            };
          }
          const [byEvidence] = await transaction
            .select({ sourceEventId: clientSubscriptionEventApplicationReceipts.sourceEventId })
            .from(clientSubscriptionEventApplicationReceipts)
            .where(eq(clientSubscriptionEventApplicationReceipts.evidenceId, input.evidenceId))
            .limit(1);
          if (byEvidence) return { outcome: "evidence_conflict" };

          const current = await findClientSubscriptionById(
            transaction,
            input.subscriptionId,
            "update"
          );
          if (!current) return { outcome: "not_found" };
          if (current.version !== input.expectedVersion) {
            return {
              outcome: "version_conflict",
              expectedVersion: input.expectedVersion,
              currentVersion: current.version
            };
          }
          const decision = input.decide(current);
          if (decision.outcome === "rejected") {
            const applicationReceipt = sourceReceiptForRejected(input, decision.code);
            await insertSourceEventReceipt(transaction, applicationReceipt, null, null, null);
            return { outcome: "rejected", decision, applicationReceipt };
          }
          if (decision.outcome === "idempotent") {
            assertIdempotentHead(current, decision.subscription);
            const applicationReceipt: ClientSubscriptionSourceEventApplicationReceipt = {
              subscriptionId: input.subscriptionId,
              sourceEventId: input.sourceEventId,
              sourceEventDigest: input.sourceEventDigest,
              evidenceId: input.evidenceId,
              result: { outcome: "idempotent", subscriptionVersion: current.version }
            };
            await insertSourceEventReceipt(
              transaction,
              applicationReceipt,
              null,
              null,
              resultSnapshotSchema.parse({
                outcome: "idempotent",
                subscription: current,
                events: []
              })
            );
            return {
              outcome: "idempotent",
              subscription: current,
              events: [],
              applicationReceipt
            };
          }

          await persistClientSubscriptionTransition(transaction, {
            current,
            next: decision.subscription,
            receipt: decision.receipt,
            events: decision.events,
            captureEvidenceId: input.evidenceId
          });
          const applicationReceipt = sourceReceiptForApplied(input, decision);
          await insertSourceEventReceipt(
            transaction,
            applicationReceipt,
            decision.receipt.transitionId,
            decision.receipt.slotEffect,
            resultSnapshotSchema.parse({
              outcome: "applied",
              subscription: decision.subscription,
              events: decision.events,
              receipt: decision.receipt
            })
          );
          return { ...decision, applicationReceipt };
        }
      )
  };
}

type CommandReceiptRow = typeof clientSubscriptionCommandReceipts.$inferSelect;
type SourceReceiptRow = typeof clientSubscriptionEventApplicationReceipts.$inferSelect;

function hydrateCommandResult(row: CommandReceiptRow): ClientSubscriptionCommandPersistedResult {
  const result = persistenceResultSchema.parse(row.result);
  const commandReceipt: ClientSubscriptionCommandPersistenceReceipt = {
    subscriptionId: row.subscriptionId,
    expectedVersion: row.expectedVersion,
    idempotencyKey: row.idempotencyKey,
    requestHash: sha256DigestSchema.parse(row.requestHash),
    result
  };
  if (result.outcome === "rejected") {
    return {
      outcome: "rejected",
      decision: { outcome: "rejected", code: result.code },
      commandReceipt
    };
  }
  const snapshot = resultSnapshotSchema.parse(row.resultSnapshot);
  const subscription = snapshot.subscription;
  if (result.outcome === "idempotent") {
    if (snapshot.outcome !== "idempotent") {
      throw new Error("Idempotent command receipt snapshot kind is invalid");
    }
    return { outcome: "idempotent", subscription, events: [], commandReceipt };
  }
  if (snapshot.outcome !== "applied" || snapshot.receipt.transitionId !== result.transitionId) {
    throw new Error("Applied command receipt snapshot identity is invalid");
  }
  return {
    outcome: "applied",
    subscription,
    events: snapshot.events,
    receipt: snapshot.receipt,
    commandReceipt
  };
}

function hydrateSourceEventResult(
  row: SourceReceiptRow
): ClientSubscriptionSourceEventApplicationResult {
  const result = persistenceResultSchema.parse(row.result);
  const applicationReceipt: ClientSubscriptionSourceEventApplicationReceipt = {
    subscriptionId: row.subscriptionId,
    sourceEventId: row.sourceEventId,
    sourceEventDigest: sha256DigestSchema.parse(row.sourceEventDigest),
    evidenceId: row.evidenceId,
    result
  };
  if (result.outcome === "rejected") {
    return {
      outcome: "rejected",
      decision: { outcome: "rejected", code: result.code },
      applicationReceipt
    };
  }
  const snapshot = resultSnapshotSchema.parse(row.resultSnapshot);
  const subscription = snapshot.subscription;
  if (result.outcome === "idempotent") {
    if (snapshot.outcome !== "idempotent") {
      throw new Error("Idempotent source receipt snapshot kind is invalid");
    }
    return { outcome: "idempotent", subscription, events: [], applicationReceipt };
  }
  if (snapshot.outcome !== "applied" || snapshot.receipt.transitionId !== result.transitionId) {
    throw new Error("Applied source receipt snapshot identity is invalid");
  }
  return {
    outcome: "applied",
    subscription,
    events: snapshot.events,
    receipt: snapshot.receipt,
    applicationReceipt
  };
}

function commandReceiptForRejected(
  input: {
    readonly subscriptionId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly requestHash: `sha256:${string}`;
  },
  code: z.infer<typeof rejectedCodeSchema>
): ClientSubscriptionCommandPersistenceReceipt {
  return {
    subscriptionId: input.subscriptionId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    result: { outcome: "rejected", code }
  };
}

function commandReceiptForApplied(
  input: {
    readonly subscriptionId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly requestHash: `sha256:${string}`;
  },
  decision: AppliedTransitionData
): ClientSubscriptionCommandPersistenceReceipt {
  return {
    subscriptionId: input.subscriptionId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    result: {
      outcome: "applied",
      subscriptionVersion: decision.subscription.version,
      transitionId: decision.receipt.transitionId,
      slotEffect: decision.receipt.slotEffect
    }
  };
}

function sourceReceiptForRejected(
  input: {
    readonly subscriptionId: string;
    readonly sourceEventId: string;
    readonly sourceEventDigest: `sha256:${string}`;
    readonly evidenceId: string;
  },
  code: z.infer<typeof rejectedCodeSchema>
): ClientSubscriptionSourceEventApplicationReceipt {
  return {
    subscriptionId: input.subscriptionId,
    sourceEventId: input.sourceEventId,
    sourceEventDigest: input.sourceEventDigest,
    evidenceId: input.evidenceId,
    result: { outcome: "rejected", code }
  };
}

function sourceReceiptForApplied(
  input: {
    readonly subscriptionId: string;
    readonly sourceEventId: string;
    readonly sourceEventDigest: `sha256:${string}`;
    readonly evidenceId: string;
  },
  decision: AppliedTransitionData
): ClientSubscriptionSourceEventApplicationReceipt {
  return {
    subscriptionId: input.subscriptionId,
    sourceEventId: input.sourceEventId,
    sourceEventDigest: input.sourceEventDigest,
    evidenceId: input.evidenceId,
    result: {
      outcome: "applied",
      subscriptionVersion: decision.subscription.version,
      transitionId: decision.receipt.transitionId,
      slotEffect: decision.receipt.slotEffect
    }
  };
}

async function insertSourceEventReceipt(
  transaction: ClientSubscriptionTransaction,
  receipt: ClientSubscriptionSourceEventApplicationReceipt,
  transitionId: string | null,
  slotEffect: "retain" | "release" | null,
  resultSnapshot: z.infer<typeof resultSnapshotSchema> | null
): Promise<void> {
  await transaction.insert(clientSubscriptionEventApplicationReceipts).values({
    sourceEventId: receipt.sourceEventId,
    sourceEventDigest: receipt.sourceEventDigest,
    evidenceId: receipt.evidenceId,
    subscriptionId: receipt.subscriptionId,
    resultKind: receipt.result.outcome,
    result: receipt.result,
    resultSnapshot,
    resultVersion:
      receipt.result.outcome === "rejected"
        ? await currentSubscriptionVersion(transaction, receipt.subscriptionId)
        : receipt.result.subscriptionVersion,
    transitionId,
    slotEffect,
    createdAt: sql`clock_timestamp()`
  });
}

async function currentSubscriptionVersion(
  transaction: ClientSubscriptionTransaction,
  subscriptionId: string
): Promise<number> {
  const subscription = await findClientSubscriptionById(transaction, subscriptionId);
  if (!subscription) throw new Error("Client subscription source receipt head is missing");
  return subscription.version;
}

function assertIdempotentHead(current: ClientSubscription, decided: ClientSubscription): void {
  if (current.id !== decided.id || current.version !== decided.version) {
    throw new Error("Idempotent subscription decision changed the locked head");
  }
}

async function lockPersistenceScope(
  transaction: ClientSubscriptionTransaction,
  scope: string
): Promise<void> {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${scope}, 0))`);
}
