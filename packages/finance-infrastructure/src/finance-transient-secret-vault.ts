/* eslint-disable no-control-regex -- Provider boundary validation intentionally rejects ASCII control characters. */
import { createHash } from "node:crypto";

import type {
  ArcPayBrowserInfo,
  ArcPayCardTokenizationSecret,
  ArcPayThreeDsMethodContext,
  FinancePrivateObjectStoragePort,
  FinanceTransientSecretVaultPort
} from "@elevenhouse/domain/finance-core";

type Locator = Readonly<{
  privateObjectKey: string;
  privateObjectVersion: string;
  envelopeKeyVersion: string;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secretIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const colorDepths = new Set([1, 4, 8, 15, 16, 24, 32, 48]);

/** KMS-encrypted object storage is used as an opaque single-use token vault, never PostgreSQL. */
export function createFinanceTransientSecretVault(
  storage: FinancePrivateObjectStoragePort,
  now: () => Date = () => new Date()
): FinanceTransientSecretVaultPort {
  return Object.freeze({
    async sealArcPayCardTokenizationSecret(input) {
      assertInput(input, now());
      const payload = Object.freeze({
        kind: "arc_pay_card_tokenization_secret" as const,
        providerSetupId: input.providerSetupId,
        cardTokenId: input.cardTokenId,
        browserInfo: normalizeBrowserInfo(input.browserInfo)
      });
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      const digest = sha256(bytes);
      const receipt = await storage.writeImmutable({
        artifactId: `arc-card-tokenization-secret:${input.secretId}`,
        contentType: "application/json",
        bytes,
        expectedSha256Digest: digest
      });
      if (
        receipt.contentType !== "application/json" ||
        receipt.sha256Digest !== digest ||
        receipt.byteLength !== bytes.byteLength
      ) {
        throw new FinanceTransientSecretVaultError("storage_integrity");
      }
      return Object.freeze({
        kind: "sealed_one_time_provider_secret_ref" as const,
        secretRef: encodeLocator({
          privateObjectKey: receipt.privateObjectKey,
          privateObjectVersion: receipt.privateObjectVersion,
          envelopeKeyVersion: receipt.envelopeKeyVersion
        }),
        providerExpiresAt: canonicalInstant(input.providerExpiresAt),
        providerConsumption: "one_time" as const
      });
    },
    async consumeArcPayCardTokenizationSecret(input) {
      if (!uuid(input.expectedProviderSetupId)) throw new FinanceTransientSecretVaultError("invalid_input");
      const locator = decodeLocator(input.secretRef);
      const artifact = await storage.readImmutable(locator);
      if (
        artifact.contentType !== "application/json" ||
        artifact.byteLength < 1 ||
        artifact.sha256Digest !== sha256(artifact.bytes)
      ) {
        throw new FinanceTransientSecretVaultError("storage_integrity");
      }
      const secret = decodeSecret(artifact.bytes);
      if (secret.providerSetupId !== input.expectedProviderSetupId) {
        throw new FinanceTransientSecretVaultError("provider_identity_conflict");
      }
      return secret;
    },
    async sealArcPayThreeDsMethodContext(input) {
      assertThreeDsMethodContextInput(input, now());
      const payload = Object.freeze({
        kind: "arc_pay_three_ds_method_context" as const,
        providerSetupId: input.providerSetupId,
        browserInfo: normalizeBrowserInfo(input.browserInfo)
      });
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      const digest = sha256(bytes);
      const receipt = await storage.writeImmutable({
        artifactId: `arc-three-ds-method-context:${input.secretId}`,
        contentType: "application/json",
        bytes,
        expectedSha256Digest: digest
      });
      if (
        receipt.contentType !== "application/json" ||
        receipt.sha256Digest !== digest ||
        receipt.byteLength !== bytes.byteLength
      ) {
        throw new FinanceTransientSecretVaultError("storage_integrity");
      }
      return Object.freeze({
        kind: "sealed_one_time_provider_secret_ref" as const,
        secretRef: encodeLocator({
          privateObjectKey: receipt.privateObjectKey,
          privateObjectVersion: receipt.privateObjectVersion,
          envelopeKeyVersion: receipt.envelopeKeyVersion
        }),
        providerExpiresAt: canonicalInstant(input.providerExpiresAt),
        providerConsumption: "one_time" as const
      });
    },
    async consumeArcPayThreeDsMethodContext(input) {
      if (!uuid(input.expectedProviderSetupId)) throw new FinanceTransientSecretVaultError("invalid_input");
      const locator = decodeLocator(input.secretRef);
      const artifact = await storage.readImmutable(locator);
      if (
        artifact.contentType !== "application/json" ||
        artifact.byteLength < 1 ||
        artifact.sha256Digest !== sha256(artifact.bytes)
      ) {
        throw new FinanceTransientSecretVaultError("storage_integrity");
      }
      const context = decodeThreeDsMethodContext(artifact.bytes);
      if (context.providerSetupId !== input.expectedProviderSetupId) {
        throw new FinanceTransientSecretVaultError("provider_identity_conflict");
      }
      return context;
    },
    async destroyOneTimeSecret(input) {
      await storage.deleteImmutable(decodeLocator(input.secretRef));
    }
  });
}

export class FinanceTransientSecretVaultError extends Error {
  readonly code = "FINANCE_TRANSIENT_SECRET_VAULT_ERROR" as const;

  constructor(readonly reason: "invalid_input" | "storage_integrity" | "provider_identity_conflict") {
    super("Finance transient secret vault operation failed");
  }
}

function assertInput(
  input: Parameters<FinanceTransientSecretVaultPort["sealArcPayCardTokenizationSecret"]>[0],
  current: Date
): void {
  if (
    !secretIdPattern.test(input.secretId) ||
    !uuid(input.providerSetupId) ||
    !uuid(input.cardTokenId) ||
    !validDate(input.providerExpiresAt) ||
    new Date(input.providerExpiresAt).getTime() <= current.getTime() ||
    new Date(input.providerExpiresAt).getTime() > current.getTime() + 5 * 60 * 1_000
  ) {
    throw new FinanceTransientSecretVaultError("invalid_input");
  }
  normalizeBrowserInfo(input.browserInfo);
}

function decodeSecret(bytes: Uint8Array): ArcPayCardTokenizationSecret {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new FinanceTransientSecretVaultError("storage_integrity");
  }
  if (!record(value) || !exactKeys(value, ["kind", "providerSetupId", "cardTokenId", "browserInfo"])) {
    throw new FinanceTransientSecretVaultError("storage_integrity");
  }
  if (value.kind !== "arc_pay_card_tokenization_secret" || !uuid(value.providerSetupId) || !uuid(value.cardTokenId)) {
    throw new FinanceTransientSecretVaultError("storage_integrity");
  }
  return Object.freeze({
    kind: "arc_pay_card_tokenization_secret" as const,
    providerSetupId: value.providerSetupId,
    cardTokenId: value.cardTokenId,
    browserInfo: normalizeBrowserInfo(value.browserInfo)
  });
}

