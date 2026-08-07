/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import { createHash } from "node:crypto";
import {
  type StoredWebhookReceipt,
  type StoreWebhookBeforeAcknowledgementCommand,
  type WebhookIngressStorageUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeWebhookInbox,
  financeWebhookStoredReceipts
} from "../../schema/finance/webhook-inbox.schema";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type WebhookIngressStoragePersistenceReason =
  | "invalid_command"
  | "transport_identity_conflict"
  | "receipt_missing"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class WebhookIngressStoragePersistenceError extends Error {
  readonly code = "webhook_ingress_storage_persistence_error";

  constructor(readonly reason: WebhookIngressStoragePersistenceReason) {
    super("Webhook ingress could not be stored before acknowledgement");
    this.name = "WebhookIngressStoragePersistenceError";
  }
}

/**
 * Stores only transport evidence. It cannot create a semantic fact, mutate an economic payment,
 * or post a journal entry; those require a later claimed inbox item and a canonical provider read.
 */
export function createDrizzleWebhookIngressStorageUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: Readonly<{ database: NodePgDatabase<TSchema> }>): WebhookIngressStorageUnitOfWork {
  return Object.freeze({
    async storeBeforeAcknowledgement(command) {
      const ingress = normalize(command);
      try {
        return await input.database.transaction((transaction) => storeInTransaction(transaction, ingress));
      } catch (error) {
        if (error instanceof WebhookIngressStoragePersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23503" || code === "23514") fail("persistence_write_incomplete");
        if (code === "23505") fail("transport_identity_conflict");
        throw error;
      }
    }
  } satisfies WebhookIngressStorageUnitOfWork);
}

type NormalizedIngress = Readonly<{
  providerAccount: Readonly<{
    seriesId: string;
    providerAccountId: string;
    identityVersion: number;
  }>;
  webhookId: string;
  providerEventType: string;
  rawBodyDigest: `sha256:${string}`;
  sealedPayloadRef: string;
  signatureScheme: string;
  verifierContractVersion: string;
  webhookSigningKeyVersionId: string;
  signedTimestamp: string;
  signatureEvidenceDigest: `sha256:${string}`;
  verifiedAt: string;
  receivedAt: string;
}>;

async function storeInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  ingress: NormalizedIngress
): Promise<StoredWebhookReceipt> {
  const inboxItemId = inboxId(ingress);
  const inserted = await transaction
    .insert(financeWebhookInbox)
    .values({
      id: inboxItemId,
      seriesId: ingress.providerAccount.seriesId,
      providerAccountId: ingress.providerAccount.providerAccountId,
      providerIdentityVersion: ingress.providerAccount.identityVersion,
      provider: "arc_pay",
      transportEventId: ingress.webhookId,
      providerEventType: ingress.providerEventType,
      artifactId: ingress.sealedPayloadRef,
      rawBodyDigest: ingress.rawBodyDigest,
      signatureStatus: "verified",
      signatureScheme: ingress.signatureScheme,
      verifierContractVersion: ingress.verifierContractVersion,
      webhookSigningKeyVersionId: ingress.webhookSigningKeyVersionId,
      signedTimestamp: new Date(ingress.signedTimestamp),
      signatureEvidenceDigest: ingress.signatureEvidenceDigest,
      verifiedAt: new Date(ingress.verifiedAt),
      receivedAt: new Date(ingress.receivedAt),
      processingStatus: "stored",
      processingAttempts: "0",
      lastErrorClass: null,
      lastCheckpointSequence: "0",
      lastProcessorVersion: null,
      lastCheckpointCode: null,
      availableAt: new Date(ingress.receivedAt),
      leaseOwnerId: null,
      leaseFence: "0",
      leaseExpiresAt: null,
      claimedAt: null,
      version: "1",
      completedAt: null,
      quarantinedAt: null
    })
    .onConflictDoNothing({
      target: [
        financeWebhookInbox.seriesId,
        financeWebhookInbox.providerAccountId,
        financeWebhookInbox.providerIdentityVersion,
        financeWebhookInbox.transportEventId
      ]
    })
    .returning({ id: financeWebhookInbox.id });

  if (inserted.length === 1) {
    if (inserted[0]?.id !== inboxItemId) fail("persistence_write_incomplete");
    const [receipt] = await transaction
      .insert(financeWebhookStoredReceipts)
      .values({
        inboxItemId,
        inboxVersion: "1",
        seriesId: ingress.providerAccount.seriesId,
        providerAccountId: ingress.providerAccount.providerAccountId,
        providerIdentityVersion: ingress.providerAccount.identityVersion,
        provider: "arc_pay",
        transportEventId: ingress.webhookId,
        providerEventType: ingress.providerEventType,
        artifactId: ingress.sealedPayloadRef,
        rawBodyDigest: ingress.rawBodyDigest,
        signatureStatus: "verified",
        signatureScheme: ingress.signatureScheme,
        verifierContractVersion: ingress.verifierContractVersion,
        webhookSigningKeyVersionId: ingress.webhookSigningKeyVersionId,
        signedTimestamp: new Date(ingress.signedTimestamp),
        signatureEvidenceDigest: ingress.signatureEvidenceDigest,
        verifiedAt: new Date(ingress.verifiedAt),
        receivedAt: new Date(ingress.receivedAt)
      })
      .returning();
    if (!receipt) fail("persistence_write_incomplete");
    return mapReceipt(receipt, "stored_new");
  }
  if (inserted.length !== 0) fail("persistence_write_incomplete");

  const [existing] = await transaction
    .select()
    .from(financeWebhookInbox)
    .where(
      and(
        eq(financeWebhookInbox.seriesId, ingress.providerAccount.seriesId),
        eq(financeWebhookInbox.providerAccountId, ingress.providerAccount.providerAccountId),
        eq(financeWebhookInbox.providerIdentityVersion, ingress.providerAccount.identityVersion),
        eq(financeWebhookInbox.transportEventId, ingress.webhookId)
      )
    )
    .limit(1)
    .for("update");
  if (!existing || !matchesIngress(existing, ingress)) fail("transport_identity_conflict");

  const [receipt] = await transaction
    .select()
    .from(financeWebhookStoredReceipts)
    .where(eq(financeWebhookStoredReceipts.inboxItemId, existing.id))
    .limit(1)
    .for("share");
  if (!receipt) fail("receipt_missing");
  return mapReceipt(receipt, "transport_replay");
}

