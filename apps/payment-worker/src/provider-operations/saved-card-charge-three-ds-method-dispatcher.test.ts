import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { digestFinanceCanonicalValueV1 } from "@elevenhouse/domain/finance-core";

import { createSavedCardChargeThreeDsMethodDispatcher } from "./saved-card-charge-three-ds-method-dispatcher";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const paymentId = "22222222-2222-4222-8222-222222222222";
const actionId = "33333333-3333-4333-8333-333333333333";
const operationId = "44444444-4444-4444-8444-444444444444";

describe("saved-card charge 3DS Method dispatcher", () => {
  it("continues the exact payment and records only a follow-up challenge", async () => {
    const setup = harness();
    await setup.dispatcher.dispatch(workItem() as never);

    expect(setup.vault.consumeArcPayThreeDsMethodContext).toHaveBeenCalledWith({
      secretRef: "kms://s3/current-browser-context", expectedProviderSetupId: paymentId
    });
    expect(setup.client.completeThreeDsMethod).toHaveBeenCalledWith(expect.objectContaining({
      providerSetupId: paymentId, completionIndicator: "Y", threeDsServerTransactionId: "server-transaction"
    }));
    expect(setup.customerAction.recordCustomerAction).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId, expectedInvoiceVersion: 4, providerPaymentId: paymentId,
      actionType: "three_ds_challenge", phase: "challenge"
    }));
    expect(setup.providerResult.applyVerifiedProviderResult).not.toHaveBeenCalled();
  });
});

function harness() {
  const requestBytes = bytes(methodEnvelope());
  const actionBytes = bytes(methodActionResponse());
  const responseBytes = bytes({ payment_id: paymentId, status: "pending_3ds", next_action: { type: "three_ds_challenge" } });
  const storage = {
    readImmutable: vi.fn(async (locator) => locator === "request" ? artifact(requestBytes) : artifact(actionBytes)),
    writeImmutable: vi.fn(async (input) => ({ contentType: input.contentType, sha256Digest: input.expectedSha256Digest, byteLength: input.bytes.byteLength }))
  };
  const registry = {
    registerSealedArtifact: vi.fn(async (input) => input.artifact)
  };
  const vault = {
    consumeArcPayThreeDsMethodContext: vi.fn(async () => ({
      kind: "arc_pay_three_ds_method_context", providerSetupId: paymentId,
      browserInfo: { acceptHeader: "text/html", language: "ru", screenWidth: 1280, screenHeight: 800, colorDepth: 24, timezoneOffsetMinutes: -180, userAgent: "agent" }
    }))
  };
  const client = {
    completeThreeDsMethod: vi.fn(async () => ({ providerSetupId: paymentId, status: "pending_3ds" as const, cardTokenId: null, nextAction: { type: "three_ds_challenge" }, rawResponseBytes: responseBytes }))
  };
  const customerAction = { recordCustomerAction: vi.fn(async () => undefined) };
  const providerResult = { applyVerifiedProviderResult: vi.fn(async () => undefined) };
  return {
    dispatcher: createSavedCardChargeThreeDsMethodDispatcher({
      privateObjectStorage: storage as never, artifactRegistry: registry as never, transientSecretVault: vault as never,
      methodClient: client as never, customerAction: customerAction as never, providerResult: providerResult as never,
      transportUnknown: { markProviderOperationTransportUnknown: vi.fn() } as never,
      responseArtifactRetention: { policyId: "provider-response", policyVersion: "1" }
    }), vault, client, customerAction, providerResult
  };
}

function workItem() {
  const envelope = methodEnvelope();
  const request = bytes(envelope);
  const action = bytes(methodActionResponse());
  return {
    operationKind: "saved_card_charge_3ds_method_complete", transientSecret: { secretRefId: "context-ref", sealedSecretRef: "kms://s3/current-browser-context", providerSetupId: paymentId },
    threeDsMethodAction: { customerActionId: actionId, providerSetupId: paymentId, invoiceVersion: 4, responseArtifact: { artifactId: "action", sha256Digest: digest(action), byteLength: action.byteLength }, privateObject: "action", artifactAccessAuditEventId: "audit-2" },
    dispatch: { purpose: "platform_invoice", sourceId: invoiceId, amountMinor: "19900", currency: "RUB", economicPaymentSessionId: "session-1", economicPaymentIntentId: "intent-1", economicPaymentVersion: 1, providerOperationIntentId: operationId, providerOperationIntentVersion: 0, providerAccount: { seriesId: "arc", providerAccountId: "merchant", identityVersion: 1 }, canonicalRequestDigest: digestFinanceCanonicalValueV1(envelope), idempotencyKey: "invoice-method-operation-1", dispatchAuthorizationId: `platform-invoice-method:${invoiceId}:${actionId}` },
    dispatchArtifact: { artifactId: "request", sha256Digest: digest(request), byteLength: request.byteLength }, privateObject: "request", operationEnvelope: { kind: "resolved_finance_operation_envelope" }
  };
}
function artifact(value: Uint8Array) { return { contentType: "application/json", sha256Digest: digest(value), byteLength: value.byteLength, bytes: value }; }
function methodEnvelope() { return { kind: "saved_card_charge_3ds_method" as const, providerPaymentId: paymentId, invoiceId, customerActionId: actionId, completionIndicator: "Y" as const, threeDsMethodContextSecret: { kind: "sealed_one_time_provider_secret_ref" as const, secretRef: "kms://s3/current-browser-context", providerExpiresAt: "2026-08-04T12:04:00Z", providerConsumption: "one_time" as const } }; }
function methodActionResponse() { return { next_action: { type: "three_ds_method", three_ds: { version: "2", phase: "method", completion_endpoint: `/v1/payments/${paymentId}/complete-3ds-method`, three_ds_server_trans_id: "server-transaction", submit: { method: "POST", url: "https://acs.example.test/method", target: "hidden_iframe", fields: [{ name: "threeDSMethodData", value: "opaque" }] } } } }; }
function bytes(value: unknown) { return new TextEncoder().encode(JSON.stringify(value)); }
function digest(value: Uint8Array): `sha256:${string}` { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
