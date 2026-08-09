import {
  astrologerTariffCatalogResponseSchema,
  astrologerTariffEntitlementsResponseSchema,
  completeSavedCardSetupThreeDsMethodRequestSchema,
  completeSavedCardSetupThreeDsMethodResponseSchema,
  completeTariffInvoiceThreeDsMethodRequestSchema,
  completeTariffInvoiceThreeDsMethodResponseSchema,
  executeSavedCardSetupRequestSchema,
  executeSavedCardSetupResponseSchema,
  initiateSavedCardSetupRequestSchema,
  initiateSavedCardSetupResponseSchema,
  savedCardSetupDisclosureResponseSchema,
  savedCardSetupStatusResponseSchema,
  startAstrologerTariffSubscriptionRequestSchema,
  startAstrologerTariffSubscriptionResponseSchema,
  tariffInvoicePaymentStatusResponseSchema,
  type AstrologerTariffCatalogResponse,
  type AstrologerTariffEntitlementsResponse,
  type CompleteSavedCardSetupThreeDsMethodRequest,
  type CompleteSavedCardSetupThreeDsMethodResponse,
  type CompleteTariffInvoiceThreeDsMethodRequest,
  type CompleteTariffInvoiceThreeDsMethodResponse,
  type ExecuteSavedCardSetupRequest,
  type ExecuteSavedCardSetupResponse,
  type InitiateSavedCardSetupRequest,
  type InitiateSavedCardSetupResponse,
  type SavedCardSetupDisclosureResponse,
  type SavedCardSetupStatusResponse,
  type StartAstrologerTariffSubscriptionRequest,
  type StartAstrologerTariffSubscriptionResponse,
  type TariffInvoicePaymentStatusResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type StartAstrologerTariffSubscriptionInput = {
  readonly body: StartAstrologerTariffSubscriptionRequest;
  readonly idempotencyKey: string;
};

type IdempotentRequest<TBody> = Readonly<{
  body: TBody;
  idempotencyKey: string;
}>;

export async function getAstrologerTariffCatalog(): Promise<AstrologerTariffCatalogResponse> {
  return astrologerTariffCatalogResponseSchema.parse(await application.http.get("/tariffs"));
}

export async function getAstrologerTariffEntitlements(): Promise<AstrologerTariffEntitlementsResponse> {
  return astrologerTariffEntitlementsResponseSchema.parse(
    await application.http.get("/tariffs/entitlements")
  );
}

export async function startAstrologerTariffSubscription(
  input: StartAstrologerTariffSubscriptionInput
): Promise<StartAstrologerTariffSubscriptionResponse> {
  const body = startAstrologerTariffSubscriptionRequestSchema.parse(input.body);

  return startAstrologerTariffSubscriptionResponseSchema.parse(
    await application.http.post("/tariffs/subscriptions", body, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}

export async function getSavedCardSetupDisclosure(
  subscriptionId: string,
  locale: "ru" | "en"
): Promise<SavedCardSetupDisclosureResponse> {
  return savedCardSetupDisclosureResponseSchema.parse(
    await application.http.get(`/tariffs/subscriptions/${subscriptionId}/saved-card-disclosure?locale=${locale}`)
  );
}

export async function initiateSavedCardSetup(
  subscriptionId: string,
  input: IdempotentRequest<InitiateSavedCardSetupRequest>
): Promise<InitiateSavedCardSetupResponse> {
  const body = initiateSavedCardSetupRequestSchema.parse(input.body);
  return initiateSavedCardSetupResponseSchema.parse(
    await application.http.post(`/tariffs/subscriptions/${subscriptionId}/saved-card-setup`, body, idempotentOptions(input.idempotencyKey))
  );
}

export async function getCurrentSavedCardSetupStatus(
  subscriptionId: string
): Promise<SavedCardSetupStatusResponse | null> {
  const response = await application.http.get<unknown>(
    `/tariffs/subscriptions/${subscriptionId}/saved-card-setup`
  );

  if (response === undefined) {
    return null;
  }

  return savedCardSetupStatusResponseSchema.nullable().parse(
    response
  );
}

/** Server-authoritative recovery of the pending first/renewal invoice for one subscription. */
export async function getCurrentTariffInvoicePaymentStatus(
  subscriptionId: string
): Promise<TariffInvoicePaymentStatusResponse | null> {
  const response = await application.http.get<unknown>(
    `/tariffs/subscriptions/${subscriptionId}/payment-status`
  );

  if (response === undefined) {
    return null;
  }

  return tariffInvoicePaymentStatusResponseSchema.nullable().parse(
    response
  );
}

export async function completeTariffInvoiceThreeDsMethod(
  invoiceId: string,
  input: IdempotentRequest<CompleteTariffInvoiceThreeDsMethodRequest>
): Promise<CompleteTariffInvoiceThreeDsMethodResponse> {
  const body = completeTariffInvoiceThreeDsMethodRequestSchema.parse(input.body);
  return completeTariffInvoiceThreeDsMethodResponseSchema.parse(
    await application.http.post(
      `/tariffs/invoices/${invoiceId}/complete-3ds-method`,
      body,
      idempotentOptions(input.idempotencyKey)
    )
  );
}

export async function executeSavedCardSetup(
  setupSessionId: string,
  input: IdempotentRequest<ExecuteSavedCardSetupRequest>
): Promise<ExecuteSavedCardSetupResponse> {
  const body = executeSavedCardSetupRequestSchema.parse(input.body);
  return executeSavedCardSetupResponseSchema.parse(
    await application.http.post(`/tariffs/saved-card-setups/${setupSessionId}/execute`, body, idempotentOptions(input.idempotencyKey))
  );
}

export async function completeSavedCardSetupThreeDsMethod(
  setupSessionId: string,
  input: IdempotentRequest<CompleteSavedCardSetupThreeDsMethodRequest>
): Promise<CompleteSavedCardSetupThreeDsMethodResponse> {
  const body = completeSavedCardSetupThreeDsMethodRequestSchema.parse(input.body);
  return completeSavedCardSetupThreeDsMethodResponseSchema.parse(
    await application.http.post(
      `/tariffs/saved-card-setups/${setupSessionId}/complete-3ds-method`,
      body,
      idempotentOptions(input.idempotencyKey)
    )
  );
}

function idempotentOptions(idempotencyKey: string) {
  return { csrf: true, headers: { "idempotency-key": idempotencyKey } } as const;
}
