import type { ProviderSettlementLedgerEntry } from "@elevenhouse/domain";

export type ArcPaySettlementLedgerClient = {
  readonly listSettlementLedger: (input: {
    readonly from: string;
    readonly to: string;
    readonly limit: number;
    readonly cursor?: string;
    readonly currency?: "RUB";
  }) => Promise<{
    readonly entries: readonly ProviderSettlementLedgerEntry[];
    readonly nextCursor: string | null;
    readonly totalCount: number | null;
  }>;
};

export class ArcPaySettlementLedgerError extends Error {
  constructor() {
    super("Arc Pay settlement ledger lookup did not return a valid ledger page");
    this.name = "ArcPaySettlementLedgerError";
  }
}

export function createArcPaySettlementLedgerClient(input: {
  readonly apiBaseUrl: string;
  readonly apiSecret: string | null;
  readonly fetchImpl?: typeof fetch;
}): ArcPaySettlementLedgerClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    async listSettlementLedger(request) {
      if (!input.apiSecret) throw new ArcPaySettlementLedgerError();
      const url = new URL("/v1/settlement/ledger", input.apiBaseUrl);
      url.searchParams.set("from", request.from);
      url.searchParams.set("to", request.to);
      url.searchParams.set("limit", String(request.limit));
      if (request.cursor) url.searchParams.set("cursor", request.cursor);
      if (request.currency) url.searchParams.set("currency", request.currency);

      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: { authorization: `Bearer ${input.apiSecret}` }
        });
      } catch {
        throw new ArcPaySettlementLedgerError();
      }
      if (!response.ok) throw new ArcPaySettlementLedgerError();

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ArcPaySettlementLedgerError();
      }
      return parseLedgerPage(payload);
    }
  };
}

function parseLedgerPage(
  payload: unknown
): Awaited<ReturnType<ArcPaySettlementLedgerClient["listSettlementLedger"]>> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new ArcPaySettlementLedgerError();
  }
  const page = payload as Record<string, unknown>;
  if (!Array.isArray(page.entries)) throw new ArcPaySettlementLedgerError();
  const nextCursor = readOptionalString(page.next_cursor);
  const totalCount =
    page.total_count === undefined ? null : readNonNegativeInteger(page.total_count);
  return {
    entries: page.entries.map((entry) => parseLedgerEntry(entry)),
    nextCursor,
    totalCount
  };
}

function parseLedgerEntry(value: unknown): ProviderSettlementLedgerEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ArcPaySettlementLedgerError();
  }
  const entry = value as Record<string, unknown>;
  const referenceType = readRequiredString(entry.reference_type);
  const referenceId = readOptionalString(entry.reference_id);
  return {
    provider: "arc_pay",
    providerLedgerEntryId: readRequiredString(entry.entry_id),
    providerPaymentId: referenceType === "payment" ? referenceId : null,
    amount: {
      amountMinor: readNonNegativeInteger(entry.amount),
      currency: readCurrency(entry.currency)
    },
    direction: readRequiredString(entry.direction),
    referenceType,
    providerOccurredAt: readOptionalString(entry.occurred_at),
    settlementStatus: readOptionalString(entry.settlement_status),
    raw: entry
  };
}

function readRequiredString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ArcPaySettlementLedgerError();
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

function readCurrency(value: unknown): "RUB" {
  if (value !== "RUB") throw new ArcPaySettlementLedgerError();
  return value;
}

function readNonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ArcPaySettlementLedgerError();
  }
  return value;
}
