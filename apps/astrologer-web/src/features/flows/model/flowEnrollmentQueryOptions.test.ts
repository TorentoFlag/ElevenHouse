import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  activateFlowMutationOptions,
  flowActivationReviewQueryOptions,
  flowEnrollmentQueryOptions,
  flowsQueryKeys,
  pauseFlowEnrollmentMutationOptions
} from "./flowsQueryOptions";
import { useActivateFlowMutation } from "./useActivateFlowMutation";
import { useFlowActivationReviewQuery } from "./useFlowActivationReviewQuery";
import { useFlowEnrollmentQuery } from "./useFlowEnrollmentQuery";
import { usePauseFlowEnrollmentMutation } from "./usePauseFlowEnrollmentMutation";

const flowId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: vi.fn((options: unknown) => options),
    useQuery: vi.fn((options: unknown) => options),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() }))
  };
});

describe("flow enrollment query options", () => {
  it("uses separate non-authoritative cache keys for review and enrollment snapshots", () => {
    expect(flowsQueryKeys.activationReview(flowId, versionId)).toEqual([
      "flows",
      "activation-review",
      flowId,
      versionId
    ]);
    expect(flowsQueryKeys.enrollment(flowId)).toEqual(["flows", "enrollment", flowId]);

    expect(flowActivationReviewQueryOptions(flowId, versionId)).toMatchObject({
      enabled: true,
      staleTime: 0,
      retry: false
    });
    expect(flowActivationReviewQueryOptions(flowId, null)).toMatchObject({ enabled: false });
    expect(flowEnrollmentQueryOptions(flowId)).toMatchObject({
      enabled: true,
      staleTime: 0,
      retry: false
    });
    expect(flowEnrollmentQueryOptions(null)).toMatchObject({ enabled: false });
  });

  it("disables automatic command retries and invalidates every flow authority read on success", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } satisfies Pick<QueryClient, "invalidateQueries">;

    const activation = activateFlowMutationOptions(queryClient);
    const pauseEnrollment = pauseFlowEnrollmentMutationOptions(queryClient);

    expect(activation.retry).toBe(false);
    expect(pauseEnrollment.retry).toBe(false);
    await activation.onSuccess();
    await pauseEnrollment.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: flowsQueryKeys.all() });
  });

  it("exposes focused hooks for activation review and enrollment authority", () => {
    expect(useFlowActivationReviewQuery(flowId, versionId)).toHaveProperty("queryFn");
    expect(useFlowEnrollmentQuery(flowId)).toHaveProperty("queryFn");
    expect(useActivateFlowMutation()).toHaveProperty("mutationFn");
    expect(usePauseFlowEnrollmentMutation()).toHaveProperty("mutationFn");
    expect(useQueryClient).toHaveBeenCalled();
    expect(useMutation).toHaveBeenCalled();
    expect(useQuery).toHaveBeenCalled();
  });
});
