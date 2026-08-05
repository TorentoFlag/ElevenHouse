import { createHash, randomUUID } from "node:crypto";

import type { FinanceOrderStore } from "../orders/order-store";
import { createClientRefundCandidate, type RefundCandidate } from "./refund-candidate";
import type { RefundCandidateStore } from "./refund-candidate-store";

const submitRefundCandidateScopePrefix = "refund-candidates.submit";
const submitRefundCandidateIdempotencyTtlMs = 24 * 60 * 60 * 1_000;

export type SubmitClientRefundCandidateInput = {
  readonly orderStore: Pick<FinanceOrderStore, "findById">;
  readonly candidateStore: Pick<RefundCandidateStore, "executeSubmitCandidate">;
  readonly clientUserId: string;
  readonly orderId: string;
  readonly statement: string;
  readonly idempotencyKey: string;
  readonly now: Date;
  readonly idGenerator?: () => string;
};

/** A missing and a foreign order intentionally produce the same public-safe failure. */
export class RefundCandidateOrderUnavailableError extends Error {
  readonly code = "refund_candidate_order_unavailable";

  constructor() {
    super("Order is not available for a refund candidate");
    this.name = "RefundCandidateOrderUnavailableError";
  }
}

/**
 * Submit a client statement for internal review. This does not authorize a refund, reserve
 * wallet funds, emit a provider request, or mutate the ledger.
 */
export async function submitClientRefundCandidate(
  input: SubmitClientRefundCandidateInput
): Promise<RefundCandidate> {
  const now = input.now.toISOString();
  const result = await input.candidateStore.executeSubmitCandidate(
    {
      scope: `${submitRefundCandidateScopePrefix}:${input.clientUserId}`,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.clientUserId,
      requestHash: hashSubmitRefundCandidateRequest(input),
      now,
      expiresAt: new Date(input.now.getTime() + submitRefundCandidateIdempotencyTtlMs).toISOString()
    },
    async () => {
      const order = await input.orderStore.findById(input.orderId);
      if (!order || order.clientUserId !== input.clientUserId) {
        throw new RefundCandidateOrderUnavailableError();
      }
      return createClientRefundCandidate({
        candidateId: (input.idGenerator ?? randomUUID)(),
        clientUserId: input.clientUserId,
        order,
        statement: input.statement,
        now
      });
    }
  );
  return result.value;
}

/** Read only the caller's candidate timeline after proving ownership of the parent order. */
export async function listClientRefundCandidates(input: {
  readonly orderStore: Pick<FinanceOrderStore, "findById">;
  readonly candidateStore: Pick<RefundCandidateStore, "listByOrderAndClient">;
  readonly clientUserId: string;
  readonly orderId: string;
}): Promise<readonly RefundCandidate[]> {
  const order = await input.orderStore.findById(input.orderId);
  if (!order || order.clientUserId !== input.clientUserId) {
    throw new RefundCandidateOrderUnavailableError();
  }
  return input.candidateStore.listByOrderAndClient({
    orderId: input.orderId,
    clientUserId: input.clientUserId
  });
}

function hashSubmitRefundCandidateRequest(
  input: SubmitClientRefundCandidateInput
): `sha256:${string}` {
  const payload = {
    clientUserId: input.clientUserId,
    orderId: input.orderId,
    statement: input.statement
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}
