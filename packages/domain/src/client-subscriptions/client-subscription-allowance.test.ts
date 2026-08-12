import { describe, expect, it } from "vitest";
import {
  consumeAvailableAllowance,
  consumeReservedAllowance,
  createPeriodAllowance,
  expirePeriodAllowance,
  forfeitReservedAllowance,
  releaseReservedAllowance,
  reservePeriodAllowance
} from "./client-subscription-allowance";

const periodId = "11111111-1111-4111-8111-111111111111";
const endsAt = "2026-09-11T12:00:00.000Z";

describe("client subscription period allowance", () => {
  it("atomically reserves, consumes, and releases without breaking bucket arithmetic", () => {
    const initial = createPeriodAllowance({ periodId, total: 3, endsAt });
    const reserved = reservePeriodAllowance(initial, {
      expectedVersion: 1,
      idempotencyKey: "reserve-1",
      reservationId: "reservation-1",
      now: "2026-08-12T12:00:00.000Z"
    });
    expect(reserved).toMatchObject({
      outcome: "applied",
      allowance: { total: 3, available: 2, reserved: 1, consumed: 0, released: 0, version: 2 }
    });
    if (reserved.outcome !== "applied") throw new Error("reservation must apply");

    const consumed = consumeReservedAllowance(reserved.allowance, {
      expectedVersion: 2,
      idempotencyKey: "consume-reservation-1",
      reservationId: "reservation-1",
      now: "2026-08-13T12:00:00.000Z"
    });
    expect(consumed).toMatchObject({
      outcome: "applied",
      allowance: { available: 2, reserved: 0, consumed: 1, released: 0, version: 3 }
    });

    expect(
      consumeAvailableAllowance(createPeriodAllowance({ periodId, total: 1, endsAt }), {
        expectedVersion: 1,
        idempotencyKey: "consume-client-entry",
        consumptionId: "entry-1",
        now: "2026-08-13T12:00:00.000Z"
      })
    ).toMatchObject({
      outcome: "applied",
      allowance: { available: 0, reserved: 0, consumed: 1, released: 0 }
    });
  });

  it("returns a released reservation to available only before the period end", () => {
    const initial = createPeriodAllowance({ periodId, total: 2, endsAt });
    const reserved = reservePeriodAllowance(initial, {
      expectedVersion: 1,
      idempotencyKey: "reserve-before-end",
      reservationId: "reservation-before-end",
      now: "2026-08-12T12:00:00.000Z"
    });
    if (reserved.outcome !== "applied") throw new Error("reservation must apply");
    expect(
      releaseReservedAllowance(reserved.allowance, {
        expectedVersion: 2,
        idempotencyKey: "release-before-end",
        reservationId: "reservation-before-end",
        now: "2026-09-11T11:59:59.999Z"
      })
    ).toMatchObject({
      outcome: "applied",
      allowance: { available: 2, reserved: 0, consumed: 0, released: 0 }
    });

    const lateReserved = reservePeriodAllowance(initial, {
      expectedVersion: 1,
      idempotencyKey: "reserve-for-late-release",
      reservationId: "reservation-late",
      now: "2026-08-12T12:00:00.000Z"
    });
    if (lateReserved.outcome !== "applied") throw new Error("reservation must apply");
    expect(
      releaseReservedAllowance(lateReserved.allowance, {
        expectedVersion: 2,
        idempotencyKey: "release-after-end",
        reservationId: "reservation-late",
        now: endsAt
      })
    ).toMatchObject({
      outcome: "applied",
      allowance: { available: 1, reserved: 0, consumed: 0, released: 1 }
    });
  });

  it("forfeits a finance-revoked reservation into a permanently nonusable bucket", () => {
    const initial = createPeriodAllowance({ periodId, total: 2, endsAt });
    const reserved = reservePeriodAllowance(initial, {
      expectedVersion: 1,
      idempotencyKey: "reserve-before-revocation",
      reservationId: "revoked-cycle",
      now: "2026-08-12T12:00:00Z"
    });
    if (reserved.outcome !== "applied") throw new Error("reservation must apply");

    expect(
      forfeitReservedAllowance(reserved.allowance, {
        expectedVersion: 2,
        idempotencyKey: "forfeit-on-revocation",
        reservationId: "revoked-cycle",
        now: "2026-08-13T12:00:00Z"
      })
    ).toMatchObject({
      outcome: "applied",
      allowance: {
        available: 1,
        reserved: 0,
        consumed: 0,
        released: 1,
        reservations: [{ reservationId: "revoked-cycle", state: "released" }]
      },
      receipt: { operation: "forfeit_reserved" }
    });
  });

  it("expires available units but preserves an open reserved cycle past the paid boundary", () => {
    const initial = createPeriodAllowance({ periodId, total: 3, endsAt });
    const reserved = reservePeriodAllowance(initial, {
      expectedVersion: 1,
      idempotencyKey: "reserve-open-cycle",
      reservationId: "open-cycle-1",
      now: "2026-08-12T12:00:00.000Z"
    });
    if (reserved.outcome !== "applied") throw new Error("reservation must apply");
    const expired = expirePeriodAllowance(reserved.allowance, {
      expectedVersion: 2,
      idempotencyKey: "expire-period-1",
      now: endsAt
    });
    expect(expired).toMatchObject({
      outcome: "applied",
      allowance: { total: 3, available: 0, reserved: 1, consumed: 0, released: 2 },
      receipt: {
        operation: "expire_available",
        command: { operation: "expire_available", occurredAt: "2026-09-11T12:00:00Z" }
      }
    });
    if (expired.outcome !== "applied") throw new Error("allowance must expire");
    expect(
      consumeReservedAllowance(expired.allowance, {
        expectedVersion: 3,
        idempotencyKey: "consume-open-cycle-after-end",
        reservationId: "open-cycle-1",
        now: "2026-09-12T12:00:00.000Z"
      })
    ).toMatchObject({
      outcome: "applied",
      allowance: { total: 3, available: 0, reserved: 0, consumed: 1, released: 2 }
    });
  });

  it("rejects expiry before the paid boundary without a type escape hatch", () => {
    expect(
      expirePeriodAllowance(createPeriodAllowance({ periodId, total: 1, endsAt }), {
        expectedVersion: 1,
        idempotencyKey: "early-expiry",
        now: "2026-09-11T11:59:59.999Z"
      })
    ).toEqual({ outcome: "paid_access_not_ended" });
  });

  it("replays duplicate commands and rejects stale concurrent versions or key reuse", () => {
    const initial = createPeriodAllowance({ periodId, total: 1, endsAt });
    const command = {
      expectedVersion: 1,
      idempotencyKey: "reserve-once",
      reservationId: "reservation-1",
      now: "2026-08-12T12:00:00.000Z"
    } as const;
    const first = reservePeriodAllowance(initial, command);
    if (first.outcome !== "applied") throw new Error("reservation must apply");
    expect(reservePeriodAllowance(first.allowance, command)).toMatchObject({
      outcome: "idempotent"
    });
    expect(
      reservePeriodAllowance(first.allowance, {
        ...command,
        idempotencyKey: "different-command",
        reservationId: "reservation-2"
      })
    ).toEqual({ outcome: "version_conflict", expectedVersion: 1, currentVersion: 2 });
    expect(
      reservePeriodAllowance(first.allowance, {
        ...command,
        expectedVersion: 2,
        reservationId: "reservation-different"
      })
    ).toEqual({ outcome: "idempotency_conflict" });
  });

  it("rejects a duplicate reservation id under a distinct idempotency key without mutation", () => {
    const initial = createPeriodAllowance({ periodId, total: 2, endsAt });
    const first = reservePeriodAllowance(initial, {
      expectedVersion: 1,
      idempotencyKey: "reserve-key-1",
      reservationId: "shared-reservation",
      now: "2026-08-12T12:00:00.000Z"
    });
    if (first.outcome !== "applied") throw new Error("first reservation must apply");

    expect(
      reservePeriodAllowance(first.allowance, {
        expectedVersion: 2,
        idempotencyKey: "reserve-key-2",
        reservationId: "shared-reservation",
        now: "2026-08-12T12:01:00.000Z"
      })
    ).toEqual({ outcome: "reservation_already_exists" });
    expect(first.allowance).toMatchObject({
      version: 2,
      available: 1,
      reserved: 1,
      reservations: [{ reservationId: "shared-reservation", state: "reserved" }]
    });
  });
});
