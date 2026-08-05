import type { FinancePrivateObjectLocator } from "../finance-private-object-storage";
import type {
  RawProviderArtifactRef,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type { PersistedProviderDispatchReceipt } from "./provider-operation-intent-creation-uow";

/**
 * Worker-only authoritative reload of an ID-only provider-dispatch outbox message.
 * Queue payloads never contain an ArcPay request, token, receipt or merchant secret.
 */
export type ProviderOperationDispatchWorkItem = Readonly<{
  status: "pending_dispatch" | "provider_unknown";
  operationKind: "checkout_session_create" | "card_setup" | "card_setup_execute" | "card_setup_3ds_method_complete" | "saved_card_charge" | "saved_card_charge_3ds_method_complete" | "refund" | "void";
  dispatch: PersistedProviderDispatchReceipt;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
  dispatchArtifact: RawProviderArtifactRef;
  /** Opaque KMS reference only; plaintext card token and fingerprint remain in the vault. */
  transientSecret: Readonly<{
    secretRefId: string;
    sealedSecretRef: string;
    providerSetupId: string;
  }> | null;
  /**
   * Server-only authoritative reload for a card-on-file charge. It deliberately carries the
   * vault locator, never the raw provider token, card fingerprint or display data.
   */
  savedCardCredential: Readonly<{
    credentialId: string;
    credentialVersion: number;
    providerCustomerId: string;
    restrictedTokenHandleRef: string;
  }> | null;
  /** Reloaded coordinator state; it is not an outbox payload field. */
  savedCardSetup: Readonly<{
    setupSessionVersion: number;
    state: "execution_pending";
    providerSetupId: string;
  }> | null;
  /** Sealed evidence for the specific completed Method action, loaded only for its completion op. */
  threeDsMethodAction?: Readonly<{
    customerActionId: string;
    providerSetupId: string;
    /** Present only for a tariff-invoice Method continuation. */
    invoiceVersion?: number;
    responseArtifact: RawProviderArtifactRef;
    privateObject: FinancePrivateObjectLocator;
    artifactAccessAuditEventId: string;
  }>;
  privateObject: FinancePrivateObjectLocator;
  artifactAccessAuditEventId: string;
}>;

export type ProviderOperationDispatchReaderPort = Readonly<{
  readDispatchWorkItem(
    input: Readonly<{
      providerOperationIntentId: string;
      requestId: string;
    }>
  ): Promise<ProviderOperationDispatchWorkItem>;
}>;
