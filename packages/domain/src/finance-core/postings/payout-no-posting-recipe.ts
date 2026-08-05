import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { createUnverifiedFinanceNoPostingRecipe } from "./posting-recipe";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type NoPostingRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "no_posting" }>;

export function createPayoutStateNoPostingRecipe(
  authorityId: string,
  version: number,
  sourceId: string,
  operation: "approved" | "bank_work_initiated",
  digest: FinanceAuthorizationPayloadHash,
  envelope: FinancePostingDecoderEnvelope
): NoPostingRecipe {
  return createUnverifiedFinanceNoPostingRecipe(
    {
      eventKey: { kind: "payout_state", sourceId, operation },
      reason: "payout_state_only",
      authorityRef: {
        kind:
          operation === "approved"
            ? "payout_approval_no_posting"
            : "payout_bank_work_initiated_no_posting",
        authorityId,
        version,
        canonicalDigest: digest
      },
      operationSnapshotRef: null
    },
    envelope
  );
}