function normalize(command: StoreWebhookBeforeAcknowledgementCommand): NormalizedIngress {
  try {
    assertExactKeys(command, ["ingressEvidence", "expectedTransportIdentityAbsent"]);
    if (command.expectedTransportIdentityAbsent !== true) fail("invalid_command");
    const ingress = command.ingressEvidence;
    assertExactKeys(ingress, [
      "kind",
      "provider",
      "providerAccount",
      "webhookId",
      "providerEventType",
      "rawBodyDigest",
      "sealedPayloadRef",
      "signatureScheme",
      "verifierContractVersion",
      "webhookSigningKeyVersionId",
      "signedTimestamp",
      "signatureEvidenceDigest",
      "verifiedAt",
      "receivedAt"
    ]);
    if (ingress.kind !== "verified_webhook_ingress_evidence" || ingress.provider !== "arc_pay") {
      fail("invalid_command");
    }
    const providerAccount = ingress.providerAccount;
    assertExactKeys(providerAccount, ["seriesId", "providerAccountId", "identityVersion"]);
    const verifiedAt = isoInstant(ingress.verifiedAt);
    const receivedAt = isoInstant(ingress.receivedAt);
    if (Date.parse(verifiedAt) > Date.parse(receivedAt)) fail("invalid_command");
    return Object.freeze({
      providerAccount: Object.freeze({
        seriesId: identifier(providerAccount.seriesId),
        providerAccountId: identifier(providerAccount.providerAccountId),
        identityVersion: positiveInteger(providerAccount.identityVersion)
      }),
      webhookId: identifier(ingress.webhookId),
      providerEventType: identifier(ingress.providerEventType),
      rawBodyDigest: digest(ingress.rawBodyDigest),
      sealedPayloadRef: identifier(ingress.sealedPayloadRef),
      signatureScheme: identifier(ingress.signatureScheme),
      verifierContractVersion: identifier(ingress.verifierContractVersion),
      webhookSigningKeyVersionId: identifier(ingress.webhookSigningKeyVersionId),
      signedTimestamp: isoInstant(ingress.signedTimestamp),
      signatureEvidenceDigest: digest(ingress.signatureEvidenceDigest),
      verifiedAt,
      receivedAt
    });
  } catch (error) {
    if (error instanceof WebhookIngressStoragePersistenceError) throw error;
    fail("invalid_command");
  }
}

