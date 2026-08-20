import type { OnlineSaleCapturePersistenceCommand } from "../online-sale-capture-command";
import type { OnlineSaleCaptureReceipt } from "../online-sale-capture-receipt";
import type { ApplyCanonicalClientOrderCaptureCommand } from "./client-order-canonical-capture-uow";
import type {
  ApplyVerifiedProviderCanonicalSemanticFactCommand,
  ApplyVerifiedWebhookSemanticFactCommand,
  WebhookSemanticCommitReceipt
} from "./webhook-inbox-persistence-port";

/** The semantic receipt is canonical in both the first application and a durable inbox replay. */
export type CanonicalOnlineSaleCaptureSemanticCommitReceipt = Readonly<
  WebhookSemanticCommitReceipt & {
    kind: "webhook_semantic_commit_receipt";
    semanticSourceKind: "payment_transition";
    purpose: "client_order";
    economicPaymentSessionId: string;
    providerPaymentId: string;
    amountMinor: string;
    currency: "RUB";
    businessEffect: "applied_once" | "semantic_replay";
  }
>;

/**
 * The bounded online-sale capture is intentionally distinct from the legacy v1 wallet command.
 * A worker can supply only canonical semantic evidence plus locked checkout correlation. The
 * server-side resolver derives the v2 receipt, journal and wallet commitment from persisted
 * order economics while retaining the caller-owned transaction.
 */
export type OnlineSaleCaptureResolution = Readonly<{
  semanticCapture: CanonicalOnlineSaleCaptureSemanticCommitReceipt;
  capture: Omit<ApplyCanonicalClientOrderCaptureCommand, "semanticCapture" | "financialMutation">;
}>;

/**
 * This generic makes the transaction ownership explicit without coupling `packages/domain` to a
 * database driver. Implementations must receive the outer transaction; opening another one would
 * break the semantic-fact, wallet-lock and revision-CAS atomic boundary.
 */
export type OnlineSaleCapturePersistenceResolver<Transaction> = Readonly<{
  resolveOnlineSaleCapturePersistence(
    transaction: Transaction,
    resolution: OnlineSaleCaptureResolution
  ): Promise<OnlineSaleCapturePersistenceCommand>;
}>;

/**
 * The HPP worker's only durable input. It deliberately has no `financialMutation` field, so a
 * v1 sealed wallet journal command cannot cross the worker/domain boundary.
 */
export type ApplyCanonicalOnlineSaleCaptureCommand = Readonly<{
  semanticFact:
    | ApplyVerifiedWebhookSemanticFactCommand
    | ApplyVerifiedProviderCanonicalSemanticFactCommand;
  capture: OnlineSaleCaptureResolution["capture"];
}>;

/**
 * A replay rehydrates the same database-owned v2 receipt. Adapters must not return an internal
 * row shape as financial authority to worker code.
 */
export type CanonicalOnlineSaleCaptureCommitReceipt = Readonly<{
  kind: "canonical_online_sale_capture_commit_receipt";
  effect: "applied_once" | "semantic_replay";
  semanticCommitReceipt: CanonicalOnlineSaleCaptureSemanticCommitReceipt;
  captureReceipt: OnlineSaleCaptureReceipt;
}>;

/**
 * One durable boundary: inbox checkpoint/semantic fact and v2 online sale capture commit
 * together. Provider I/O and artifact sealing have already completed before this call.
 */
export type OnlineSaleCaptureCanonicalCaptureUnitOfWork = Readonly<{
  applyCanonicalOnlineSaleCapture(
    command: ApplyCanonicalOnlineSaleCaptureCommand
  ): Promise<CanonicalOnlineSaleCaptureCommitReceipt>;
}>;
