import { describe, expect, it, vi } from "vitest";
import { createAdminPlatformTariffsApi } from "./adminPlatformTariffsApi";

const draft = {
  tariffSeriesId: "pro",
  version: 1,
  name: "Pro",
  tagline: "Для активной практики",
  monthlyPriceMinor: 199_000,
  yearlyPriceMinor: 1_990_000,
  monthlyRecurringFrequencyDays: 31,
  yearlyRecurringFrequencyDays: 365,
  clientSaleCommissionBps: 800,
  seatsLimit: 1,
  bookingsLimit: null,
  aiRequestsLimit: null,
  automationLimit: null,
  isPopular: false,
  displayOrder: 0,
  features: ["engine", "natal"],
  draftRevision: 1,
  lifecycle: "draft",
  canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
};

describe("createAdminPlatformTariffsApi", () => {
  it("sends CSRF and a supplied idempotency key for the server-owned publish command", async () => {
    const fetcher = vi.fn(async () => jsonResponse(draft));
    const api = createAdminPlatformTariffsApi({
      baseUrl: "https://admin.example.test",
      fetcher: fetcher as unknown as typeof fetch,
      csrfTokenReader: () => "csrf-1"
    });

    await api.publishDraft("pro", 1, 1, "publish-pro-v1");

    expect(fetcher).toHaveBeenCalledWith(
      "https://admin.example.test/admin/tariffs/pro/1/publish",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-csrf-token": "csrf-1",
          "idempotency-key": "publish-pro-v1"
        }),
        body: JSON.stringify({ expectedDraftRevision: 1 })
      })
    );
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}
