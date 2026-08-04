import { describe, expect, it, vi } from "vitest";
import {
  approveCalculationInterpretation,
  listCalculations,
  saveCalculationInterpretation
} from "../../calculations/api/calculationsApi";
import {
  createHumanDesignAiDraft,
  downloadHumanDesignPdf,
  enqueueHumanDesignPdf,
  getLatestHumanDesignPdf,
  getHumanDesignTransit,
  recalculateHumanDesignCalculation
} from "../api/humanDesignApi";
import {
  createHumanDesignAiDraftMutationOptions,
  approveHumanDesignInterpretationMutationOptions,
  downloadHumanDesignPdfMutationOptions,
  enqueueHumanDesignPdfMutationOptions,
  getHumanDesignTransitMutationOptions,
  humanDesignPdfQueryOptions,
  humanDesignCalculationListQueryOptions,
  humanDesignQueryKeys,
  recalculateHumanDesignCalculationMutationOptions,
  saveHumanDesignInterpretationMutationOptions
} from "./humanDesignQueries";

vi.mock("../../calculations/api/calculationsApi", () => ({
  approveCalculationInterpretation: vi.fn(async () => ({ id: "calculation-id" })),
  listCalculations: vi.fn(async () => ({ calculations: [], total: 0 })),
  saveCalculationInterpretation: vi.fn(async () => ({ id: "calculation-id" }))
}));

vi.mock("../api/humanDesignApi", () => ({
  createHumanDesignAiDraft: vi.fn(async () => ({ calculation: { id: "calculation-id" } })),
  createHumanDesignCalculation: vi.fn(),
  downloadHumanDesignPdf: vi.fn(async () => ({ url: "https://storage.example.test/report.pdf" })),
  enqueueHumanDesignPdf: vi.fn(async () => ({ job: { id: "job-id" } })),
  getLatestHumanDesignPdf: vi.fn(async () => ({
    job: null,
    currentResultChecksum: `sha256:${"a".repeat(64)}`
  })),
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

  it("reads Human Design PDF jobs through a checksum-bound query key", async () => {
    const options = humanDesignPdfQueryOptions({
      calculationId: "11111111-1111-4111-8111-111111111111",
      locale: "ru",
      resultChecksum: `sha256:${"a".repeat(64)}`
    });

    expect(options.queryKey).toEqual(
      humanDesignQueryKeys.pdf(
        "11111111-1111-4111-8111-111111111111",
        "ru",
        `sha256:${"a".repeat(64)}`
      )
    );
    await expect(options.queryFn()).resolves.toEqual({
      job: null,
      currentResultChecksum: `sha256:${"a".repeat(64)}`
    });
    expect(getLatestHumanDesignPdf).toHaveBeenCalledWith({
      calculationId: "11111111-1111-4111-8111-111111111111",
      locale: "ru"
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

  it("saves Human Design interpretation drafts through shared calculations", async () => {
    const queryClient = { invalidateQueries: vi.fn(async () => undefined) };
    const options = saveHumanDesignInterpretationMutationOptions(queryClient);

    await expect(
      options.mutationFn({
        calculationId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
        body: {
          text: "Edited Human Design draft",
          expectedResultChecksum: `sha256:${"a".repeat(64)}`
        }
      })
    ).resolves.toEqual({ id: "calculation-id" });
    await options.onSuccess();

    expect(saveCalculationInterpretation).toHaveBeenCalledWith({
      calculationId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      body: {
        text: "Edited Human Design draft",
        expectedResultChecksum: `sha256:${"a".repeat(64)}`
      }
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["calculations"] });
  });

  it("approves Human Design interpretations through shared calculations", async () => {
    const queryClient = { invalidateQueries: vi.fn(async () => undefined) };
    const options = approveHumanDesignInterpretationMutationOptions(queryClient);

    await expect(
      options.mutationFn({
        calculationId: "11111111-1111-4111-8111-111111111111",
        interpretationId: "44444444-4444-4444-8444-444444444444"
      })
    ).resolves.toEqual({ id: "calculation-id" });
    await options.onSuccess();

    expect(approveCalculationInterpretation).toHaveBeenCalledWith({
      calculationId: "11111111-1111-4111-8111-111111111111",
      interpretationId: "44444444-4444-4444-8444-444444444444"
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["calculations"] });
  });

  it("enqueues Human Design PDFs and invalidates the matching PDF query", async () => {
    const queryClient = { invalidateQueries: vi.fn(async () => undefined) };
    const options = enqueueHumanDesignPdfMutationOptions(queryClient);

    const input = {
      calculationId: "11111111-1111-4111-8111-111111111111",
      body: {
        expectedResultChecksum: `sha256:${"a".repeat(64)}`,
        locale: "ru" as const
      }
    };
    await expect(options.mutationFn(input)).resolves.toEqual({ job: { id: "job-id" } });
    await options.onSuccess({}, input);

    expect(enqueueHumanDesignPdf).toHaveBeenCalledWith(input);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: humanDesignQueryKeys.pdf(
        "11111111-1111-4111-8111-111111111111",
        "ru",
        `sha256:${"a".repeat(64)}`
      )
    });
  });

  it("downloads Human Design PDFs through the private download helper", async () => {
    const options = downloadHumanDesignPdfMutationOptions();

    await expect(
      options.mutationFn({
        calculationId: "11111111-1111-4111-8111-111111111111",
        jobId: "44444444-4444-4444-8444-444444444444"
      })
    ).resolves.toEqual({ url: "https://storage.example.test/report.pdf" });
    expect(downloadHumanDesignPdf).toHaveBeenCalledWith({
      calculationId: "11111111-1111-4111-8111-111111111111",
      jobId: "44444444-4444-4444-8444-444444444444"
    });
  });
});
