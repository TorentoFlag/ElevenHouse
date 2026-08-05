import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useAstrologerTariffCatalogQuery } from "./useAstrologerTariffCatalogQuery";
import { useAstrologerTariffEntitlementsQuery } from "./useAstrologerTariffEntitlementsQuery";
import { useStartAstrologerTariffSubscriptionMutation } from "./useStartAstrologerTariffSubscriptionMutation";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: vi.fn((options: unknown) => options),
    useQuery: vi.fn((options: unknown) => options),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() }))
  };
});

describe("platform tariff query hooks", () => {
  it("binds the tariff catalog, entitlement projection, and selection command to React Query", () => {
    expect(useAstrologerTariffCatalogQuery()).toHaveProperty("queryFn");
    expect(useAstrologerTariffEntitlementsQuery()).toHaveProperty("queryFn");
    expect(useStartAstrologerTariffSubscriptionMutation()).toHaveProperty("mutationFn");
    expect(useQuery).toHaveBeenCalled();
    expect(useMutation).toHaveBeenCalled();
    expect(useQueryClient).toHaveBeenCalled();
  });
});
