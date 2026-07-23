import { describe, expect, it, vi } from "vitest";
import { listCalculations } from "../../calculations/api/calculationsApi";
import {
  createHumanDesignAiDraft,
  getHumanDesignTransit,
  recalculateHumanDesignCalculation
} from "../api/humanDesignApi";
import {
  createHumanDesignAiDraftMutationOptions,
  getHumanDesignTransitMutationOptions,
  humanDesignCalculationListQueryOptions,
  humanDesignQueryKeys,
  recalculateHumanDesignCalculationMutationOptions
} from "./humanDesignQueries";

vi.mock("../../calculations/api/calculationsApi", () => ({
  listCalculations: vi.fn(async () => ({ calculations: [], total: 0 }))
}));

vi.mock("../api/humanDesignApi", () => ({
  createHumanDesignAiDraft: vi.fn(async () => ({ calculation: { id: "calculation-id" } })),
  createHumanDesignCalculation: vi.fn(),
  getHumanDesignTransit: vi.fn(async () => ({ result: { mode: "transit" } })),
  previewHumanDesign: vi.fn(),
  recalculateHumanDesignCalculation: vi.fn(async () => ({ calculation: { id: "calculation-id" } }))
}));

describe("humanDesignQueries", () => {
  it("lists saved Human Design calculations through the shared calculations API", async () => {
    const options = humanDesignCalculationListQueryOptions();

    expect(options.queryKey).toEqual(humanDesignQueryKeys.calculationList());
    await expect(options.queryFn()).resolves.toEqual({ calculations: [], total: 0 });
    expect(listCalculations).toHaveBeenCalledWith({
      module: "human_design",
      status: "all",
      limit: 50,
      offset: 0
    });
  });

  it("recalculates saved Human Design calculations and refreshes the shared list", async () => {
    const queryClient = { invalidateQueries: vi.fn(async () => undefined) };
    const options = recalculateHumanDesignCalculationMutationOptions(queryClient);

    await expect(
      options.mutationFn({ calculationId: "11111111-1111-4111-8111-111111111111" })
    ).resolves.toEqual({ calculation: { id: "calculation-id" } });
    await options.onSuccess();

    expect(recalculateHumanDesignCalculation).toHaveBeenCalledWith({
      calculationId: "11111111-1111-4111-8111-111111111111"
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["calculations"] });
  });

  it("fetches a Human Design transit overlay through a side-effect-free mutation", async () => {
    const options = getHumanDesignTransitMutationOptions();

    await expect(
      options.mutationFn({
        calculationId: "11111111-1111-4111-8111-111111111111",
        query: { instant: "2026-07-23T09:15:00.000Z" }
      })
    ).resolves.toEqual({ result: { mode: "transit" } });

    expect(humanDesignQueryKeys.transit("calculation-id", null)).toEqual([
      "human-design",
      "transit",
      "calculation-id",
      null
    ]);
    expect(getHumanDesignTransit).toHaveBeenCalledWith({
      calculationId: "11111111-1111-4111-8111-111111111111",
      query: { instant: "2026-07-23T09:15:00.000Z" }
    });
  });

  it("creates Human Design AI drafts and refreshes the shared calculation list", async () => {
    const queryClient = { invalidateQueries: vi.fn(async () => undefined) };
    const options = createHumanDesignAiDraftMutationOptions(queryClient);

    await expect(
      options.mutationFn({
        calculationId: "11111111-1111-4111-8111-111111111111",
        body: { expectedResultChecksum: `sha256:${"a".repeat(64)}` }
      })
    ).resolves.toEqual({ calculation: { id: "calculation-id" } });
    await options.onSuccess();

    expect(createHumanDesignAiDraft).toHaveBeenCalledWith({
      calculationId: "11111111-1111-4111-8111-111111111111",
      body: { expectedResultChecksum: `sha256:${"a".repeat(64)}` }
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["calculations"] });
  });
});
