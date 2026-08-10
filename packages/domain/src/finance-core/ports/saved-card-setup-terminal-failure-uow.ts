import type { ApplyVerifiedProviderResultCommand } from "./provider-operation-result-application-uow";

export type SavedCardSetupTerminalFailureCommitReceipt = Readonly<{
  kind: "saved_card_setup_terminal_failure_commit_receipt";
  setupSessionId: string;
  providerOperationIntentId: string;
  committedAt: string;
}>;

/**
 * Records a provider-declared terminal refusal for a zero-value card setup. The refusal never
 * creates a reusable credential or a tariff invoice, but it must close the setup session so a
 * later card attempt can begin normally.
 */
export type SavedCardSetupTerminalFailureUnitOfWork = Readonly<{
  applyTerminalFailure(input: Readonly<{
    providerResult: ApplyVerifiedProviderResultCommand & Readonly<{
      evidence: ApplyVerifiedProviderResultCommand["evidence"] & Readonly<{
        outcome: "failed";
      }>;
    }>;
  }>): Promise<SavedCardSetupTerminalFailureCommitReceipt>;
}>;
