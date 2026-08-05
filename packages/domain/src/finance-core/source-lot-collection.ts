import { Temporal } from "@js-temporal/polyfill";
import type { EconomicCaptureEffect } from "./economic-payment";
import { serializeFinanceSourceKey } from "./finance-source-key";
import type { OrderEconomicsSnapshot } from "./order-economics";
import { hydrateLot } from "./source-lot-codec";
import {
  type PayableLotAllocation,
  type PayableLotCaptureSource,
  type PayableSourceLot
} from "./source-lot-types";
import { exactDataArray, fail, sameMoney } from "./source-lot-validation";

export function scopedLots(value: unknown, astrologerUserId: string, currency: "RUB") {
  const lots = lotArray(value);
  assertUniqueLotIds(lots);
  assertLotCollectionIntegrity(lots);
  if (
    lots.some(
      (lot) => lot.astrologerUserId !== astrologerUserId || lot.amount.currency !== currency
    )
  ) {
    fail("owner_currency_mismatch");
  }
  return lots;
}

export function lotArray(value: unknown): readonly PayableSourceLot[] {
  return Object.freeze(exactDataArray(value).map((lot) => hydrateLot(lot)));
}

export function assertUniqueLotIds(lots: readonly PayableSourceLot[]): void {
  if (new Set(lots.map((lot) => lot.lotId)).size !== lots.length) fail("duplicate_lot_id");
}

export function assertLotCollectionIntegrity(lots: readonly PayableSourceLot[]): void {
  const byId = new Map(lots.map((lot) => [lot.lotId, lot] as const));
  const rootIdentity = new Map<string, string>();
  const sourceRoot = new Map<string, string>();
  const intentRoot = new Map<string, string>();
  const providerCaptureRoot = new Map<string, string>();
  const captureEvidenceRoot = new Map<string, string>();
  const activeByRoot = new Map<string, bigint>();
  for (const lot of lots) {
    const identity = serializeLotRootIdentity(lot);
    const existingIdentity = rootIdentity.get(lot.rootLotId);
    if (existingIdentity !== undefined && existingIdentity !== identity) fail("lineage_invalid");
    rootIdentity.set(lot.rootLotId, identity);

    const captureSource = serializeFinanceSourceKey(lot.captureSource.sourceKey);
    const existingRoot = sourceRoot.get(captureSource);
    if (existingRoot !== undefined && existingRoot !== lot.rootLotId) {
      fail("duplicate_capture_source");
    }
    sourceRoot.set(captureSource, lot.rootLotId);
    assertOneCaptureRoot(intentRoot, lot.captureSource.intentId, lot.rootLotId);
    assertOneCaptureRoot(providerCaptureRoot, providerCaptureKey(lot.captureSource), lot.rootLotId);
    assertOneCaptureRoot(captureEvidenceRoot, lot.captureSource.canonicalEvidenceId, lot.rootLotId);

    if (lot.parentLotId !== null) {
      const parent = byId.get(lot.parentLotId);
      if (
        parent &&
        (parent.rootLotId !== lot.rootLotId ||
          parent.lineageDepth + 1 !== lot.lineageDepth ||
          (parent.status === "active" && lot.status === "active"))
      ) {
        fail("lineage_invalid");
      }
    }
    if (
      lot.status === "active" &&
      lot.lineageDepth > 0 &&
      byId.get(lot.rootLotId)?.status === "active"
    ) {
      fail("lineage_invalid");
    }
    if (lot.status === "active") {
      activeByRoot.set(
        lot.rootLotId,
        (activeByRoot.get(lot.rootLotId) ?? 0n) + BigInt(lot.amount.amountMinor)
      );
    }
  }
  for (const [rootLotId, activeAmount] of activeByRoot) {
    const representative = lots.find((lot) => lot.rootLotId === rootLotId);
    if (!representative || activeAmount > BigInt(representative.economics.payable.amountMinor)) {
      fail("conservation_violation");
    }
  }
}

