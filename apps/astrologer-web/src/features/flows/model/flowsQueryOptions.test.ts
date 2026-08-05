import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  activateFlowMutationOptions,
  completeFlowWorkItemMutationOptions,
  createNextFlowDraftMutationOptions,
  createFlowMutationOptions,
  createManualFlowRunMutationOptions,
  decideFlowApprovalMutationOptions,
  flowApprovalsQueryOptions,
  flowDefinitionQueryOptions,
  flowListQueryOptions,
  flowRunsQueryOptions,
  flowTemplatesQueryOptions,
  flowWorkItemsQueryOptions,
  flowsQueryKeys,
  publishFlowMutationOptions,
  snoozeFlowWorkItemMutationOptions,
  startFlowWorkItemMutationOptions,
  simulateFlowRunMutationOptions,
  updateFlowDraftMutationOptions,
  validateFlowDefinitionMutationOptions
} from "./flowsQueryOptions";
import { useActivateFlowMutation } from "./useActivateFlowMutation";
import { useCreateNextFlowDraftMutation } from "./useCreateNextFlowDraftMutation";
import { useCreateFlowMutation } from "./useCreateFlowMutation";
import { useFlowDefinitionQuery } from "./useFlowDefinitionQuery";
import { useFlowListQuery } from "./useFlowListQuery";
import { useFlowTemplatesQuery } from "./useFlowTemplatesQuery";
import { useFlowWorkItemsQuery } from "./useFlowWorkItemsQuery";
import { useCompleteFlowWorkItemMutation } from "./useCompleteFlowWorkItemMutation";
import { usePublishFlowMutation } from "./usePublishFlowMutation";
import { useUpdateFlowDraftMutation } from "./useUpdateFlowDraftMutation";
import { useValidateFlowDefinitionMutation } from "./useValidateFlowDefinitionMutation";
import { useSnoozeFlowWorkItemMutation } from "./useSnoozeFlowWorkItemMutation";
import { useStartFlowWorkItemMutation } from "./useStartFlowWorkItemMutation";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: vi.fn((options: unknown) => options),
    useQuery: vi.fn((options: unknown) => options),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() }))
  };
});

