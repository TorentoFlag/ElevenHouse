import type {
  ActiveProviderAccountReaderPort,
  FinanceProviderAccountIdentity,
  RawProviderArtifactRef
} from "@elevenhouse/domain/finance-core";

import type { ArcPaySettlementBalanceClient } from "../arc-pay/arc-pay-settlement-balance-client";
import type { SettlementBalanceEvidenceSealer } from "./settlement-balance-evidence-sealer";

export type SettlementBalanceObservationProcessor = Readonly<{
  tick(): Promise<SettlementBalanceObservation>;
}>;

export type SettlementBalanceObservation =
  | Readonly<{ kind: "not_configured" }>
  | Readonly<{
      kind: "observed";
      providerAccount: FinanceProviderAccountIdentity;
      observedAt: string;
      balances: Awaited<ReturnType<ArcPaySettlementBalanceClient["readSettlementBalance"]>>["balances"];
      rawArtifact: RawProviderArtifactRef;
      rawDigest: `sha256:${string}`;
      rawByteLength: number;
    }>;

/**
 * Reads ArcPay's current merchant position for operations logs. It deliberately
 * makes no journal, wallet, or reconciliation mutation, and seals the exact
 * response before exposing its parsed values to observability.
 */
export function createSettlementBalanceObservationProcessor(input: Readonly<{
  client: ArcPaySettlementBalanceClient;
  providerAccounts: ActiveProviderAccountReaderPort;
  evidence: SettlementBalanceEvidenceSealer;
  now?: () => Date;
}>): SettlementBalanceObservationProcessor {
  return Object.freeze({
    async tick() {
      const providerAccount = await input.providerAccounts.findActiveProviderAccount({
        provider: "arc_pay"
      });
      if (!providerAccount) return Object.freeze({ kind: "not_configured" as const });
      const response = await input.client.readSettlementBalance();
      const rawArtifact = await input.evidence.seal({
        providerAccount,
        rawBody: response.rawBody,
        rawDigest: response.rawDigest,
        rawByteLength: response.rawByteLength
      });
      return Object.freeze({
        kind: "observed" as const,
        providerAccount,
        observedAt: (input.now ?? (() => new Date()))().toISOString(),
        balances: response.balances,
        rawArtifact,
        rawDigest: response.rawDigest,
        rawByteLength: response.rawByteLength
      });
    }
  });
}

export function startSettlementBalanceObservationInterval(input: Readonly<{
  processor: SettlementBalanceObservationProcessor;
  intervalMs: number;
  onResult?(result: SettlementBalanceObservation): void;
  onError(error: unknown): void;
}>): () => void {
  if (input.intervalMs <= 0) return () => undefined;
  const run = async () => {
    try {
      input.onResult?.(await input.processor.tick());
    } catch (error) {
      input.onError(error);
    }
  };
  const timer = setInterval(() => void run(), input.intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
