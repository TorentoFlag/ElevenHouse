import { describe, expect, it, vi } from "vitest";
import {
  acquireArcPayRateBudget,
  createArcPayRateBudgetConfig,
  createArcPayRateBudgetKey,
  FinanceArcPayRateBudgetIntegrityError,
  serializeArcPayRateBudgetKey,
  type ArcPayRateBudgetPort
} from "./arc-pay-rate-budget";

const now = "2026-08-03T10:00:00.000Z";

describe("ArcPay distributed rate budget boundary", () => {
  it("shares a budget by merchant tenant and environment, not terminal", () => {
    const first = createArcPayRateBudgetKey({
      merchantTenantId: "tenant-1",
      environment: "sandbox"
    });
    const sameTenant = createArcPayRateBudgetKey({
      merchantTenantId: "tenant-1",
      environment: "sandbox"
    });
    const live = createArcPayRateBudgetKey({
      merchantTenantId: "tenant-1",
      environment: "live"
    });

    expect(serializeArcPayRateBudgetKey(first)).toBe(serializeArcPayRateBudgetKey(sameTenant));
    expect(serializeArcPayRateBudgetKey(first)).not.toBe(serializeArcPayRateBudgetKey(live));
    expect(first).toEqual({ merchantTenantId: "tenant-1", environment: "sandbox" });
  });

  it("requires the explicit current ArcPay 10 RPS and burst 20 config", () => {
    expect(createArcPayRateBudgetConfig({ requestsPerSecond: 10, burst: 20 })).toEqual({
      requestsPerSecond: 10,
      burst: 20
    });
    expect(() => createArcPayRateBudgetConfig({ requestsPerSecond: 9, burst: 20 })).toThrow(
      FinanceArcPayRateBudgetIntegrityError
    );
    expect(() => createArcPayRateBudgetConfig({ requestsPerSecond: 10, burst: 19 })).toThrow(
      FinanceArcPayRateBudgetIntegrityError
    );
  });

  it("honors normalized provider Retry-After without consuming distributed budget", async () => {
    const take = vi.fn();
    const port: ArcPayRateBudgetPort = { take };

    await expect(
      acquireArcPayRateBudget({
        port,
        key: createArcPayRateBudgetKey({
          merchantTenantId: "tenant-1",
          environment: "live"
        }),
        config: createArcPayRateBudgetConfig({ requestsPerSecond: 10, burst: 20 }),
        now,
        providerRetryAfterAt: "2026-08-03T10:00:05.000Z"
      })
    ).resolves.toEqual({
      kind: "retry_at",
      retryAt: "2026-08-03T10:00:05.000Z",
      reason: "provider_retry_after"
    });
    expect(take).not.toHaveBeenCalled();
  });

  it("delegates one token to the distributed port and validates its decision", async () => {
    const take = vi.fn().mockResolvedValue({ kind: "granted" });
    const port: ArcPayRateBudgetPort = { take };
    const key = createArcPayRateBudgetKey({
      merchantTenantId: "tenant-1",
      environment: "sandbox"
    });
    const config = createArcPayRateBudgetConfig({ requestsPerSecond: 10, burst: 20 });

    await expect(
      acquireArcPayRateBudget({ port, key, config, now, providerRetryAfterAt: null })
    ).resolves.toEqual({ kind: "granted" });
    expect(take).toHaveBeenCalledWith({ key, config, cost: 1, requestedAt: now });
  });

  it("preserves a future distributed retry decision", async () => {
    const port: ArcPayRateBudgetPort = {
      take: vi.fn().mockResolvedValue({
        kind: "retry_at",
        retryAt: "2026-08-03T10:00:03.000Z",
        reason: "distributed_budget"
      })
    };

    await expect(
      acquireArcPayRateBudget({
        port,
        key: createArcPayRateBudgetKey({
          merchantTenantId: "tenant-1",
          environment: "sandbox"
        }),
        config: createArcPayRateBudgetConfig({ requestsPerSecond: 10, burst: 20 }),
        now,
        providerRetryAfterAt: null
      })
    ).resolves.toEqual({
      kind: "retry_at",
      retryAt: "2026-08-03T10:00:03.000Z",
      reason: "distributed_budget"
    });
  });

  it("rejects malformed or non-future port decisions", async () => {
    const port: ArcPayRateBudgetPort = {
      take: vi.fn().mockResolvedValue({
        kind: "retry_at",
        retryAt: now,
        reason: "distributed_budget"
      })
    };
    await expect(
      acquireArcPayRateBudget({
        port,
        key: createArcPayRateBudgetKey({
          merchantTenantId: "tenant-1",
          environment: "sandbox"
        }),
        config: createArcPayRateBudgetConfig({ requestsPerSecond: 10, burst: 20 }),
        now,
        providerRetryAfterAt: null
      })
    ).rejects.toBeInstanceOf(FinanceArcPayRateBudgetIntegrityError);
  });

  it("rejects accessor-backed keys and configs without invoking their getters", () => {
    let getterCalls = 0;
    const key = { merchantTenantId: "tenant-1", environment: "live" } as Record<string, unknown>;
    Object.defineProperty(key, "merchantTenantId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    const config = { requestsPerSecond: 10, burst: 20 } as Record<string, unknown>;
    Object.defineProperty(config, "burst", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });

    expect(() => createArcPayRateBudgetKey(key)).toThrow(FinanceArcPayRateBudgetIntegrityError);
    expect(() => createArcPayRateBudgetConfig(config)).toThrow(
      FinanceArcPayRateBudgetIntegrityError
    );
    expect(getterCalls).toBe(0);
  });

  it("rejects an accessor-backed distributed decision without invoking it", async () => {
    let getterCalls = 0;
    const decision = { kind: "granted" } as Record<string, unknown>;
    Object.defineProperty(decision, "kind", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    const port: ArcPayRateBudgetPort = {
      take: vi.fn().mockResolvedValue(decision)
    };

    await expect(
      acquireArcPayRateBudget({
        port,
        key: createArcPayRateBudgetKey({
          merchantTenantId: "tenant-1",
          environment: "sandbox"
        }),
        config: createArcPayRateBudgetConfig({ requestsPerSecond: 10, burst: 20 }),
        now,
        providerRetryAfterAt: null
      })
    ).rejects.toBeInstanceOf(FinanceArcPayRateBudgetIntegrityError);
    expect(getterCalls).toBe(0);
  });

  it("rejects an accessor-backed acquisition envelope without reading it", async () => {
    let getterCalls = 0;
    const input = {
      port: { take: vi.fn().mockResolvedValue({ kind: "granted" }) },
      key: createArcPayRateBudgetKey({
        merchantTenantId: "tenant-1",
        environment: "sandbox"
      }),
      config: createArcPayRateBudgetConfig({ requestsPerSecond: 10, burst: 20 }),
      now,
      providerRetryAfterAt: null
    } as Record<string, unknown>;
    Object.defineProperty(input, "now", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });

    await expect(acquireArcPayRateBudget(input as never)).rejects.toBeInstanceOf(
      FinanceArcPayRateBudgetIntegrityError
    );
    expect(getterCalls).toBe(0);
  });

  it("projects Proxy descriptor values without invoking get traps", async () => {
    let getCalls = 0;
    const key = new Proxy(
      { merchantTenantId: "tenant-1", environment: "sandbox" as const },
      {
        get() {
          getCalls += 1;
          throw new Error("must not execute");
        }
      }
    );
    const decision = new Proxy(
      { kind: "granted" as const },
      {
        get(_target, property) {
          if (property === "then") return undefined;
          getCalls += 1;
          throw new Error("must not execute");
        }
      }
    );
    const port: ArcPayRateBudgetPort = { take: vi.fn().mockResolvedValue(decision) };

    expect(createArcPayRateBudgetKey(key)).toEqual({
      merchantTenantId: "tenant-1",
      environment: "sandbox"
    });
    await expect(
      acquireArcPayRateBudget({
        port,
        key,
        config: createArcPayRateBudgetConfig({ requestsPerSecond: 10, burst: 20 }),
        now,
        providerRetryAfterAt: null
      })
    ).resolves.toEqual({ kind: "granted" });
    expect(getCalls).toBe(0);
  });
});