describe("flows query options", () => {
  it("creates stable query keys for flow lists and templates", () => {
    const query = { state: "draft", enrollmentState: "all", limit: 20, offset: 0 } as const;
    const runQuery = { status: "all", limit: 20, offset: 0 } as const;

    expect(flowsQueryKeys.all()).toEqual(["flows"]);
    expect(flowsQueryKeys.list(query)).toEqual(["flows", "list", query]);
    expect(flowsQueryKeys.detail("11111111-1111-4111-8111-111111111111")).toEqual([
      "flows",
      "detail",
      "11111111-1111-4111-8111-111111111111"
    ]);
    expect(flowsQueryKeys.templates("ru")).toEqual(["flows", "templates", "ru"]);
    expect(flowsQueryKeys.runs("11111111-1111-4111-8111-111111111111", runQuery)).toEqual([
      "flows",
      "runs",
      "11111111-1111-4111-8111-111111111111",
      runQuery
    ]);
    expect(flowsQueryKeys.approvals({ status: "pending", limit: 50, offset: 0 })).toEqual([
      "flows",
      "approvals",
      { status: "pending", limit: 50, offset: 0 }
    ]);
    expect(flowsQueryKeys.workItems({ status: "pending", limit: 5, offset: 0 })).toEqual([
      "flows",
      "work-items",
      { status: "pending", limit: 5, offset: 0 }
    ]);
    expect(flowListQueryOptions(query).queryKey).toEqual(["flows", "list", query]);
    expect(flowDefinitionQueryOptions("11111111-1111-4111-8111-111111111111").queryKey).toEqual([
      "flows",
      "detail",
      "11111111-1111-4111-8111-111111111111"
    ]);
    expect(flowTemplatesQueryOptions("ru").queryKey).toEqual(["flows", "templates", "ru"]);
    expect(flowRunsQueryOptions("11111111-1111-4111-8111-111111111111", runQuery).queryKey).toEqual(
      ["flows", "runs", "11111111-1111-4111-8111-111111111111", runQuery]
    );
    expect(flowApprovalsQueryOptions({ status: "pending", limit: 50, offset: 0 }).queryKey).toEqual(
      ["flows", "approvals", { status: "pending", limit: 50, offset: 0 }]
    );
    expect(flowWorkItemsQueryOptions({ status: "pending", limit: 5, offset: 0 }).queryKey).toEqual([
      "flows",
      "work-items",
      { status: "pending", limit: 5, offset: 0 }
    ]);
    expect(
      flowRunsQueryOptions("11111111-1111-4111-8111-111111111111", runQuery)
    ).not.toHaveProperty("placeholderData");
  });

  it("invalidates all flow queries after mutations succeed", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } satisfies Pick<QueryClient, "invalidateQueries">;

    await createFlowMutationOptions(queryClient).onSuccess();
    await updateFlowDraftMutationOptions(queryClient).onSuccess();
    await publishFlowMutationOptions(queryClient).onSuccess();
    await createNextFlowDraftMutationOptions(queryClient).onSuccess();
    await activateFlowMutationOptions(queryClient).onSuccess();
    await createManualFlowRunMutationOptions(queryClient).onSuccess();
    await decideFlowApprovalMutationOptions(queryClient).onSuccess();
    await startFlowWorkItemMutationOptions(queryClient).onSuccess();
    await snoozeFlowWorkItemMutationOptions(queryClient).onSuccess();
    await completeFlowWorkItemMutationOptions(queryClient).onSuccess();

    expect(invalidateQueries).toHaveBeenCalledTimes(10);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: flowsQueryKeys.all() });
  });

  it("exposes mutation options for simulation without invalidating persisted queries", () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } satisfies Pick<QueryClient, "invalidateQueries">;

    expect(simulateFlowRunMutationOptions().mutationFn).toBeTypeOf("function");
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(createManualFlowRunMutationOptions(queryClient).mutationFn).toBeTypeOf("function");
    expect(decideFlowApprovalMutationOptions(queryClient).mutationFn).toBeTypeOf("function");
    expect(validateFlowDefinitionMutationOptions().mutationFn).toBeTypeOf("function");
  });

  it("creates React Query hooks for flow reads and mutations", () => {
    expect(
      useFlowListQuery({ state: "all", enrollmentState: "all", limit: 50, offset: 0 })
    ).toHaveProperty("queryFn");
    expect(useFlowDefinitionQuery("11111111-1111-4111-8111-111111111111")).toHaveProperty(
      "queryFn"
    );
    expect(useFlowTemplatesQuery("ru")).toHaveProperty("queryFn");
    expect(useFlowWorkItemsQuery({ status: "pending", limit: 5, offset: 0 })).toHaveProperty(
      "queryFn"
    );
    expect(useCreateFlowMutation()).toHaveProperty("mutationFn");
    expect(useUpdateFlowDraftMutation()).toHaveProperty("mutationFn");
    expect(usePublishFlowMutation()).toHaveProperty("mutationFn");
    expect(useCreateNextFlowDraftMutation()).toHaveProperty("mutationFn");
    expect(useActivateFlowMutation()).toHaveProperty("mutationFn");
    expect(useValidateFlowDefinitionMutation()).toHaveProperty("mutationFn");
    expect(useStartFlowWorkItemMutation()).toHaveProperty("mutationFn");
    expect(useSnoozeFlowWorkItemMutation()).toHaveProperty("mutationFn");
    expect(useCompleteFlowWorkItemMutation()).toHaveProperty("mutationFn");
    expect(useQueryClient).toHaveBeenCalled();
    expect(useMutation).toHaveBeenCalled();
    expect(useQuery).toHaveBeenCalled();
  });

  it("does not retry the operator work queue behind a failed authoritative response", () => {
    expect(flowWorkItemsQueryOptions({ status: "active", limit: 50, offset: 0 }).retry).toBe(false);
  });
});
