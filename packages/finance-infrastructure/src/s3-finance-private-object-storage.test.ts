import { PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, test } from "vitest";

import { createS3FinancePrivateObjectStorage } from "./s3-finance-private-object-storage";

describe("S3 finance private object storage", () => {
  test("stores versioned private artifacts without provider-side encryption headers", async () => {
    const sent: unknown[] = [];
    const storage = createS3FinancePrivateObjectStorage(
      {
        endpoint: "https://finance-artifacts.example.com",
        region: "ru-central-1",
        bucket: "elevenhouse-finance-private",
        accessKeyId: "finance-access-key",
        secretAccessKey: "finance-secret-key",
        forcePathStyle: true
      },
      {
        send: async (command) => {
          sent.push(command);
          return { VersionId: "artifact-version-1" };
        }
      }
    );

    const receipt = await storage.writeImmutable({
      artifactId: "arc-pay-request-1",
      bytes: new TextEncoder().encode('{"kind":"request"}'),
      contentType: "application/json",
      expectedSha256Digest:
        "sha256:6b0c0a115f3ec27e28c3a232166ffc9a239fd54d437e346c12c6fbf0c8bca7e7"
    });

    expect(receipt).toMatchObject({
      privateObjectVersion: "artifact-version-1",
      envelopeKeyVersion: "private-versioned-object:v1"
    });
    const put = sent.find((command) => command instanceof PutObjectCommand) as PutObjectCommand;
    expect(put).toBeDefined();
    expect(put.input).not.toHaveProperty("ServerSideEncryption");
    expect(put.input).not.toHaveProperty("SSEKMSKeyId");
  });
});
