import { describe, expect, it, vi } from "vitest";
import { listCalculations } from "../../calculations/api/calculationsApi";
import {
  humanDesignCalculationListQueryOptions,
  humanDesignQueryKeys
} from "./humanDesignQueries";

vi.mock("../../calculations/api/calculationsApi", () => ({
  listCalculations: vi.fn(async () => ({ calculations: [], total: 0 }))
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
});
