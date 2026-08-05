import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createOrderEconomicsSnapshot,
  OrderEconomicsSnapshotValidationError,
  type OrderEconomicsSnapshot
} from "./order-economics";
import { createRiskPolicySnapshot, type RiskPolicySnapshot } from "./risk-policy";

function validOrderEconomicsInput(): Record<string, unknown> {
  return {
    orderId: "order-1",
    astrologerUserId: "astrologer-1",
    planId: "start",
    planVersionId: "start-v3",
    gross: { amountMinor: 1_000_000, currency: "RUB" },
    commission: { amountMinor: 40_000, currency: "RUB" },
    payable: { amountMinor: 960_000, currency: "RUB" },
    commissionBps: 400,
    allocationRevision: "bps_half_up_v1"
  };
}

describe("finance core order economics snapshot", () => {
  it("captures the exact immutable tariff-version economics", () => {
    const snapshot = createOrderEconomicsSnapshot(validOrderEconomicsInput());

    expect(snapshot).toEqual({
      orderId: "order-1",
      astrologerUserId: "astrologer-1",
      planId: "start",
      planVersionId: "start-v3",
      gross: { amountMinor: 1_000_000, currency: "RUB" },
      commission: { amountMinor: 40_000, currency: "RUB" },
      payable: { amountMinor: 960_000, currency: "RUB" },
      commissionBps: 400,
      allocationRevision: "bps_half_up_v1"
    });
    expect(Object.keys(snapshot).sort()).toEqual(
      [
        "allocationRevision",
        "astrologerUserId",
        "commission",
        "commissionBps",
        "gross",
        "orderId",
        "payable",
        "planId",
        "planVersionId"
      ].sort()
    );
    expectTypeOf(snapshot).toEqualTypeOf<OrderEconomicsSnapshot>();
  });

  it("defensively freezes all money records and ignores later caller mutations", () => {
    const input = validOrderEconomicsInput();
    const sourceGross = input.gross as Record<string, unknown>;
    const sourceCommission = input.commission as Record<string, unknown>;
    const sourcePayable = input.payable as Record<string, unknown>;
    const snapshot = createOrderEconomicsSnapshot(input);

    expect(snapshot).not.toBe(input);
    expect(snapshot.gross).not.toBe(sourceGross);
    expect(snapshot.commission).not.toBe(sourceCommission);
    expect(snapshot.payable).not.toBe(sourcePayable);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.gross)).toBe(true);
    expect(Object.isFrozen(snapshot.commission)).toBe(true);
    expect(Object.isFrozen(snapshot.payable)).toBe(true);

    sourceGross.amountMinor = 1;
    sourceCommission.amountMinor = 1;
    sourcePayable.amountMinor = 0;
    input.commissionBps = 9_999;

    expect(snapshot.gross.amountMinor).toBe(1_000_000);
    expect(snapshot.commission.amountMinor).toBe(40_000);
    expect(snapshot.payable.amountMinor).toBe(960_000);
    expect(snapshot.commissionBps).toBe(400);
  });

  it.each([
    [1, 0, 0, 1],
    [1, 4_999, 0, 1],
    [1, 5_000, 1, 0],
    [3, 5_000, 2, 1],
    [999, 333, 33, 966],
    [1, 10_000, 1, 0]
  ])(
    "characterizes bps_half_up_v1 for gross=%i and bps=%i",
    (grossMinor, commissionBps, commissionMinor, payableMinor) => {
      const snapshot = createOrderEconomicsSnapshot({
        ...validOrderEconomicsInput(),
        gross: { amountMinor: grossMinor, currency: "RUB" },
        commission: { amountMinor: commissionMinor, currency: "RUB" },
        payable: { amountMinor: payableMinor, currency: "RUB" },
        commissionBps
      });

      expect(snapshot).toMatchObject({
        gross: { amountMinor: grossMinor, currency: "RUB" },
        commission: { amountMinor: commissionMinor, currency: "RUB" },
        payable: { amountMinor: payableMinor, currency: "RUB" },
        commissionBps,
        allocationRevision: "bps_half_up_v1"
      });
    }
  );

  it("fails closed for an unknown allocation revision", () => {
    expect(() =>
      createOrderEconomicsSnapshot({
        ...validOrderEconomicsInput(),
        allocationRevision: "bankers_rounding_v2"
      })
    ).toThrow(OrderEconomicsSnapshotValidationError);
  });

  it.each([
    [
      "commission differs from the characterized allocation",
      { commission: { amountMinor: 39_999, currency: "RUB" } }
    ],
    [
      "payable differs from the characterized allocation",
      { payable: { amountMinor: 960_001, currency: "RUB" } }
    ],
    [
      "gross differs from commission plus payable",
      { gross: { amountMinor: 999_999, currency: "RUB" } }
    ]
  ])("rejects inconsistent economics: %s", (_caseName, replacement) => {
    expect(() =>
      createOrderEconomicsSnapshot({ ...validOrderEconomicsInput(), ...replacement })
    ).toThrow(OrderEconomicsSnapshotValidationError);
  });

  it.each([
    ["empty order", { orderId: "" }],
    ["empty astrologer", { astrologerUserId: "" }],
    ["empty plan", { planId: "" }],
    ["empty plan version", { planVersionId: "" }],
    ["unbounded identifier", { orderId: "o".repeat(201) }],
    [
      "zero gross",
      {
        gross: { amountMinor: 0, currency: "RUB" },
        commission: { amountMinor: 0, currency: "RUB" },
        payable: { amountMinor: 0, currency: "RUB" }
      }
    ],
    ["fractional gross", { gross: { amountMinor: 1.5, currency: "RUB" } }],
    ["negative commission", { commission: { amountMinor: -1, currency: "RUB" } }],
    ["unsafe payable", { payable: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "RUB" } }],
    ["unsupported currency", { payable: { amountMinor: 960_000, currency: "USD" } }],
    ["mixed currencies", { commission: { amountMinor: 40_000, currency: "USD" } }],
    ["fractional bps", { commissionBps: 400.5 }],
    ["negative bps", { commissionBps: -1 }],
    ["excessive bps", { commissionBps: 10_001 }]
  ])("rejects invalid economic input: %s", (_caseName, replacement) => {
    expect(() =>
      createOrderEconomicsSnapshot({ ...validOrderEconomicsInput(), ...replacement })
    ).toThrow(OrderEconomicsSnapshotValidationError);
  });

  it.each([
    ["unknown top-level key", { ...validOrderEconomicsInput(), reserveBps: 1_000 }],
    [
      "unknown money key",
      {
        ...validOrderEconomicsInput(),
        gross: { amountMinor: 1_000_000, currency: "RUB", scale: 2 }
      }
    ]
  ])("rejects input outside the economic contract: %s", (_caseName, candidate) => {
    expect(() => createOrderEconomicsSnapshot(candidate)).toThrow(
      OrderEconomicsSnapshotValidationError
    );
  });

  it("rejects hidden and symbol-keyed fields outside the economic contract", () => {
    const hiddenRiskField = validOrderEconomicsInput();
    Object.defineProperty(hiddenRiskField, "reserveBps", {
      value: 1_000,
      enumerable: false
    });
    const symbolField = validOrderEconomicsInput();
    Object.defineProperty(symbolField, Symbol("reserveBps"), {
      value: 1_000,
      enumerable: false
    });

    expect(() => createOrderEconomicsSnapshot(hiddenRiskField)).toThrow(
      OrderEconomicsSnapshotValidationError
    );
    expect(() => createOrderEconomicsSnapshot(symbolField)).toThrow(
      OrderEconomicsSnapshotValidationError
    );
  });

  it("rejects a top-level accessor without invoking its getter", () => {
    const candidate = validOrderEconomicsInput();
    let getterCalls = 0;
    Object.defineProperty(candidate, "commissionBps", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("top-level getter must not execute");
      }
    });

    let caught: unknown;
    try {
      createOrderEconomicsSnapshot(candidate);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(OrderEconomicsSnapshotValidationError);
    expect(getterCalls).toBe(0);
  });

  it("rejects a nested money accessor without invoking its getter", () => {
    const candidate = validOrderEconomicsInput();
    const gross = candidate.gross as Record<string, unknown>;
    let getterCalls = 0;
    Object.defineProperty(gross, "amountMinor", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("money getter must not execute");
      }
    });

    let caught: unknown;
    try {
      createOrderEconomicsSnapshot(candidate);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(OrderEconomicsSnapshotValidationError);
    expect(getterCalls).toBe(0);
  });

  it("rejects custom prototypes at the top level and inside money records", () => {
    const customTopLevel = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      validOrderEconomicsInput()
    );
    const customGross = validOrderEconomicsInput();
    customGross.gross = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      { amountMinor: 1_000_000, currency: "RUB" }
    );

    expect(() => createOrderEconomicsSnapshot(customTopLevel)).toThrow(
      OrderEconomicsSnapshotValidationError
    );
    expect(() => createOrderEconomicsSnapshot(customGross)).toThrow(
      OrderEconomicsSnapshotValidationError
    );
  });

  it("projects top-level and nested Proxy descriptors without invoking get traps", () => {
    let getterCalls = 0;
    const trap = {
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    };
    const input = validOrderEconomicsInput();
    for (const key of ["gross", "commission", "payable"] as const) {
      input[key] = new Proxy(input[key] as Record<string, unknown>, trap);
    }

    expect(createOrderEconomicsSnapshot(new Proxy(input, trap))).toMatchObject({
      orderId: "order-1",
      gross: { amountMinor: 1_000_000, currency: "RUB" },
      commission: { amountMinor: 40_000, currency: "RUB" },
      payable: { amountMinor: 960_000, currency: "RUB" }
    });
    expect(getterCalls).toBe(0);
  });

  it("replaces a forged same-class reflection error with a fresh generic error", () => {
    const forged = new OrderEconomicsSnapshotValidationError();
    forged.message = "reflection-secret";
    const proxy = new Proxy(validOrderEconomicsInput(), {
      ownKeys() {
        throw forged;
      }
    });

    let caught: unknown;
    try {
      createOrderEconomicsSnapshot(proxy);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrderEconomicsSnapshotValidationError);
    expect(caught).not.toBe(forged);
    expect((caught as Error).message).toBe("Order economics snapshot is invalid");
  });

  it("keeps a later risk snapshot separate from captured commercial economics", () => {
    const economics = createOrderEconomicsSnapshot(validOrderEconomicsInput());
    const capturedEconomics = JSON.parse(JSON.stringify(economics)) as unknown;

    const laterRisk = createRiskPolicySnapshot({
      id: "risk-high",
      policyVersion: 8,
      effectiveRiskTier: "high",
      holdAnchor: "booking_completed",
      holdDurationHours: 96,
      reserveBps: 2_000,
      reserveReleaseDelayDays: 90,
      providerSettlementRequired: true,
      payoutMinimum: { amountMinor: 50_000, currency: "RUB" },
      exceptionAuthority: null,
      effectiveAt: "2026-08-04T08:00:00Z"
    });

    expect(economics).toEqual(capturedEconomics);
    expect("commissionBps" in laterRisk).toBe(false);
    expect("reserveBps" in economics).toBe(false);
    expectTypeOf<RiskPolicySnapshot>().not.toEqualTypeOf<OrderEconomicsSnapshot>();
  });
});
