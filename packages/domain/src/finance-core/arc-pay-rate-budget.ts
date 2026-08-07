import { Temporal } from "@js-temporal/polyfill";

export type ArcPayRateBudgetKey = {
  readonly merchantTenantId: string;
};

export type ArcPayRateBudgetConfig = {
  readonly requestsPerSecond: 10;
  readonly burst: 20;
};

export type ArcPayRateBudgetDecision =
  | { readonly kind: "granted" }
  | {
      readonly kind: "retry_at";
      readonly retryAt: string;
      readonly reason: "provider_retry_after" | "distributed_budget";
    };

export type ArcPayRateBudgetPort = {
  readonly take: (input: {
    readonly key: ArcPayRateBudgetKey;
    readonly config: ArcPayRateBudgetConfig;
    readonly cost: 1;
    readonly requestedAt: string;
  }) => Promise<ArcPayRateBudgetDecision>;
};

export class FinanceArcPayRateBudgetIntegrityError extends Error {
  readonly code = "finance_arc_pay_rate_budget_integrity_error";

  constructor() {
    super("ArcPay rate budget input or decision violates the distributed boundary");
    this.name = "FinanceArcPayRateBudgetIntegrityError";
  }
}

export function createArcPayRateBudgetKey(input: unknown): ArcPayRateBudgetKey {
  const candidate = exactRecord(input, ["merchantTenantId"]);
  if (
    typeof candidate.merchantTenantId !== "string" ||
    candidate.merchantTenantId.trim() !== candidate.merchantTenantId ||
    candidate.merchantTenantId.length === 0 ||
    candidate.merchantTenantId.length > 200
  ) {
    throw new FinanceArcPayRateBudgetIntegrityError();
  }
  return Object.freeze({
    merchantTenantId: candidate.merchantTenantId
  });
}

export function serializeArcPayRateBudgetKey(key: ArcPayRateBudgetKey): string {
  const safe = createArcPayRateBudgetKey(key);
  return JSON.stringify([safe.merchantTenantId]);
}

export function createArcPayRateBudgetConfig(input: unknown): ArcPayRateBudgetConfig {
  const candidate = exactRecord(input, ["requestsPerSecond", "burst"]);
  if (candidate.requestsPerSecond !== 10 || candidate.burst !== 20) {
    throw new FinanceArcPayRateBudgetIntegrityError();
  }
  return Object.freeze({ requestsPerSecond: 10, burst: 20 });
}

export async function acquireArcPayRateBudget(input: {
  readonly port: ArcPayRateBudgetPort;
  readonly key: ArcPayRateBudgetKey;
  readonly config: ArcPayRateBudgetConfig;
  readonly now: string;
  readonly providerRetryAfterAt: string | null;
}): Promise<ArcPayRateBudgetDecision> {
  const candidate = exactRecord(input, ["port", "key", "config", "now", "providerRetryAfterAt"]);
  const port = rateBudgetPort(candidate.port);
  const key = createArcPayRateBudgetKey(candidate.key);
  const config = createArcPayRateBudgetConfig(candidate.config);
  const now = parseInstant(candidate.now);
  if (candidate.providerRetryAfterAt !== null) {
    const retryAfter = parseInstant(candidate.providerRetryAfterAt);
    if (Temporal.Instant.compare(retryAfter, now) > 0) {
      return Object.freeze({
        kind: "retry_at",
        retryAt: candidate.providerRetryAfterAt as string,
        reason: "provider_retry_after"
      });
    }
  }

  const decision = await port.take({
    key,
    config,
    cost: 1,
    requestedAt: candidate.now as string
  });
  const decisionCandidate = dataRecord(decision);
  if (decisionCandidate.kind === "granted") {
    assertExactDataKeys(decisionCandidate, ["kind"]);
    return Object.freeze({ kind: "granted" });
  }
  assertExactDataKeys(decisionCandidate, ["kind", "retryAt", "reason"]);
  if (
    decisionCandidate.kind !== "retry_at" ||
    decisionCandidate.reason !== "distributed_budget" ||
    typeof decisionCandidate.retryAt !== "string" ||
    Temporal.Instant.compare(parseInstant(decisionCandidate.retryAt), now) <= 0
  ) {
    throw new FinanceArcPayRateBudgetIntegrityError();
  }
  return Object.freeze({
    kind: "retry_at",
    retryAt: decisionCandidate.retryAt,
    reason: "distributed_budget"
  });
}

function rateBudgetPort(value: unknown): ArcPayRateBudgetPort {
  const candidate = exactRecord(value, ["take"]);
  if (typeof candidate.take !== "function") {
    throw new FinanceArcPayRateBudgetIntegrityError();
  }
  return Object.freeze({ take: candidate.take as ArcPayRateBudgetPort["take"] });
}

function parseInstant(value: unknown): Temporal.Instant {
  if (typeof value !== "string") throw new FinanceArcPayRateBudgetIntegrityError();
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw new FinanceArcPayRateBudgetIntegrityError();
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Record<Keys[number], unknown> {
  const candidate = dataRecord(value);
  assertExactDataKeys(candidate, expectedKeys);
  return candidate as Record<Keys[number], unknown>;
}

function dataRecord(value: unknown): Record<string, unknown> {
  try {
    if (!isPlainRecord(value)) throw new FinanceArcPayRateBudgetIntegrityError();
    const projected: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new FinanceArcPayRateBudgetIntegrityError();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
        throw new FinanceArcPayRateBudgetIntegrityError();
      }
      projected[key] = descriptor.value;
    }
    return Object.freeze(projected);
  } catch (error) {
    if (error instanceof FinanceArcPayRateBudgetIntegrityError) throw error;
    throw new FinanceArcPayRateBudgetIntegrityError();
  }
}

function assertExactDataKeys(value: object, expectedKeys: readonly string[]): void {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string") || keys.length !== expectedKeys.length) {
    throw new FinanceArcPayRateBudgetIntegrityError();
  }
  const expected = new Set(expectedKeys);
  if (!keys.every((key) => typeof key === "string" && expected.has(key))) {
    throw new FinanceArcPayRateBudgetIntegrityError();
  }
}
