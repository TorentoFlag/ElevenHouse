import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { archiveCalculation } from "../../calculations/api/calculationsApi";
import {
  createNumerologyAiDraft,
  enqueueNumerologyPdf,
  getLatestNumerologyPdf
} from "../api/numerologyApi";
import {
  useArchiveNumerologyMutation,
  useCreateNumerologyAiDraftMutation
} from "./numerologyHooks";
import {
  archiveNumerologyMutationOptions,
  calculationsQueryKeys,
  createNumerologyAiDraftMutationOptions,
  enqueueNumerologyPdfMutationOptions,
  numerologyPdfQueryOptions,
  numerologyPdfQueryKeys
} from "./numerologyQueries";

const checksum = `sha256:${"a".repeat(64)}`;

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

vi.mock("../api/numerologyApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/numerologyApi")>();
  return {
    ...actual,
    createNumerologyAiDraft: vi.fn(),
    enqueueNumerologyPdf: vi.fn(),
    getLatestNumerologyPdf: vi.fn()
  };
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

  it("creates an AI draft and invalidates calculation queries", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } satisfies Pick<QueryClient, "invalidateQueries">;
    const input = {
      calculationId: "11111111-1111-4111-8111-111111111111",
      body: { expectedResultChecksum: `sha256:${"a".repeat(64)}` }
    } as const;
    vi.mocked(createNumerologyAiDraft).mockResolvedValue({} as never);
    const options = createNumerologyAiDraftMutationOptions(queryClient);

    await options.mutationFn(input);
    await options.onSuccess();

    expect(createNumerologyAiDraft).toHaveBeenCalledWith(input);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: calculationsQueryKeys.all() });
    expect(useCreateNumerologyAiDraftMutation()).toHaveProperty("mutationFn");
  });

  it("keys latest PDF state by calculation, locale and current checksum", async () => {
    const options = numerologyPdfQueryOptions({
      calculationId: "11111111-1111-4111-8111-111111111111",
      locale: "en",
      resultChecksum: `sha256:${"b".repeat(64)}`
    });
    vi.mocked(getLatestNumerologyPdf).mockResolvedValue({} as never);

    await options.queryFn();

    expect(options.queryKey).toEqual([
      "numerology",
      "pdf",
      "11111111-1111-4111-8111-111111111111",
      "en",
      `sha256:${"b".repeat(64)}`
    ]);
    expect(getLatestNumerologyPdf).toHaveBeenCalledWith({
      calculationId: "11111111-1111-4111-8111-111111111111",
      locale: "en"
    });
  });

  it("polls only while the PDF job is queued or processing", () => {
    const options = numerologyPdfQueryOptions({
      calculationId: "11111111-1111-4111-8111-111111111111",
      locale: "ru",
      resultChecksum: checksum
    });

    expect(options.refetchInterval({ state: { data: { job: { status: "queued" } } } })).toBe(1500);
    expect(options.refetchInterval({ state: { data: { job: { status: "processing" } } } })).toBe(
      1500
    );
    expect(options.refetchInterval({ state: { data: { job: { status: "ready" } } } })).toBe(false);
    expect(options.refetchInterval({ state: { data: { job: null } } })).toBe(false);
  });

  it("invalidates the exact PDF query after enqueue", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } satisfies Pick<QueryClient, "invalidateQueries">;
    const input = {
      calculationId: "11111111-1111-4111-8111-111111111111",
      body: { expectedResultChecksum: checksum, locale: "ru" as const }
    };
    vi.mocked(enqueueNumerologyPdf).mockResolvedValue({} as never);
    const options = enqueueNumerologyPdfMutationOptions(queryClient);

    await options.mutationFn(input);
    await options.onSuccess(undefined, input);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: numerologyPdfQueryKeys.detail(input.calculationId, "ru", checksum)
    });
  });
});
