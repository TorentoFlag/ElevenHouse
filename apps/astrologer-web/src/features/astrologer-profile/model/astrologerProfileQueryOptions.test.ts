import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  astrologerProfileQueryKeys,
  currentAstrologerProfileQueryOptions,
  upsertAstrologerProfileMutationOptions
} from "./astrologerProfileQueryOptions";
import { useUpsertAstrologerProfileMutation } from "./useUpsertAstrologerProfileMutation";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: vi.fn((options: unknown) => options),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() }))
  };
});

describe("astrologer profile query options", () => {
  it("creates stable query keys for current profile data", () => {
    expect(astrologerProfileQueryKeys.all()).toEqual(["astrologerProfile"]);
    expect(astrologerProfileQueryKeys.current()).toEqual(["astrologerProfile", "current"]);
    expect(currentAstrologerProfileQueryOptions().queryKey).toEqual([
      "astrologerProfile",
      "current"
    ]);
  });

  it("invalidates current profile data after upsert succeeds", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } satisfies Pick<QueryClient, "invalidateQueries">;

    await upsertAstrologerProfileMutationOptions(queryClient).onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: astrologerProfileQueryKeys.all()
    });
  });

  it("creates the React Query mutation hook", () => {
    expect(useUpsertAstrologerProfileMutation()).toHaveProperty("mutationFn");
    expect(useQueryClient).toHaveBeenCalled();
    expect(useMutation).toHaveBeenCalled();
  });
});
