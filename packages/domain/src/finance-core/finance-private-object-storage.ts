import type { FinanceDigest } from "./ports/finance-port-types";

/**
 * Private, immutable object storage used for finance evidence and dispatch payloads.
 *
 * The port deliberately exposes object locators rather than provider/card material.  The
 * database registry remains the authority that binds a locator to a provider identity,
 * retention policy and access audit trail.
 */
export type FinancePrivateObjectLocator = Readonly<{
  privateObjectKey: string;
  privateObjectVersion: string;
  envelopeKeyVersion: string;
}>;

export type FinancePrivateObjectWriteReceipt = Readonly<
  FinancePrivateObjectLocator & {
    sha256Digest: FinanceDigest;
    byteLength: number;
    contentType: string;
  }
>;

export type FinancePrivateObjectRead = Readonly<{
  bytes: Uint8Array;
  sha256Digest: FinanceDigest;
  byteLength: number;
  contentType: string;
}>;

export type FinancePrivateObjectStoragePort = Readonly<{
  writeImmutable(input: Readonly<{
    artifactId: string;
    contentType: string;
    bytes: Uint8Array;
    expectedSha256Digest: FinanceDigest;
  }>): Promise<FinancePrivateObjectWriteReceipt>;
  readImmutable(input: FinancePrivateObjectLocator): Promise<FinancePrivateObjectRead>;
  deleteImmutable(input: FinancePrivateObjectLocator): Promise<void>;
}>;
