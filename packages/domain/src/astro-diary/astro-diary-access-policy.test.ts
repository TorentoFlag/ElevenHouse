import { describe, expect, it } from "vitest";
import { authorizeAstroDiaryOperation } from "./astro-diary-access-policy";

const base = {
  relationshipState: "active",
  entitlementState: "active",
  financeDenied: false,
  journalState: "active",
  hasOpenCycle: false,
  hasOpenResponseObligation: false
} as const;

describe("authorizeAstroDiaryOperation", () => {
  it("allows new cycles only under active paid access", () => {
    expect(authorizeAstroDiaryOperation(base, "start_cycle")).toEqual({ outcome: "allowed" });
    expect(
      authorizeAstroDiaryOperation({ ...base, entitlementState: "ended" }, "start_cycle")
    ).toEqual({ outcome: "denied", code: "paid_access_ended" });
  });

  it("allows bounded continuation after normal period end", () => {
    const ended = {
      ...base,
      entitlementState: "ended",
      hasOpenCycle: true,
      hasOpenResponseObligation: true
    } as const;
    expect(authorizeAstroDiaryOperation(ended, "continue_open_cycle")).toEqual({
      outcome: "allowed"
    });
    expect(authorizeAstroDiaryOperation(ended, "respond_to_obligation")).toEqual({
      outcome: "allowed"
    });
    expect(authorizeAstroDiaryOperation(ended, "edit")).toEqual({
      outcome: "denied",
      code: "paid_access_ended"
    });
    expect(authorizeAstroDiaryOperation(base, "edit")).toEqual({ outcome: "allowed" });
  });

  it("denies every write after relationship block, finance denial, or erasure start", () => {
    for (const authority of [
      { ...base, relationshipState: "blocked" as const },
      { ...base, entitlementState: "revoked" as const },
      { ...base, financeDenied: true },
      { ...base, journalState: "erasing" as const }
    ]) {
      expect(authorizeAstroDiaryOperation(authority, "continue_open_cycle")).toMatchObject({
        outcome: "denied"
      });
    }
  });

  it("keeps ended and finance-revoked history readable unless relationship policy denies it", () => {
    expect(authorizeAstroDiaryOperation({ ...base, entitlementState: "ended" }, "read")).toEqual({
      outcome: "allowed"
    });
    expect(authorizeAstroDiaryOperation({ ...base, entitlementState: "revoked" }, "read")).toEqual({
      outcome: "allowed"
    });
    expect(authorizeAstroDiaryOperation({ ...base, relationshipState: "blocked" }, "read")).toEqual(
      { outcome: "denied", code: "relationship_denied" }
    );
  });

  it("keeps an owner deletion request available after access or relationship termination", () => {
    for (const authority of [
      { ...base, relationshipState: "blocked" as const },
      { ...base, entitlementState: "ended" as const },
      { ...base, entitlementState: "revoked" as const, financeDenied: true },
      { ...base, journalState: "erasing" as const }
    ]) {
      expect(authorizeAstroDiaryOperation(authority, "erase")).toEqual({ outcome: "allowed" });
    }
  });
});
