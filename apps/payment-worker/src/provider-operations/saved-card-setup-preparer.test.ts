import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import { canonicalizeFinanceCommandPayload } from "@elevenhouse/domain";
import {
  createFinanceOperationResourcePolicyDraft,
  publishFinanceOperationResourcePolicyDraft,
  type FinanceOperationResourcePolicyReader,
  type FinancePrivateObjectStoragePort,
  type SavedCardSetupPreparationUnitOfWork
} from "@elevenhouse/domain/finance-core";
import type { SavedCardSetupSessionReader } from "@elevenhouse/db/finance";

import {
  createSavedCardSetupPreparer,
  deterministicSavedCardSetupId
} from "./saved-card-setup-preparer";

const setupSessionId = "10000000-0000-4000-8000-000000000001";

describe("saved-card setup preparer", () => {
  it("builds and seals a server-owned zero-amount setup envelope before it persists dispatch", async () => {
    const sessions = {
      findForPreparation: vi.fn(async () => setupRequestedSession())
    } as unknown as SavedCardSetupSessionReader;
    const policyReader: FinanceOperationResourcePolicyReader = {
      findPublishedForOperation: vi.fn(async () => publishedPolicy())
    };
    const writeImmutable = vi.fn(async ({ bytes }: { bytes: Uint8Array }) => ({
      privateObjectKey: "finance/immutable/card-setup.json",
      privateObjectVersion: "version-1",
      envelopeKeyVersion: "kms-key-1",
      sha256Digest: digest(bytes),
      byteLength: bytes.byteLength,
      contentType: "application/json"
    }));
    const prepareSavedCardSetup = vi.fn(async () => ({
      kind: "saved_card_setup_preparation_receipt" as const,
      setupSessionId,
      setupSessionVersion: 2,
      economicPaymentIntentId: "20000000-0000-4000-8000-000000000002",
      providerOperationIntentId: "30000000-0000-4000-8000-000000000003"
    }));

    await createSavedCardSetupPreparer({
      sessions,
      policyReader,
      preparation: { prepareSavedCardSetup } as SavedCardSetupPreparationUnitOfWork,
      privateObjectStorage: { writeImmutable } as unknown as FinancePrivateObjectStoragePort,
      requestArtifactRetention: { policyId: "finance-request", policyVersion: "1" },
      returnOrigin: "https://astrologer.elevenhouse.test"
    }).prepare({ setupSessionId });

    const expectedEnvelope = {
      kind: "card_setup",
      step: "create",
      customerId: "arc-customer-42",
      setupExternalId: setupSessionId,
      successUrl: "https://astrologer.elevenhouse.test/settings/billing/card-setup/success",
      failureUrl: "https://astrologer.elevenhouse.test/settings/billing/card-setup/failure"
    };
    const expectedBytes = canonicalizeFinanceCommandPayload(expectedEnvelope);
    expect(writeImmutable).toHaveBeenCalledWith({
      artifactId: `arc-card-setup-request:${setupSessionId}`,
      contentType: "application/json",
      bytes: expectedBytes,
      expectedSha256Digest: digest(expectedBytes)
    });
    expect(prepareSavedCardSetup).toHaveBeenCalledWith(expect.objectContaining({
      setupSessionId,
      providerAccount: {
        seriesId: "arcpay-sandbox",
        providerAccountId: "merchant-sandbox",
        identityVersion: 1
      },
      dispatchEnvelope: expectedEnvelope,
      dispatchArtifact: {
        artifactId: `arc-card-setup-request:${setupSessionId}`,
        sha256Digest: digest(expectedBytes),
        byteLength: expectedBytes.byteLength
      },
      retentionPolicyId: "finance-request",
      retentionPolicyVersion: "1",
      idempotencyKey: deterministicSavedCardSetupId(setupSessionId, "provider-operation-intent")
    }));
    expect(deterministicSavedCardSetupId(setupSessionId, "provider-operation-intent")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("does not recreate an already atomically prepared setup session", async () => {
    const writeImmutable = vi.fn();
    const prepareSavedCardSetup = vi.fn();

    await createSavedCardSetupPreparer({
      sessions: { findForPreparation: vi.fn(async () => ({ ...setupRequestedSession(), state: "preparation_pending" as const })) } as unknown as SavedCardSetupSessionReader,
      policyReader: { findPublishedForOperation: vi.fn() },
      preparation: { prepareSavedCardSetup } as SavedCardSetupPreparationUnitOfWork,
      privateObjectStorage: { writeImmutable } as unknown as FinancePrivateObjectStoragePort,
      requestArtifactRetention: { policyId: "finance-request", policyVersion: "1" },
      returnOrigin: "https://astrologer.elevenhouse.test"
    }).prepare({ setupSessionId });

    expect(writeImmutable).not.toHaveBeenCalled();
    expect(prepareSavedCardSetup).not.toHaveBeenCalled();
  });
});

function setupRequestedSession() {
  return {
    setupSessionId,
    state: "setup_requested" as const,
    ownerUserId: "40000000-0000-4000-8000-000000000004",
    providerAccount: {
      seriesId: "arcpay-sandbox",
      providerAccountId: "merchant-sandbox",
      identityVersion: 1
    },
    providerCustomerId: "arc-customer-42"
  };
}

function publishedPolicy() {
  return publishFinanceOperationResourcePolicyDraft(createFinanceOperationResourcePolicyDraft({
    policyId: "platform-card-setup-limits",
    version: 1,
    operationKind: "platform_card_setup_prepare",
    maximumRows: 1,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 4_096
  }));
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
