import { createHash } from "node:crypto";

import { createProviderAccountIdentityBinding } from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import {
  ClaimedWebhookArtifactResolverError,
  createClaimedWebhookArtifactResolver
} from "./claimed-webhook-artifact-resolver";

const bytes = new TextEncoder().encode('{"event_type":"payment.captured"}');
const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
const claim = {
  inboxItemId: "finance-webhook-inbox-1",
  inboxVersion: 2,
  expectedCheckpointSequence: 1,
  leaseFence: 1,
  providerAccount: createProviderAccountIdentityBinding({
    seriesId: "arc-sandbox",
    providerAccountId: "merchant-sandbox",
    identityVersion: 1
  }),
  receivingEnvironment: "sandbox" as const,
  webhookId: "11111111-1111-4111-8111-111111111111",
  providerEventType: "payment.captured" as const,
  sealedWebhookArtifact: {
    artifactId: "arc-webhook:1",
    sha256Digest: digest,
    byteLength: bytes.byteLength,
    contentType: "application/json" as const
  }
};

describe("claimed webhook artifact resolver", () => {
  it("reads only the audited immutable artifact matching the lease claim", async () => {
    const resolvePrivateArtifact = vi.fn(async () => ({
      artifact: {
        artifactId: claim.sealedWebhookArtifact.artifactId,
        sha256Digest: digest,
        byteLength: bytes.byteLength
      },
      artifactClass: "provider_webhook",
      contentType: "application/json",
      privateObject: {
        privateObjectKey: "finance/artifacts/arc-webhook:1.json",
        privateObjectVersion: "v1",
        envelopeKeyVersion: "kms-v1"
      },
      retainedUntil: "2027-08-05T00:00:00.000Z",
      accessAuditEventId: "audit-1"
    }));
    const readImmutable = vi.fn(async () => ({
      bytes,
      sha256Digest: digest,
      byteLength: bytes.byteLength,
      contentType: "application/json"
    }));
    const resolver = createClaimedWebhookArtifactResolver({
      artifactRegistry: { resolvePrivateArtifact } as never,
      privateObjectStorage: { readImmutable } as never
    });

    await expect(resolver.loadClaimedWebhookBytes(claim)).resolves.toEqual(bytes);
    expect(resolvePrivateArtifact).toHaveBeenCalledWith({
      artifactId: "arc-webhook:1",
      serviceIdentity: "payment_processing",
      purpose: "provider_webhook_verification",
      requestId: "webhook-processing:finance-webhook-inbox-1:2:1"
    });
    expect(readImmutable).toHaveBeenCalledWith({
      privateObjectKey: "finance/artifacts/arc-webhook:1.json",
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-v1"
    });
  });

  it("fails closed when the storage bytes do not match the registered immutable artifact", async () => {
    const resolver = createClaimedWebhookArtifactResolver({
      artifactRegistry: {
        resolvePrivateArtifact: async () => ({
          artifact: {
            artifactId: claim.sealedWebhookArtifact.artifactId,
            sha256Digest: digest,
            byteLength: bytes.byteLength
          },
          artifactClass: "provider_webhook",
          contentType: "application/json",
          privateObject: {
            privateObjectKey: "finance/artifacts/arc-webhook:1.json",
            privateObjectVersion: "v1",
            envelopeKeyVersion: "kms-v1"
          },
          retainedUntil: "2027-08-05T00:00:00.000Z",
          accessAuditEventId: "audit-1"
        })
      } as never,
      privateObjectStorage: {
        readImmutable: async () => ({
          bytes: new TextEncoder().encode("changed"),
          sha256Digest: digest,
          byteLength: bytes.byteLength,
          contentType: "application/json"
        })
      } as never
    });

    await expect(resolver.loadClaimedWebhookBytes(claim)).rejects.toMatchObject({
      code: "claimed_webhook_artifact_resolver_error",
      reason: "storage_integrity"
    } satisfies Partial<ClaimedWebhookArtifactResolverError>);
  });
});