export function assertOneCaptureRoot(
  roots: Map<string, string>,
  key: string,
  rootLotId: string
): void {
  const existingRoot = roots.get(key);
  if (existingRoot !== undefined && existingRoot !== rootLotId) {
    fail("duplicate_capture_source");
  }
  roots.set(key, rootLotId);
}

export function serializeLotRootIdentity(lot: PayableSourceLot): string {
  return JSON.stringify([
    lot.sourceId,
    lot.astrologerUserId,
    lot.economics,
    lot.riskPolicy,
    lot.fulfillment,
    serializeCaptureSource(lot.captureSource)
  ]);
}

export function compareAvailableLots(left: PayableSourceLot, right: PayableSourceLot): number {
  if (left.becameAvailableAt === null || right.becameAvailableAt === null) {
    return fail("invalid_field");
  }
  return (
    Temporal.Instant.compare(left.becameAvailableAt, right.becameAvailableAt) ||
    compareCodeUnits(left.sourceId, right.sourceId) ||
    compareCodeUnits(left.lotId, right.lotId)
  );
}

export function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function allocationMatchesLot(
  allocation: PayableLotAllocation,
  lot: PayableSourceLot
): boolean {
  return (
    allocation.rootLotId === lot.rootLotId &&
    allocation.sourceId === lot.sourceId &&
    allocation.bucket === lot.bucket &&
    allocation.becameAvailableAt === lot.becameAvailableAt
  );
}

export function assertCaptureMatchesEconomics(
  effect: Extract<EconomicCaptureEffect, { kind: "client_sale_captured" }>,
  economics: OrderEconomicsSnapshot
): void {
  if (effect.sourceId !== economics.orderId || !sameMoney(effect.amount, economics.gross)) {
    fail("capture_correlation_mismatch");
  }
}

export function assertCaptureMatchesLot(
  effect: Extract<EconomicCaptureEffect, { kind: "client_sale_captured" }>,
  lot: PayableSourceLot
): void {
  assertCaptureMatchesEconomics(effect, lot.economics);
  if (
    effect.intentId !== lot.captureSource.intentId ||
    effect.providerAccount.providerAccountId !== lot.captureSource.providerAccountId ||
    effect.providerPaymentId !== lot.captureSource.providerPaymentId ||
    effect.canonicalEvidenceId !== lot.captureSource.canonicalEvidenceId
  ) {
    fail("capture_correlation_mismatch");
  }
}

export function serializeCaptureSource(source: PayableLotCaptureSource): string {
  return JSON.stringify([
    serializeFinanceSourceKey(source.sourceKey),
    source.intentId,
    source.providerAccountId,
    source.providerPaymentId,
    source.canonicalEvidenceId,
    source.paymentIntent.version
  ]);
}

export function providerCaptureKey(source: PayableLotCaptureSource): string {
  return JSON.stringify([source.providerAccountId, source.providerPaymentId]);
}

export function assertComponentLotId(amountMinor: number, lotId: string | null): void {
  if (amountMinor > 0 !== (lotId !== null)) fail("reserve_allocation_invalid");
}

export function assertFreshOutputIds(
  ids: readonly (string | null)[],
  existingIds: readonly string[]
): void {
  const actual = ids.filter((id): id is string => id !== null);
  if (new Set(actual).size !== actual.length || actual.some((id) => existingIds.includes(id))) {
    fail("duplicate_lot_id");
  }
}

export function assertConservation(
  consumed: readonly PayableSourceLot[],
  created: readonly PayableSourceLot[]
): void {
  const consumedByRoot = amountsByRoot(consumed);
  const createdByRoot = amountsByRoot(created);
  if (
    consumedByRoot.size !== createdByRoot.size ||
    [...consumedByRoot].some(([root, amount]) => createdByRoot.get(root) !== amount)
  ) {
    fail("conservation_violation");
  }
}

export function amountsByRoot(lots: readonly PayableSourceLot[]): Map<string, bigint> {
  const result = new Map<string, bigint>();
  for (const lot of lots) {
    result.set(lot.rootLotId, (result.get(lot.rootLotId) ?? 0n) + BigInt(lot.amount.amountMinor));
  }
  return result;
}
