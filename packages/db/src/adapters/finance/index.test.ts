import { describe, expect, it } from "vitest";

import {
  createDrizzleEconomicPaymentIntentCreationUnitOfWork,
  createDrizzleEconomicPaymentSessionOpenUnitOfWork,
  createDrizzleClientCheckoutPreparationStore,
  createDrizzleClientOrderCheckoutPreparationUnitOfWork,
  createDrizzleClientCheckoutSessionResultUnitOfWork,
  createDrizzleClientCheckoutProviderTransportUnknownUnitOfWork,
  createDrizzleProviderOperationTransportUnknownUnitOfWork,
  createDrizzleProviderOperationIntentCreationUnitOfWork,
  createDrizzleProviderOperationResultApplicationUnitOfWork,
  createDrizzleClientOrderCanonicalCaptureUnitOfWork,
  createDrizzleClientOrderCanonicalWebhookCaptureUnitOfWork,
  createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork,
  createDrizzleOnlineSaleCapturePersistenceResolver,
  createDrizzleWebhookInboxProcessingUnitOfWork,
  createDrizzleRefundCandidateStore,
  createFinanceArtifactRegistry
} from "./index";

describe("finance adapter public entry point", () => {
  it("exports the persisted provider-dispatch and provider-result boundaries", () => {
    expect(createDrizzleEconomicPaymentIntentCreationUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleEconomicPaymentSessionOpenUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleClientCheckoutPreparationStore).toBeTypeOf("function");
    expect(createDrizzleClientOrderCheckoutPreparationUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleClientCheckoutSessionResultUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleClientCheckoutProviderTransportUnknownUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleProviderOperationTransportUnknownUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleProviderOperationIntentCreationUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleProviderOperationResultApplicationUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleClientOrderCanonicalCaptureUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleClientOrderCanonicalWebhookCaptureUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleOnlineSaleCapturePersistenceResolver).toBeTypeOf("function");
    expect(createDrizzleWebhookInboxProcessingUnitOfWork).toBeTypeOf("function");
    expect(createDrizzleRefundCandidateStore).toBeTypeOf("function");
    expect(createFinanceArtifactRegistry).toBeTypeOf("function");
  });
});
