import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createRiskPolicySnapshot,
  RiskPolicySnapshotValidationError,
  type RiskPolicySnapshot
} from "./risk-policy";

function validRiskPolicyInput(): Record<string, unknown> {
  return {
    id: "risk-policy-standard",
    policyVersion: 7,
    effectiveRiskTier: "standard",
    holdAnchor: "booking_completed",
    holdDurationHours: 48,
    reserveBps: 1_000,
    reserveReleaseDelayDays: 30,
    providerSettlementRequired: true,
    payoutMinimum: { amountMinor: 10_000, currency: "RUB" },
    exceptionAuthority: { id: "risk-exception-policy", version: 2 },
    effectiveAt: "2026-08-03T08:00:00Z"
  };
}

describe("finance core risk policy snapshot", () => {
  it("constructs the exact versioned, commission-free effective risk snapshot", () => {
    const snapshot = createRiskPolicySnapshot(validRiskPolicyInput());

    expect(snapshot).toEqual({
      id: "risk-policy-standard",
      policyVersion: 7,
      effectiveRiskTier: "standard",
      holdAnchor: "booking_completed",
      holdDurationHours: 48,
      reserveBps: 1_000,
      reserveReleaseDelayDays: 30,
      providerSettlementRequired: true,
      payoutMinimum: { amountMinor: 10_000, currency: "RUB" },
      exceptionAuthority: { id: "risk-exception-policy", version: 2 },
      effectiveAt: "2026-08-03T08:00:00Z"
    });
    expect(Object.keys(snapshot).sort()).toEqual(
      [
        "effectiveAt",
        "effectiveRiskTier",
        "exceptionAuthority",
        "holdAnchor",
        "holdDurationHours",
        "id",
        "payoutMinimum",
        "policyVersion",
        "providerSettlementRequired",
        "reserveBps",
        "reserveReleaseDelayDays"
      ].sort()
    );
    expect("platformFeeBps" in snapshot).toBe(false);
    expect("commissionBps" in snapshot).toBe(false);
    expectTypeOf(snapshot).toEqualTypeOf<RiskPolicySnapshot>();
  });

  it("defensively freezes the snapshot and every nested risk control", () => {
    const input = validRiskPolicyInput();
    const sourceMinimum = input.payoutMinimum as Record<string, unknown>;
    const sourceAuthority = input.exceptionAuthority as Record<string, unknown>;
    const snapshot = createRiskPolicySnapshot(input);

    expect(snapshot).not.toBe(input);
    expect(snapshot.payoutMinimum).not.toBe(sourceMinimum);
    expect(snapshot.exceptionAuthority).not.toBe(sourceAuthority);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.payoutMinimum)).toBe(true);
    expect(Object.isFrozen(snapshot.exceptionAuthority)).toBe(true);

    sourceMinimum.amountMinor = 1;
    sourceAuthority.version = 99;
    input.reserveBps = 9_999;

    expect(snapshot.payoutMinimum.amountMinor).toBe(10_000);
    expect(snapshot.exceptionAuthority?.version).toBe(2);
    expect(snapshot.reserveBps).toBe(1_000);
  });

  it("allows an explicit absence of exception authority without inventing a fallback", () => {
    const snapshot = createRiskPolicySnapshot({
      ...validRiskPolicyInput(),
      payoutMinimum: { amountMinor: 0, currency: "RUB" },
      exceptionAuthority: null
    });

    expect(snapshot.payoutMinimum).toEqual({ amountMinor: 0, currency: "RUB" });
    expect(snapshot.exceptionAuthority).toBeNull();
  });

  it.each(["platformFeeBps", "commissionBps", "unexpectedControl"])(
    "rejects the commercial or unknown top-level key %s",
    (key) => {
      expect(() => createRiskPolicySnapshot({ ...validRiskPolicyInput(), [key]: 400 })).toThrow(
        RiskPolicySnapshotValidationError
      );
    }
  );

  it("rejects hidden and symbol-keyed commercial controls", () => {
    const hiddenControl = validRiskPolicyInput();
    Object.defineProperty(hiddenControl, "commissionBps", {
      value: 400,
      enumerable: false
    });
    const symbolControl = validRiskPolicyInput();
    Object.defineProperty(symbolControl, Symbol("platformFeeBps"), {
      value: 400,
      enumerable: false
    });

    expect(() => createRiskPolicySnapshot(hiddenControl)).toThrow(
      RiskPolicySnapshotValidationError
    );
    expect(() => createRiskPolicySnapshot(symbolControl)).toThrow(
      RiskPolicySnapshotValidationError
    );
  });

  it("rejects a top-level accessor without invoking its getter", () => {
    const candidate = validRiskPolicyInput();
    let getterCalls = 0;
    Object.defineProperty(candidate, "effectiveRiskTier", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("top-level getter must not execute");
      }
    });

    let caught: unknown;
    try {
      createRiskPolicySnapshot(candidate);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RiskPolicySnapshotValidationError);
    expect(getterCalls).toBe(0);
  });

  it("rejects nested payout and exception-authority accessors without invoking them", () => {
    const payoutCandidate = validRiskPolicyInput();
    const payoutMinimum = payoutCandidate.payoutMinimum as Record<string, unknown>;
    let payoutGetterCalls = 0;
    Object.defineProperty(payoutMinimum, "amountMinor", {
      enumerable: true,
      get() {
        payoutGetterCalls += 1;
        throw new Error("payout getter must not execute");
      }
    });

    const authorityCandidate = validRiskPolicyInput();
    const exceptionAuthority = authorityCandidate.exceptionAuthority as Record<string, unknown>;
    let authorityGetterCalls = 0;
    Object.defineProperty(exceptionAuthority, "version", {
      enumerable: true,
      get() {
        authorityGetterCalls += 1;
        throw new Error("authority getter must not execute");
      }
    });

    let payoutError: unknown;
    let authorityError: unknown;
    try {
      createRiskPolicySnapshot(payoutCandidate);
    } catch (error) {
      payoutError = error;
    }
    try {
      createRiskPolicySnapshot(authorityCandidate);
    } catch (error) {
      authorityError = error;
    }

    expect(payoutError).toBeInstanceOf(RiskPolicySnapshotValidationError);
    expect(authorityError).toBeInstanceOf(RiskPolicySnapshotValidationError);
    expect(payoutGetterCalls).toBe(0);
    expect(authorityGetterCalls).toBe(0);
  });

  it("rejects custom prototypes at the top level and inside payout controls", () => {
    const customTopLevel = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      validRiskPolicyInput()
    );
    const customPayout = validRiskPolicyInput();
    customPayout.payoutMinimum = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      { amountMinor: 10_000, currency: "RUB" }
    );

    expect(() => createRiskPolicySnapshot(customTopLevel)).toThrow(
      RiskPolicySnapshotValidationError
    );
    expect(() => createRiskPolicySnapshot(customPayout)).toThrow(RiskPolicySnapshotValidationError);
  });

  it("projects top-level and nested Proxy descriptors without invoking get traps", () => {
    let getterCalls = 0;
    const trap = {
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    };
    const input = validRiskPolicyInput();
    input.payoutMinimum = new Proxy(input.payoutMinimum as Record<string, unknown>, trap);
    input.exceptionAuthority = new Proxy(input.exceptionAuthority as Record<string, unknown>, trap);

    expect(createRiskPolicySnapshot(new Proxy(input, trap))).toMatchObject({
      id: "risk-policy-standard",
      payoutMinimum: { amountMinor: 10_000, currency: "RUB" },
      exceptionAuthority: { id: "risk-exception-policy", version: 2 }
    });
    expect(getterCalls).toBe(0);
  });

  it("replaces a forged same-class reflection error with a fresh generic error", () => {
    const forged = new RiskPolicySnapshotValidationError();
    forged.message = "reflection-secret";
    const proxy = new Proxy(validRiskPolicyInput(), {
      ownKeys() {
        throw forged;
      }
    });

    let caught: unknown;
    try {
      createRiskPolicySnapshot(proxy);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RiskPolicySnapshotValidationError);
    expect(caught).not.toBe(forged);
    expect((caught as Error).message).toBe("Risk policy snapshot is invalid");
  });

  it("rejects unversioned input", () => {
    const candidate = validRiskPolicyInput();
    delete candidate.policyVersion;

    expect(() => createRiskPolicySnapshot(candidate)).toThrow(RiskPolicySnapshotValidationError);
  });

  it.each([
    ["zero policy version", { policyVersion: 0 }],
    ["fractional policy version", { policyVersion: 1.5 }],
    ["empty id", { id: "" }],
    ["unbounded id", { id: "r".repeat(201) }],
    ["unknown risk tier", { effectiveRiskTier: "critical" }],
    ["unknown hold anchor", { holdAnchor: "payment_captured" }],
    ["negative hold", { holdDurationHours: -1 }],
    ["excessive hold", { holdDurationHours: 4_321 }],
    ["fractional hold", { holdDurationHours: 0.5 }],
    ["negative reserve", { reserveBps: -1 }],
    ["excessive reserve", { reserveBps: 10_001 }],
    ["negative reserve release delay", { reserveReleaseDelayDays: -1 }],
    ["excessive reserve release delay", { reserveReleaseDelayDays: 541 }],
    ["non-boolean settlement control", { providerSettlementRequired: "yes" }],
    ["malformed effective instant", { effectiveAt: "2026-08-03" }]
  ])("rejects invalid scalar input: %s", (_caseName, replacement) => {
    const candidate = { ...validRiskPolicyInput(), ...replacement };

    expect(() => createRiskPolicySnapshot(candidate)).toThrow(RiskPolicySnapshotValidationError);
  });

  it.each([
    ["negative payout minimum", { amountMinor: -1, currency: "RUB" }],
    ["fractional payout minimum", { amountMinor: 1.5, currency: "RUB" }],
    ["unsafe payout minimum", { amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "RUB" }],
    ["unsupported payout currency", { amountMinor: 1, currency: "USD" }],
    ["unknown payout field", { amountMinor: 1, currency: "RUB", feeBps: 100 }]
  ])("rejects invalid payout minimum: %s", (_caseName, payoutMinimum) => {
    expect(() => createRiskPolicySnapshot({ ...validRiskPolicyInput(), payoutMinimum })).toThrow(
      RiskPolicySnapshotValidationError
    );
  });

  it.each([
    ["empty authority id", { id: "", version: 1 }],
    ["unbounded authority id", { id: "a".repeat(201), version: 1 }],
    ["unversioned authority", { id: "authority" }],
    ["zero authority version", { id: "authority", version: 0 }],
    ["fractional authority version", { id: "authority", version: 1.5 }],
    ["unknown authority field", { id: "authority", version: 1, role: "admin" }]
  ])("rejects invalid exception authority: %s", (_caseName, exceptionAuthority) => {
    expect(() =>
      createRiskPolicySnapshot({ ...validRiskPolicyInput(), exceptionAuthority })
    ).toThrow(RiskPolicySnapshotValidationError);
  });
});
