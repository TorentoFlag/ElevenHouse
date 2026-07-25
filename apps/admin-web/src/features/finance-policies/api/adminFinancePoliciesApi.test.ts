import { describe, expect, it, vi } from "vitest";
import { createAdminFinancePoliciesApi } from "./adminFinancePoliciesApi";

describe("createAdminFinancePoliciesApi", () => {
  it("lists policies with credentialed admin-api requests", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ policies: [] }));
    const api = createAdminFinancePoliciesApi({ baseUrl: "https://admin-api.test", fetcher });

    await expect(api.listPolicies()).resolves.toEqual({ policies: [] });
    expect(fetcher).toHaveBeenCalledWith(
      "https://admin-api.test/admin/finance/policies",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("sends CSRF and validates policy mutation payloads", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        id: "11111111-1111-4111-8111-111111111111",
        policyVersion: 2,
        riskTier: "standard",
        holdDurationHours: 72,
        reserveBps: 500,
        reserveReleaseDelayDays: 14,
        platformFeeBps: 1200,
        providerSettlementRequired: true,
        isActive: true,
        createdByUserId: "22222222-2222-4222-8222-222222222222",
        snapshottedAt: "2026-07-25T10:00:00.000Z",
        createdAt: "2026-07-25T10:00:00.000Z"
      })
    );
    const api = createAdminFinancePoliciesApi({
      fetcher,
      csrfTokenReader: () => "csrf-token"
    });

    await api.updateDefaultPolicy({
      riskTier: "standard",
      holdDurationHours: 72,
      reserveBps: 500,
      reserveReleaseDelayDays: 14,
      platformFeeBps: 1200,
      providerSettlementRequired: true
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/admin/finance/policies/default",
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-csrf-token": "csrf-token"
        })
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
