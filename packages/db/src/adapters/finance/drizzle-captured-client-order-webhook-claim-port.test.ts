import { describe, expect, it } from "vitest";

import {
  CapturedClientOrderWebhookClaimPersistenceError,
  classifyCapturedClientOrderWebhookFailure,
  mapClaimedClientOrderWebhook,
  mapClaimedCapturedClientOrderWebhook
} from "./drizzle-captured-client-order-webhook-claim-port";

describe("captured client-order webhook claim port", () => {
  it("maps only a verified ArcPay payment.captured lease with a sealed provider-webhook artifact", () => {
    expect(
      mapClaimedCapturedClientOrderWebhook({
        inboxItemId: "webhook-inbox-1",
        issuedVersion: "2",
        issuedLeaseFence: "1",
        lastCheckpointSequence: "0",
        seriesId: "series-live-1",
        providerAccountId: "arc-live-1",
        providerIdentityVersion: 1,
        receivingEnvironment: "live",
        webhookId: "webhook-1",
        providerEventType: "payment.captured",
        provider: "arc_pay",
        signatureStatus: "verified",
        artifactId: "artifact-webhook-1",
        artifactClass: "provider_webhook",
        artifactBindingKind: "provider",
        artifactSeriesId: "series-live-1",
        artifactProviderAccountId: "arc-live-1",
        artifactProviderIdentityVersion: 1,
        sha256Digest: `sha256:${"a".repeat(64)}`,
        byteLength: "42",
        contentType: "application/json"
      })
    ).toEqual({
      inboxItemId: "webhook-inbox-1",
      inboxVersion: 2,
      expectedCheckpointSequence: 1,
      leaseFence: 1,
      providerAccount: {
        seriesId: "series-live-1",
        providerAccountId: "arc-live-1",
        identityVersion: 1
      },
      receivingEnvironment: "live",
      webhookId: "webhook-1",
      providerEventType: "payment.captured",
      sealedWebhookArtifact: {
        artifactId: "artifact-webhook-1",
        sha256Digest: `sha256:${"a".repeat(64)}`,
        byteLength: 42,
        contentType: "application/json"
      }
    });
  });

  it("fails closed instead of lending a client-order processor a foreign artifact", () => {
    expect(() =>
      mapClaimedCapturedClientOrderWebhook({
        inboxItemId: "webhook-inbox-1",
        issuedVersion: "2",
        issuedLeaseFence: "1",
        lastCheckpointSequence: "0",
        seriesId: "series-live-1",
        providerAccountId: "arc-live-1",
        providerIdentityVersion: 1,
        receivingEnvironment: "live",
        webhookId: "webhook-1",
        providerEventType: "payment.captured",
        provider: "arc_pay",
        signatureStatus: "verified",
        artifactId: "artifact-webhook-1",
        artifactClass: "provider_webhook",
        artifactBindingKind: "provider",
        artifactSeriesId: "series-other",
        artifactProviderAccountId: "arc-live-1",
        artifactProviderIdentityVersion: 1,
        sha256Digest: `sha256:${"a".repeat(64)}`,
        byteLength: "42",
        contentType: "application/json"
      })
    ).toThrow(CapturedClientOrderWebhookClaimPersistenceError);
  });

  it("maps a refund only when the lease and sealed artifact identify payment.refunded", () => {
    expect(
      mapClaimedClientOrderWebhook(
        {
          inboxItemId: "webhook-inbox-refund-1",
          issuedVersion: "2",
          issuedLeaseFence: "1",
          lastCheckpointSequence: "0",
          seriesId: "series-live-1",
          providerAccountId: "arc-live-1",
          providerIdentityVersion: 1,
          receivingEnvironment: "live",
          webhookId: "webhook-refund-1",
          providerEventType: "payment.refunded",
          provider: "arc_pay",
          signatureStatus: "verified",
          artifactId: "artifact-webhook-refund-1",
          artifactClass: "provider_webhook",
          artifactBindingKind: "provider",
          artifactSeriesId: "series-live-1",
          artifactProviderAccountId: "arc-live-1",
          artifactProviderIdentityVersion: 1,
          sha256Digest: `sha256:${"b".repeat(64)}`,
          byteLength: "42",
          contentType: "application/json"
        },
        "payment.refunded"
      )
    ).toMatchObject({
      providerEventType: "payment.refunded",
      expectedCheckpointSequence: 1,
      sealedWebhookArtifact: { artifactId: "artifact-webhook-refund-1" }
    });
  });

  it("retries only transient classes and quarantines contract violations immediately", () => {
    expect(
      classifyCapturedClientOrderWebhookFailure({
        errorClass: "canonical_provider_read_unavailable",
        processingAttempts: 2,
        retryPolicy: {
          maximumAttempts: 5,
          baseDelayMilliseconds: 1_000,
          maximumDelayMilliseconds: 8_000
        }
      })
    ).toEqual({ kind: "retry", delayMilliseconds: 2_000 });
    expect(
      classifyCapturedClientOrderWebhookFailure({
        errorClass: "processor_contract_violation",
        processingAttempts: 1,
        retryPolicy: {
          maximumAttempts: 5,
          baseDelayMilliseconds: 1_000,
          maximumDelayMilliseconds: 8_000
        }
      })
    ).toEqual({ kind: "quarantine" });
  });
});
