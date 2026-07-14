import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { archiveCalculation } from "../../calculations/api/calculationsApi";
import { useArchiveNumerologyMutation } from "./numerologyHooks";
import { archiveNumerologyMutationOptions, calculationsQueryKeys } from "./numerologyQueries";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: vi.fn((options: unknown) => options),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() }))
  };
});

vi.mock("../../calculations/api/calculationsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../calculations/api/calculationsApi")>();
  return { ...actual, archiveCalculation: vi.fn() };
});

describe("numerology query options", () => {
  it("archives a calculation and invalidates every calculation query", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } satisfies Pick<QueryClient, "invalidateQueries">;
    vi.mocked(archiveCalculation).mockResolvedValue({} as never);
    const options = archiveNumerologyMutationOptions(queryClient);

    await options.mutationFn("11111111-1111-4111-8111-111111111111");
    await options.onSuccess();

    expect(archiveCalculation).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: calculationsQueryKeys.all()
    });
  });

  it("exposes the archive mutation through the Numerology hook", () => {
    expect(useArchiveNumerologyMutation()).toHaveProperty("mutationFn");
    expect(useQueryClient).toHaveBeenCalled();
    expect(useMutation).toHaveBeenCalled();
  });
});