function decodeThreeDsMethodContext(bytes: Uint8Array): ArcPayThreeDsMethodContext {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new FinanceTransientSecretVaultError("storage_integrity");
  }
  if (!record(value) || !exactKeys(value, ["kind", "providerSetupId", "browserInfo"])) {
    throw new FinanceTransientSecretVaultError("storage_integrity");
  }
  if (value.kind !== "arc_pay_three_ds_method_context" || !uuid(value.providerSetupId)) {
    throw new FinanceTransientSecretVaultError("storage_integrity");
  }
  return Object.freeze({
    kind: "arc_pay_three_ds_method_context" as const,
    providerSetupId: value.providerSetupId,
    browserInfo: normalizeBrowserInfo(value.browserInfo)
  });
}

function assertThreeDsMethodContextInput(
  input: Parameters<FinanceTransientSecretVaultPort["sealArcPayThreeDsMethodContext"]>[0],
  current: Date
): void {
  if (
    !secretIdPattern.test(input.secretId) ||
    !uuid(input.providerSetupId) ||
    !validDate(input.providerExpiresAt) ||
    new Date(input.providerExpiresAt).getTime() <= current.getTime() ||
    new Date(input.providerExpiresAt).getTime() > current.getTime() + 5 * 60 * 1_000
  ) {
    throw new FinanceTransientSecretVaultError("invalid_input");
  }
  normalizeBrowserInfo(input.browserInfo);
}

