import type {
  ApplyCanonicalClientOrderCaptureCommand,
  CanonicalClientOrderCaptureCommitReceipt,
  VerifiedClientOrderCaptureSemanticCommitReceipt
} from "./client-order-canonical-capture-uow";
import type { ApplyVerifiedWebhookSemanticFactCommand } from "./webhook-inbox-persistence-port";

export type ClientOrderCanonicalCaptureMutationResolution = Readonly<{
  semanticCapture: VerifiedClientOrderCaptureSemanticCommitReceipt;
  capture: Omit<ApplyCanonicalClientOrderCaptureCommand, "semanticCapture" | "financialMutation">;
}>;

/**
 * Server-owned resolver for client-sale postings. It must derive its mutation from the persisted
 * checkout authorization and order-economics snapshot, never from a provider webhook payload.
 */
export type ClientOrderCanonicalCaptureMutationResolver = Readonly<{
  resolveClientOrderCanonicalCaptureMutation(
    input: ClientOrderCanonicalCaptureMutationResolution
  ): Promise<ApplyCanonicalClientOrderCaptureCommand["financialMutation"]>;
}>;

/**
 * One durable boundary for a canonical HPP captured payment. The receipt becomes visible only if
 * its consuming client-order capture commits in the same database transaction.
 */
export type ApplyCanonicalClientOrderWebhookCaptureCommand = Readonly<{
  semanticFact: ApplyVerifiedWebhookSemanticFactCommand;
  capture: Omit<ApplyCanonicalClientOrderCaptureCommand, "semanticCapture" | "financialMutation">;
}>;

export type CanonicalClientOrderWebhookCaptureCommitReceipt = Readonly<{
  kind: "canonical_client_order_webhook_capture_commit_receipt";
  semanticCommitReceipt: VerifiedClientOrderCaptureSemanticCommitReceipt;
  captureCommitReceipt: CanonicalClientOrderCaptureCommitReceipt;
}>;

export type CanonicalClientOrderWebhookCaptureUnitOfWork = Readonly<{
  applyCanonicalClientOrderWebhookCapture(
    command: ApplyCanonicalClientOrderWebhookCaptureCommand
  ): Promise<CanonicalClientOrderWebhookCaptureCommitReceipt>;
}>;
