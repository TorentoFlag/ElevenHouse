import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import type { FinancePrivateObjectStoragePort } from "@elevenhouse/domain/finance-core";

import type { ClaimedWebhookArtifactResolver } from "./canonical-client-order-capture.processor";

export class ClaimedWebhookArtifactResolverError extends Error {
  readonly code = "claimed_webhook_artifact_resolver_error" as const;

  constructor(readonly reason: "registry_integrity" | "storage" | "storage_integrity") {
    super("Claimed webhook artifact could not be loaded safely");
    this.name = "ClaimedWebhookArtifactResolverError";
  }
}

/**
 * Resolves a claim through the audit-producing finance artifact registry and reads exactly that
 * immutable object. The DB claim itself is responsible for proving that this artifact belongs to
 * its verified inbox row and provider identity; this layer proves registry/storage byte identity.
 */
export function createClaimedWebhookArtifactResolver(
  input: Readonly<{
    artifactRegistry: Pick<FinanceArtifactRegistry, "resolvePrivateArtifact">;
    privateObjectStorage: Pick<FinancePrivateObjectStoragePort, "readImmutable">;
  }>
): ClaimedWebhookArtifactResolver {
  return Object.freeze({
    async loadClaimedWebhookBytes(claim) {
      let resolved;
      try {
        resolved = await input.artifactRegistry.resolvePrivateArtifact({
          artifactId: claim.sealedWebhookArtifact.artifactId,
          serviceIdentity: "provider_ingress",
          purpose: "provider_webhook_verification",
          requestId: requestId(claim)
        });
      } catch {
        fail("storage");
      }
      if (
        resolved.artifactClass !== "provider_webhook" ||
        resolved.contentType !== claim.sealedWebhookArtifact.contentType ||
        resolved.artifact.artifactId !== claim.sealedWebhookArtifact.artifactId ||
        resolved.artifact.sha256Digest !== claim.sealedWebhookArtifact.sha256Digest ||
        resolved.artifact.byteLength !== claim.sealedWebhookArtifact.byteLength
      ) {
        fail("registry_integrity");
      }
      let stored;
      try {
        stored = await input.privateObjectStorage.readImmutable(resolved.privateObject);
      } catch {
        fail("storage");
      }
      if (
        stored.contentType !== claim.sealedWebhookArtifact.contentType ||
        stored.byteLength !== claim.sealedWebhookArtifact.byteLength ||
        stored.sha256Digest !== claim.sealedWebhookArtifact.sha256Digest ||
        stored.bytes.byteLength !== claim.sealedWebhookArtifact.byteLength ||
        digest(stored.bytes) !== claim.sealedWebhookArtifact.sha256Digest
      ) {
        fail("storage_integrity");
      }
      return stored.bytes;
    }
  } satisfies ClaimedWebhookArtifactResolver);
}

function requestId(
  claim: Parameters<ClaimedWebhookArtifactResolver["loadClaimedWebhookBytes"]>[0]
): string {
  return `webhook-processing:${claim.inboxItemId}:${claim.inboxVersion}:${claim.leaseFence}`;
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fail(reason: ClaimedWebhookArtifactResolverError["reason"]): never {
  throw new ClaimedWebhookArtifactResolverError(reason);
}
