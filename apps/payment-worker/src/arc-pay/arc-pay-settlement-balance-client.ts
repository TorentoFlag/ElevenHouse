import { createHash } from "node:crypto";

import { decodeArcPayExactJson } from "./arc-pay-exact-json";

const maximumResponseBytes = 2 * 1024 * 1024;
const signedInt64Pattern = /^(?:0|-?[1-9][0-9]*)$/;

export type ArcPaySettlementBalanceClient = Readonly<{
  readSettlementBalance(): Promise<
    Readonly<{
      balances: readonly ArcPaySettlementBalance[];
      rawBody: Uint8Array;
      rawDigest: `sha256:${string}`;
      rawByteLength: number;
    }>
  >;
}>;

export type ArcPaySettlementBalance = Readonly<{
  currency: "RUB";
  availableMinor: string;
  pendingMinor: string;
  reservedMinor: string;
  updatedAt: string | null;
}>;

export class ArcPaySettlementBalanceError extends Error {
  constructor() {
    super("ArcPay settlement balance lookup did not return a valid exact response");
    this.name = "ArcPaySettlementBalanceError";
  }
}

export function createArcPaySettlementBalanceClient(
  input: Readonly<{
    apiBaseUrl: string;
    apiSecret: string | null;
    fetchImpl?: typeof fetch;
  }>
): ArcPaySettlementBalanceClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  return Object.freeze({
    async readSettlementBalance() {
      if (!input.apiSecret) throw new ArcPaySettlementBalanceError();
      let response: Response;
      try {
        response = await fetchImpl(new URL("/settlement/balance", input.apiBaseUrl), {
          headers: { authorization: `Bearer ${input.apiSecret}` }
        });
      } catch {
        throw new ArcPaySettlementBalanceError();
      }
      if (!response.ok) throw new ArcPaySettlementBalanceError();

      let rawBody: Uint8Array;
      try {
        rawBody = new Uint8Array(await response.arrayBuffer());
      } catch {
        throw new ArcPaySettlementBalanceError();
      }
      const expectedDigest = digest(rawBody);
      try {
        const decoded = decodeArcPayExactJson({
          rawBody,
          expectedDigest,
          maximumBytes: maximumResponseBytes
        });
        return Object.freeze({
          balances: parseBalances(decoded.value),
          rawBody,
          rawDigest: decoded.rawDigest,
          rawByteLength: decoded.byteLength
        });
      } catch {
        throw new ArcPaySettlementBalanceError();
      }
    }
  });
}

function parseBalances(value: unknown): readonly ArcPaySettlementBalance[] {
  if (!isRecord(value) || !Array.isArray(value.balances)) fail();
  return Object.freeze(value.balances.map(parseBalance));
}

function parseBalance(value: unknown): ArcPaySettlementBalance {
  if (!isRecord(value)) fail();
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 5 ||
    keys.some(
      (key, index) => key !== ["available", "currency", "pending", "reserved", "updated_at"][index]
    )
  ) {
    fail();
  }
  if (value.currency !== "RUB") fail();
  return Object.freeze({
    currency: "RUB",
    availableMinor: int64(value.available),
    pendingMinor: int64(value.pending),
    reservedMinor: int64(value.reserved),
    updatedAt: timestamp(value.updated_at)
  });
}

function int64(value: unknown): string {
  if (typeof value !== "string" || !signedInt64Pattern.test(value)) fail();
  return value;
}

function timestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.trim() !== value || Number.isNaN(Date.parse(value)))
    fail();
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function digest(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fail(): never {
  throw new ArcPaySettlementBalanceError();
}