function normalizeBrowserInfo(value: unknown): ArcPayBrowserInfo {
  if (!record(value)) throw new FinanceTransientSecretVaultError("invalid_input");
  const allowed = [
    "acceptHeader", "language", "screenWidth", "screenHeight", "colorDepth",
    "timezoneOffsetMinutes", "userAgent", "javaEnabled", "windowSize"
  ];
  if (!Object.keys(value).every((key) => allowed.includes(key))) {
    throw new FinanceTransientSecretVaultError("invalid_input");
  }
  if (
    !text(value.acceptHeader, 1, 4096) || !text(value.language, 1, 64) ||
    !positiveInteger(value.screenWidth, 20_000) || !positiveInteger(value.screenHeight, 20_000) ||
    !colorDepths.has(value.colorDepth as number) || !integer(value.timezoneOffsetMinutes, -1_440, 1_440) ||
    !text(value.userAgent, 1, 2048) ||
    (value.javaEnabled !== undefined && typeof value.javaEnabled !== "boolean") ||
    (value.windowSize !== undefined && !["01", "02", "03", "04", "05"].includes(value.windowSize as string))
  ) {
    throw new FinanceTransientSecretVaultError("invalid_input");
  }
  return Object.freeze({
    acceptHeader: value.acceptHeader,
    language: value.language,
    screenWidth: value.screenWidth,
    screenHeight: value.screenHeight,
    colorDepth: value.colorDepth as ArcPayBrowserInfo["colorDepth"],
    timezoneOffsetMinutes: value.timezoneOffsetMinutes,
    userAgent: value.userAgent,
    ...(value.javaEnabled === undefined ? {} : { javaEnabled: value.javaEnabled }),
    ...(value.windowSize === undefined ? {} : { windowSize: value.windowSize as ArcPayBrowserInfo["windowSize"] })
  });
}

function encodeLocator(locator: Locator): string {
  const encoded = Buffer.from(JSON.stringify(locator), "utf8").toString("base64url");
  return `kms://s3/${encoded}`;
}

function decodeLocator(secretRef: string): Locator {
  let url: URL;
  try { url = new URL(secretRef); } catch { throw new FinanceTransientSecretVaultError("invalid_input"); }
  if (url.protocol !== "kms:" || url.host !== "s3" || url.search || url.hash) {
    throw new FinanceTransientSecretVaultError("invalid_input");
  }
  const encoded = url.pathname.slice(1);
  if (!encoded || encoded.includes("/")) throw new FinanceTransientSecretVaultError("invalid_input");
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new FinanceTransientSecretVaultError("invalid_input");
  }
  if (!record(value) || !exactKeys(value, ["privateObjectKey", "privateObjectVersion", "envelopeKeyVersion"])) {
    throw new FinanceTransientSecretVaultError("invalid_input");
  }
  if (
    !text(value.privateObjectKey, 1, 640) ||
    !text(value.privateObjectVersion, 1, 640) ||
    !text(value.envelopeKeyVersion, 1, 640)
  ) {
    throw new FinanceTransientSecretVaultError("invalid_input");
  }
  return Object.freeze(value as Locator);
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function canonicalInstant(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/(\.\d*?[1-9])0+Z$/, "$1Z")
    .replace(/\.0+Z$/, "Z");
}
function uuid(value: unknown): value is string { return typeof value === "string" && uuidPattern.test(value); }
function validDate(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value).sort(); return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]); }
function text(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.trim() === value && value.length >= min && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value); }
function integer(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max; }
function positiveInteger(value: unknown, max: number): value is number { return integer(value, 1, max); }