function matchesIngress(
  existing: typeof financeWebhookInbox.$inferSelect,
  ingress: NormalizedIngress
): boolean {
  // ArcPay may redeliver the same transport event after a new local verification
  // attempt. Verification timestamps, HMAC evidence and the sealed-object locator
  // describe that attempt, not the provider event identity. The first accepted
  // inbox evidence remains immutable; a changed payload or event type under the
  // same provider transport ID is a conflict and must never be acknowledged.
  return (
    existing.provider === "arc_pay" &&
    existing.transportEventId === ingress.webhookId &&
    existing.providerEventType === ingress.providerEventType &&
    existing.rawBodyDigest === ingress.rawBodyDigest
  );
}

function mapReceipt(
  receipt: typeof financeWebhookStoredReceipts.$inferSelect,
  dedupeResult: StoredWebhookReceipt["dedupeResult"]
): StoredWebhookReceipt {
  if (
    receipt.provider !== "arc_pay" ||
    receipt.inboxVersion !== "1" ||
    !receipt.persistenceTransactionBoundaryRef ||
    !receipt.storedAt
  ) {
    fail("persistence_write_incomplete");
  }
  return Object.freeze({
    kind: "stored_webhook_receipt",
    inboxItemId: receipt.inboxItemId,
    inboxVersion: 1,
    provider: "arc_pay",
    webhookId: receipt.transportEventId,
    providerAccount: Object.freeze({
      seriesId: receipt.seriesId,
      providerAccountId: receipt.providerAccountId,
      identityVersion: receipt.providerIdentityVersion
    }),
    dedupeResult,
    persistenceTransactionBoundaryRef: receipt.persistenceTransactionBoundaryRef,
    storedAt: receipt.storedAt.toISOString()
  }) as StoredWebhookReceipt;
}

function inboxId(ingress: NormalizedIngress): string {
  const source = [
    "arc_pay",
    ingress.providerAccount.seriesId,
    ingress.providerAccount.providerAccountId,
    String(ingress.providerAccount.identityVersion),
    ingress.webhookId
  ].join("\n");
  return `webhook-inbox:${createHash("sha256").update(source, "utf8").digest("hex")}`;
}

function assertExactKeys(value: unknown, expected: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_command");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length) fail("invalid_command");
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid_command");
  }
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    fail("invalid_command");
  }
  return value;
}

function digest(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail("invalid_command");
  return value as `sha256:${string}`;
}

function isoInstant(value: unknown): string {
  if (typeof value !== "string") fail("invalid_command");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) fail("invalid_command");
  return value;
}

function postgresCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    const record = current as Readonly<{ code?: unknown; cause?: unknown }>;
    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }
  return undefined;
}

function fail(reason: WebhookIngressStoragePersistenceReason): never {
  throw new WebhookIngressStoragePersistenceError(reason);
}
