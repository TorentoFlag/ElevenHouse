import { describe, expect, it } from "vitest";
import {
  beginSettlementCursorWindow,
  checkpointSettlementCursorPage,
  claimSettlementCursorLease,
  createSettlementCursor,
  createSettlementCursorKey,
  FinanceSettlementCursorIntegrityError,
  planSettlementCursorPageFetch,
  serializeSettlementPageCheckpointKey,
  serializeSettlementCursorKey
} from "./settlement-cursor";

const initialBackfillStart = "2026-07-01T00:00:00.000Z";
const databaseNow = "2026-08-03T10:00:00.000Z";
const providerAccount = Object.freeze({
  seriesId: "arc-series-primary",
  providerAccountId: "arc-account-v3",
  identityVersion: 3
});
const leaseCredential = Object.freeze({
  leaseOwnerId: "settlement-worker-a",
  leaseToken: "lease-token-a",
  fencingToken: 1
});

describe("finance settlement cursor", () => {
  it("binds the cursor key to the exact provider identity series", () => {
    const key = createSettlementCursorKey({
      providerAccount,
      stream: "settlement_ledger"
    });
    const cursor = createSettlementCursor({
      key,
      initialBackfillStart,
      overlapSeconds: 300,
      databaseNow
    });

    expect(cursor).toEqual({
      key,
      serializedKey: '["arc-series-primary","arc-account-v3",3,"settlement_ledger"]',
      initialBackfillStart: "2026-07-01T00:00:00Z",
      overlapSeconds: 300,
      highWaterMark: "2026-07-01T00:00:00Z",
      activeWindow: null,
      lease: null,
      fencingToken: 0,
      windowGeneration: 0,
      version: 1,
      updatedAt: "2026-08-03T10:00:00Z"
    });
    expect(serializeSettlementCursorKey(key)).toBe(
      '["arc-series-primary","arc-account-v3",3,"settlement_ledger"]'
    );
    expect(Object.isFrozen(cursor)).toBe(true);
  });

  it("plans provider fetch outside mutation and checkpoints every page restart-safely", () => {
    const claimed = claimedCursor();
    const window = beginSettlementCursorWindow({
      current: claimed,
      expectedVersion: 2,
      ...leaseCredential,
      windowEnd: "2026-07-02T00:00:00.000Z",
      maxPageCount: 3,
      databaseNow: "2026-08-03T10:01:00.000Z"
    });
    const plan = planSettlementCursorPageFetch({
      current: window,
      expectedVersion: 3,
      ...leaseCredential,
      databaseNow: "2026-08-03T10:02:00.000Z"
    });

    expect(plan).toEqual({
      cursorKey: window.key,
      expectedCursorVersion: 3,
      fencingToken: 1,
      checkpointKey: {
        cursorKey: window.key,
        windowGeneration: 1,
        providerPageCursor: null
      },
      windowStart: "2026-07-01T00:00:00Z",
      windowEnd: "2026-07-02T00:00:00Z",
      pageCursor: null
    });
    expect(serializeSettlementPageCheckpointKey(plan.checkpointKey)).toBe(
      '["arc-series-primary","arc-account-v3",3,"settlement_ledger",1,null]'
    );
    expect(window.version).toBe(3);

    const nextPage = checkpointSettlementCursorPage({
      current: window,
      expectedVersion: plan.expectedCursorVersion,
      ...leaseCredential,
      pageCursorUsed: plan.pageCursor,
      nextPageCursor: "page-2",
      databaseNow: "2026-08-03T10:02:01.000Z"
    });
    expect(nextPage.highWaterMark).toBe("2026-07-01T00:00:00Z");
    expect(nextPage.activeWindow).toMatchObject({
      nextPageCursor: "page-2",
      checkpointedPageCount: 1,
      maxPageCount: 3
    });

    const complete = checkpointSettlementCursorPage({
      current: nextPage,
      expectedVersion: 4,
      ...leaseCredential,
      pageCursorUsed: "page-2",
      nextPageCursor: null,
      databaseNow: "2026-08-03T10:03:00.000Z"
    });
    expect(complete.highWaterMark).toBe("2026-07-02T00:00:00Z");
    expect(complete.activeWindow).toBeNull();
    expect(complete.version).toBe(5);
  });

  it("keeps pagination history bounded by a persisted page budget", () => {
    const active = beginSettlementCursorWindow({
      current: claimedCursor(),
      expectedVersion: 2,
      ...leaseCredential,
      windowEnd: "2026-07-02T00:00:00.000Z",
      maxPageCount: 1,
      databaseNow: "2026-08-03T10:01:00.000Z"
    });

    expect(() =>
      checkpointSettlementCursorPage({
        current: active,
        expectedVersion: 3,
        ...leaseCredential,
        pageCursorUsed: null,
        nextPageCursor: "provider-has-more-pages",
        databaseNow: "2026-08-03T10:02:00.000Z"
      })
    ).toThrow(FinanceSettlementCursorIntegrityError);
    expect(active.activeWindow).not.toHaveProperty("seenPageCursors");
  });

  it("applies overlap without crossing the initial backfill boundary", () => {
    const first = beginSettlementCursorWindow({
      current: claimedCursor(),
      expectedVersion: 2,
      ...leaseCredential,
      windowEnd: "2026-07-02T00:00:00.000Z",
      maxPageCount: 2,
      databaseNow: "2026-08-03T10:01:00.000Z"
    });
    const completed = checkpointSettlementCursorPage({
      current: first,
      expectedVersion: 3,
      ...leaseCredential,
      pageCursorUsed: null,
      nextPageCursor: null,
      databaseNow: "2026-08-03T10:02:00.000Z"
    });
    const second = beginSettlementCursorWindow({
      current: completed,
      expectedVersion: 4,
      ...leaseCredential,
      windowEnd: "2026-07-03T00:00:00.000Z",
      maxPageCount: 2,
      databaseNow: "2026-08-03T10:03:00.000Z"
    });

    expect(second.activeWindow?.startAt).toBe("2026-07-01T23:55:00Z");
    expect(second.windowGeneration).toBe(2);
  });

  it("fails closed on stale versions, identity drift, and accessor-backed input", () => {
    const claimed = claimedCursor();
    expect(() =>
      beginSettlementCursorWindow({
        current: claimed,
        expectedVersion: 1,
        ...leaseCredential,
        windowEnd: "2026-07-02T00:00:00.000Z",
        maxPageCount: 2,
        databaseNow: "2026-08-03T10:01:00.000Z"
      })
    ).toThrow(FinanceSettlementCursorIntegrityError);
    expect(() =>
      beginSettlementCursorWindow({
        current: {
          ...claimed,
          key: {
            ...claimed.key,
            providerAccount: { ...providerAccount, identityVersion: 2 }
          }
        },
        expectedVersion: 2,
        ...leaseCredential,
        windowEnd: "2026-07-02T00:00:00.000Z",
        maxPageCount: 2,
        databaseNow: "2026-08-03T10:01:00.000Z"
      })
    ).toThrow(FinanceSettlementCursorIntegrityError);

    let getterCalls = 0;
    const input = validCreateInput() as Record<string, unknown>;
    Object.defineProperty(input, "key", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    expect(() => createSettlementCursor(input as never)).toThrow(
      FinanceSettlementCursorIntegrityError
    );
    expect(getterCalls).toBe(0);
  });
});

function validCreateInput() {
  return {
    key: createSettlementCursorKey({ providerAccount, stream: "settlement_ledger" }),
    initialBackfillStart,
    overlapSeconds: 300,
    databaseNow
  } as const;
}

function claimedCursor() {
  return claimSettlementCursorLease({
    current: createSettlementCursor(validCreateInput()),
    expectedVersion: 1,
    leaseOwnerId: leaseCredential.leaseOwnerId,
    leaseToken: leaseCredential.leaseToken,
    leaseExpiresAt: "2026-08-03T11:00:00.000Z",
    databaseNow
  });
}
