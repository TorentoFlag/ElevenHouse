import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AdminFinancePoliciesApi } from "../api/adminFinancePoliciesApi";
import { FinancePoliciesPage } from "./FinancePoliciesPage";

describe("FinancePoliciesPage", () => {
  it("renders the admin finance policy controls instead of the shell placeholder", () => {
    const html = renderToStaticMarkup(<FinancePoliciesPage api={apiStub()} />);

    expect(html).toContain("Политики удержаний и риска");
    expect(html).toContain("Finance controls");
    expect(html).not.toContain("Admin surface");
  });
});

function apiStub(): AdminFinancePoliciesApi {
  return {
    listPolicies: vi.fn(async () => ({ policies: [] })),
    ensureDefaultPolicy: vi.fn(),
    updateDefaultPolicy: vi.fn(),
    updateAstrologerRiskProfile: vi.fn()
  };
}
