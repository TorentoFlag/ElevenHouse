import { describe, expect, it } from "vitest";
import {
  beginSettlementCursorWindow,
  checkpointSettlementCursorPage,
  claimSettlementCursorLease,
  createSettlementCursor,
  createSettlementCursorKey,
  expireSettlementCursorLease,
  FinanceSettlementCursorIntegrityError,
  planSettlementCursorPageFetch,
  releaseSettlementCursorLease,
  renewSettlementCursorLease
} from "./settlement-cursor";

const providerAccount = Object.freeze({
  seriesId: "arc-series-primary",
  providerAccountId: "arc-account-v3",
  identityVersion: 3
});
const workerA = Object.freeze({
  leaseOwnerId: "settlement-worker-a",
  leaseToken: "lease-token-a",
  fencingToken: 1
});

describe("settlement cursor multi-replica lease", () => {
  it("claims, renews, releases, and increments the durable fencing token", () => {
    const claimed = claimA();
    expect(claimed).toMatchObject({
      fencingToken: 1,
      version: 2,
      lease: {
        ownerId: workerA.leaseOwnerId,
        token: workerA.leaseToken,
        fencingToken: 1,
        claimedAt: "2026-08-03T10:00:00Z",
        expiresAt: "2026-08-03T10:10:00Z"
      }
    });

    const renewed = renewSettlementCursorLease({
      current: claimed,
      expectedVersion: 2,
      ...workerA,
      leaseExpiresAt: "2026-08-03T10:20:00.000Z",
      databaseNow: "2026-08-03T10:05:00.000Z"
    });
    expect(renewed).toMatchObject({ version: 3, fencingToken: 1 });
    expect(renewed.lease?.expiresAt).toBe("2026-08-03T10:20:00Z");

    const released = releaseSettlementCursorLease({
      current: renewed,
      expectedVersion: 3,
      ...workerA,
      databaseNow: "2026-08-03T10:06:00.000Z"
    });
    expect(released).toMatchObject({ lease: null, fencingToken: 1, version: 4 });

    const claimedByB = claimSettlementCursorLease({
      current: released,
      expectedVersion: 4,
      leaseOwnerId: "settlement-worker-b",
      leaseToken: "lease-token-b",
      leaseExpiresAt: "2026-08-03T10:30:00.000Z",
      databaseNow: "2026-08-03T10:07:00.000Z"
    });
    expect(claimedByB.lease?.fencingToken).toBe(2);
    expect(claimedByB.fencingToken).toBe(2);
  });

  it("expires through an exact CAS decision and fences the stale fetch result", () => {
    const active = beginSettlementCursorWindow({
      current: claimA(),
      expectedVersion: 2,
      ...workerA,
      windowEnd: "2026-07-02T00:00:00.000Z",
      maxPageCount: 10,
      databaseNow: "2026-08-03T10:01:00.000Z"
    });
    const staleFetchPlan = planSettlementCursorPageFetch({
      current: active,
      expectedVersion: 3,
      ...workerA,
      databaseNow: "2026-08-03T10:02:00.000Z"
    });
    const expired = expireSettlementCursorLease({
      current: active,
      expectedVersion: 3,
      ...workerA,
      databaseNow: "2026-08-03T10:10:00.000Z"
    });
    const reclaimed = claimSettlementCursorLease({
      current: expired,
      expectedVersion: 4,
      leaseOwnerId: "settlement-worker-b",
      leaseToken: "lease-token-b",
      leaseExpiresAt: "2026-08-03T10:30:00.000Z",
      databaseNow: "2026-08-03T10:10:01.000Z"
    });

    expect(() =>
      checkpointSettlementCursorPage({
        current: reclaimed,
        expectedVersion: 5,
        ...workerA,
        pageCursorUsed: staleFetchPlan.pageCursor,
        nextPageCursor: null,
        databaseNow: "2026-08-03T10:10:02.000Z"
      })
    ).toThrow(FinanceSettlementCursorIntegrityError);

    const completed = checkpointSettlementCursorPage({
      current: reclaimed,
      expectedVersion: 5,
      leaseOwnerId: "settlement-worker-b",
      leaseToken: "lease-token-b",
      fencingToken: 2,
      pageCursorUsed: null,
      nextPageCursor: null,
      databaseNow: "2026-08-03T10:10:02.000Z"
    });
    expect(completed.highWaterMark).toBe("2026-07-02T00:00:00Z");
  });

  it.each([
    ["owner", { leaseOwnerId: "settlement-worker-other" }],
    ["token", { leaseToken: "lease-token-other" }],
    ["fence", { fencingToken: 2 }]
  ])("rejects a stale %s before page planning", (_label, credentialPatch) => {
    const active = beginSettlementCursorWindow({
      current: claimA(),
      expectedVersion: 2,
      ...workerA,
      windowEnd: "2026-07-02T00:00:00.000Z",
      maxPageCount: 10,
      databaseNow: "2026-08-03T10:01:00.000Z"
    });
    expect(() =>
      planSettlementCursorPageFetch({
        current: active,
        expectedVersion: 3,
        ...workerA,
        ...credentialPatch,
        databaseNow: "2026-08-03T10:02:00.000Z"
      })
    ).toThrow(FinanceSettlementCursorIntegrityError);
  });

  it("does not steal or renew a live lease and uses only DB-clock expiry", () => {
    const claimed = claimA();
    expect(() =>
      claimSettlementCursorLease({
        current: claimed,
        expectedVersion: 2,
        leaseOwnerId: "settlement-worker-b",
        leaseToken: "lease-token-b",
        leaseExpiresAt: "2026-08-03T10:30:00.000Z",
        databaseNow: "2026-08-03T10:01:00.000Z"
      })
    ).toThrow(FinanceSettlementCursorIntegrityError);
    expect(() =>
      expireSettlementCursorLease({
        current: claimed,
        expectedVersion: 2,
        ...workerA,
        databaseNow: "2026-08-03T10:09:59.999Z"
      })
    ).toThrow(FinanceSettlementCursorIntegrityError);
    expect(() =>
      renewSettlementCursorLease({
        current: claimed,
        expectedVersion: 2,
        ...workerA,
        leaseExpiresAt: "2026-08-03T10:20:00.000Z",
        databaseNow: "2026-08-03T10:10:00.000Z"
      })
    ).toThrow(FinanceSettlementCursorIntegrityError);
  });
});

function initialCursor() {
  return createSettlementCursor({
    key: createSettlementCursorKey({ providerAccount, stream: "settlement_ledger" }),
    initialBackfillStart: "2026-07-01T00:00:00.000Z",
    overlapSeconds: 300,
    databaseNow: "2026-08-03T10:00:00.000Z"
  });
}

function claimA() {
  return claimSettlementCursorLease({
    current: initialCursor(),
    expectedVersion: 1,
    leaseOwnerId: workerA.leaseOwnerId,
    leaseToken: workerA.leaseToken,
    leaseExpiresAt: "2026-08-03T10:10:00.000Z",
    databaseNow: "2026-08-03T10:00:00.000Z"
  });
}
