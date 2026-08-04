// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@elevenhouse/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chartMethodVersions } from "@elevenhouse/contracts";
import type {
  CalculationRecordResponse,
  ChartCalculationCapability,
  ChartInterpretationMode,
  ChartNatalJobCreateResponse,
  ChartHoraryQuestionSnapshot,
  ChartResult,
  ChartSettings,
  ChartTransitMoment,
  StoredChartCalculationPayload,
  StoredChartAstrocartographyCalculationPayload,
  StoredChartCompositeCalculationPayload,
  StoredChartHoraryCalculationPayload,
  StoredChartNatalCalculationPayload,
  StoredChartSolarReturnCalculationPayload,
  StoredChartProgressionCalculationPayload,
  StoredChartSynastryCalculationPayload
} from "@elevenhouse/contracts";
import { application } from "../../Application";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import {
  createInitialChartEngineControllerState,
  deriveChartEngineJobState,
  restoreChartEngineViewState,
  resolveChartEngineCalculationState,
  resolveChartEngineSubmissionAuthority,
  shouldCommitTerminalJobRecovery,
  submitChartCalculation,
  submitAstrocartographyCalculation,
  submitCompositeCalculation,
  getChartLinkableClientId,
  getBrowserTimezone,
  getDefaultProgressionTargetDate,
  submitHoraryCalculation,
  submitProgressionCalculation,
  submitSolarReturnCalculation,
  submitSynastryCalculation,
  submitChartEngineMode,
  submitTransitCalculation,
  type ChartEngineSubmission,
  useChartEngineController
} from "./useChartEngineController";
import type { ChartCalculationRead } from "../../features/charts/api/chartsApi";

const clientId = "22222222-2222-4222-8222-222222222222";
const calculationId = "44444444-4444-4444-8444-444444444444";
const partnerClientId = "55555555-5555-4555-8555-555555555555";
const checksum = `sha256:${"a".repeat(64)}`;
const calculatingResponse = {
  status: "calculating",
  jobId: "33333333-3333-4333-8333-333333333333"
} satisfies ChartNatalJobCreateResponse;

afterEach(() => vi.restoreAllMocks());

describe("chart engine controller submission", () => {
  it("uses the saved CRM participant as the link target when one is loaded", () => {
    expect(
      getChartLinkableClientId({
        participants: [
          {
            role: "subject",
            source: "crm_client",
            clientId,
            displayName: "Марина Краснова"
          }
        ]
      })
    ).toBe(clientId);
  });

  it("withholds linking while authoritative saved participants are still loading", () => {
    expect(getChartLinkableClientId(null)).toBeNull();
  });

  it("fails closed instead of creating or recalculating when a saved ID lacks recalculation authority", () => {
    expect(
      resolveChartEngineSubmissionAuthority({
        calculationId,
        expectedResultChecksum: checksum,
        canRecalculate: false
      })
    ).toEqual({
      kind: "blocked",
      message: "Сохранённый расчёт нельзя пересчитать в текущем состоянии"
    });
  });

  it("requires the authoritative saved checksum for exact-ID recalculation", () => {
    expect(
      resolveChartEngineSubmissionAuthority({
        calculationId,
        expectedResultChecksum: null,
        canRecalculate: true
      })
    ).toEqual({
      kind: "blocked",
      message: "Не удалось подтвердить версию сохранённого расчёта"
    });
  });

  it("recalculates an existing stale result instead of creating a separate natal job", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const recalculate = vi.fn(async () => calculatingResponse);

    await expect(
      submitChartCalculation({
        clientId,
        interpretationMode: "adult_natal",
        calculationId,
        expectedResultChecksum: checksum,
        isResultStale: true,
        settings: settings(),
        create,
        recalculate
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).not.toHaveBeenCalled();
    expect(recalculate).toHaveBeenCalledWith({
      calculationId,
      expectedResultChecksum: checksum,
      expectedMethod: "natal",
      settings: settings()
    });
  });

  it("creates a first natal job when there is no stale saved calculation", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const recalculate = vi.fn(async () => calculatingResponse);

    await expect(
      submitChartCalculation({
        clientId,
        interpretationMode: "adult_natal",
        calculationId: null,
        expectedResultChecksum: null,
        isResultStale: false,
        settings: settings(),
        create,
        recalculate
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      interpretationMode: "adult_natal",
      settings: settings()
    });
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("targets the authoritative saved calculation even when local stale detection is false", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const recalculate = vi.fn(async () => calculatingResponse);

    await expect(
      submitChartCalculation({
        clientId,
        interpretationMode: "adult_natal",
        calculationId,
        expectedResultChecksum: checksum,
        isResultStale: false,
        settings: settings(),
        create,
        recalculate
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).not.toHaveBeenCalled();
    expect(recalculate).toHaveBeenCalledWith({
      calculationId,
      expectedResultChecksum: checksum,
      expectedMethod: "natal",
      settings: settings()
    });
  });

  it.each(savedModeSubmissions())(
    "dispatches saved $mode through exact target recalculation instead of a create endpoint",
    async (submission) => {
      const post = vi.spyOn(application.http, "post").mockResolvedValue(calculatingResponse);

      await expect(submitChartEngineMode(submission)).resolves.toEqual(calculatingResponse);

      expect(post).toHaveBeenCalledOnce();
      expect(post).toHaveBeenCalledWith(
        `/charts/calculations/${calculationId}/recalculate`,
        { expectedResultChecksum: checksum, settings: settings() },
        { csrf: true }
      );
    }
  );

  it("creates transit jobs with the selected moment without using natal recalculation", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const transit = {
      date: "2026-10-25",
      time: "02:30",
      dstOccurrence: "second"
    } satisfies ChartTransitMoment;

    await expect(
      submitTransitCalculation({
        clientId,
        settings: settings(),
        transit,
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      settings: settings(),
      transit
    });
  });

  it("creates synastry jobs with the selected partner client", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const partnerClientId = "55555555-5555-4555-8555-555555555555";

    await expect(
      submitSynastryCalculation({
        clientId,
        partnerClientId,
        settings: settings(),
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      partnerClientId,
      settings: settings()
    });
  });

  it("creates composite jobs with the selected partner client", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const partnerClientId = "55555555-5555-4555-8555-555555555555";

    await expect(
      submitCompositeCalculation({
        clientId,
        partnerClientId,
        settings: settings(),
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      partnerClientId,
      settings: settings()
    });
  });

  it("creates solar return jobs with the selected target year", async () => {
    const create = vi.fn(async () => calculatingResponse);

    await expect(
      submitSolarReturnCalculation({
        clientId,
        year: 2026,
        settings: settings(),
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      year: 2026,
      settings: settings()
    });
  });

  it("creates progression jobs with the selected target date", async () => {
    const create = vi.fn(async () => calculatingResponse);

    await expect(
      submitProgressionCalculation({
        clientId,
        targetDate: "2026-07-23",
        settings: settings(),
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      targetDate: "2026-07-23",
      settings: settings()
    });
  });

  it("creates horary jobs with the selected question snapshot", async () => {
    const create = vi.fn(async () => calculatingResponse);

    await expect(
      submitHoraryCalculation({
        clientId,
        question: horaryQuestion(),
        settings: settings(),
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      question: horaryQuestion(),
      settings: settings()
    });
  });

  it("creates astrocartography jobs with the selected client and settings", async () => {
    const create = vi.fn(async () => calculatingResponse);

    await expect(
      submitAstrocartographyCalculation({
        clientId,
        settings: settings(),
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      settings: settings()
    });
  });
});

describe("chart engine recovery orchestration", () => {
  it("uses the local calendar date for progression defaults and never falls back to UTC timezone", () => {
    const localDate = new Date(2026, 7, 3, 23, 30);

    expect(getDefaultProgressionTargetDate(localDate)).toBe("2026-08-03");
    expect(
      getBrowserTimezone(() => ({ timeZone: "" }) as Intl.ResolvedDateTimeFormatOptions)
    ).toBeNull();
    expect(
      getBrowserTimezone(() => {
        throw new Error("unavailable");
      })
    ).toBeNull();
  });

  it("restores a horary place through the strict reference endpoint without rewriting its opaque URL id", async () => {
    const providerPlaceId = "autocomplete-request-42";
    window.history.replaceState(
      {},
      "",
      `/chart-engine?mode=horary&clientId=${clientId}&horaryPlaceProvider=geoapify&horaryPlaceId=${providerPlaceId}`
    );
    const get = vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      if (url === `/clients/birth-places/geoapify/${providerPlaceId}`) {
        return {
          id: `geoapify:${providerPlaceId}`,
          label: "Rome, Lazio, Italy",
          placeName: "Rome, Italy",
          countryCode: "IT",
          city: "Rome",
          region: "Lazio",
          timezone: "Europe/Rome",
          latitude: 41.8933,
          longitude: 12.4829,
          provider: "geoapify",
          providerPlaceId
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => expect(result.current.horaryPlaceText).toBe("Rome, Italy"));
    expect(result.current.horaryQuestion).toMatchObject({
      timezone: "Europe/Rome",
      latitude: 41.8933,
      longitude: 12.4829
    });
    expect(window.location.search).toContain(`horaryPlaceId=${providerPlaceId}`);
    expect(get).toHaveBeenCalledWith(`/clients/birth-places/geoapify/${providerPlaceId}`);
    unmount();
  });

  it.each([
    ["natal", ""],
    ["child_chart", "&mode=child_chart"],
    ["transit", "&mode=transit&transitDate=2026-08-03&transitTime=14%3A30"],
    ["progression", "&mode=progression&progressionTargetDate=2026-08-04"],
    ["synastry", `&mode=synastry&partnerClientId=${partnerClientId}`],
    ["composite", `&mode=composite&partnerClientId=${partnerClientId}`],
    ["solar_return", "&mode=solar_return&solarReturnYear=2027"],
    ["astrocartography", "&mode=astrocartography"],
    ["horary", "&mode=horary&horaryPlaceProvider=geoapify&horaryPlaceId=place.1"]
  ] as const)("resumes a %s job from its safe URL state", (mode, suffix) => {
    const state = createInitialChartEngineControllerState(
      `?clientId=${clientId}&jobId=${calculatingResponse.jobId}${suffix}`
    );

    expect(state.mode).toBe(mode);
    expect(state.jobId).toBe(calculatingResponse.jobId);
    expect(state.calculationId).toBeNull();
  });

  it("exits calculating after a poll error while retaining the recoverable job id", () => {
    expect(
      deriveChartEngineJobState({
        isSubmitting: false,
        jobId: calculatingResponse.jobId,
        jobStatus: undefined,
        pollError: new Error("network down"),
        calculationId: null,
        isResultLoading: false,
        resultError: null,
        isSavedCalculationLoading: false,
        savedCalculationError: null,
        identityKind: "pending",
        result: null
      })
    ).toBe("failed");
  });

  it.each(["result", "saved calculation"] as const)(
    "does not present a %s query failure as idle",
    (failedQuery) => {
      expect(
        deriveChartEngineJobState({
          isSubmitting: false,
          jobId: null,
          jobStatus: undefined,
          pollError: null,
          calculationId,
          isResultLoading: false,
          resultError: failedQuery === "result" ? new Error("result unavailable") : null,
          isSavedCalculationLoading: false,
          savedCalculationError:
            failedQuery === "saved calculation" ? new Error("participants unavailable") : null,
          identityKind: "pending",
          result: null
        })
      ).toBe("failed");
    }
  );

  it("withholds a strict result and linking when URL client identity mismatches", () => {
    const state = resolveChartEngineCalculationState({
      mode: "natal",
      selectedClientId: "77777777-7777-4777-8777-777777777777",
      selectedPartnerClientId: null,
      chartCalculation: chartCalculationRead(natalResult(), ["view_legacy", "recalculate"]),
      savedCalculation: savedCalculation(natalResult())
    });

    expect(state.identity.kind).toBe("client_mismatch");
    expect(state.result).toBeNull();
    expect(state.linkableClientId).toBeNull();
    expect(state.capabilities.view).toBe("none");
  });

  it("fails closed when backend capabilities disagree with the strict result", () => {
    const state = resolveChartEngineCalculationState({
      mode: "natal",
      selectedClientId: clientId,
      selectedPartnerClientId: null,
      chartCalculation: chartCalculationRead(natalResult(), ["view_legacy"]),
      savedCalculation: savedCalculation(natalResult())
    });

    expect(state.result).toBeNull();
    expect(state.capabilities.view).toBe("none");
  });

  it("fails closed when the strict chart read and saved calculation contain different results", () => {
    const changed = { ...natalResult(), settings: { ...settings(), orbMultiplier: 1.1 } };
    const state = resolveChartEngineCalculationState({
      mode: "natal",
      selectedClientId: clientId,
      selectedPartnerClientId: null,
      chartCalculation: chartCalculationRead(changed, ["view_legacy", "recalculate"]),
      savedCalculation: savedCalculation(natalResult())
    });

    expect(state.identity.kind).toBe("unavailable");
    expect(state.result).toBeNull();
  });

  it("ignores child URL tampering for a persisted adult natal calculation", () => {
    const current = natalResultV2();
    const state = resolveChartEngineCalculationState({
      mode: "child_chart",
      selectedClientId: clientId,
      selectedPartnerClientId: null,
      chartCalculation: chartCalculationRead(
        current,
        ["view_current", "recalculate", "link", "publish", "ai_draft", "pdf"],
        "adult_natal"
      ),
      savedCalculation: savedCalculation(current, "adult_natal")
    });

    expect(state.mode).toBe("natal");
    expect(state.interpretationMode).toBe("adult_natal");
    expect(state.capabilities.canRequestAi).toBe(true);
  });

  it("restores persisted child authority even when the URL requests adult natal", () => {
    const current = natalResultV2();
    const state = resolveChartEngineCalculationState({
      mode: "natal",
      selectedClientId: clientId,
      selectedPartnerClientId: null,
      chartCalculation: chartCalculationRead(
        current,
        ["view_current", "recalculate", "link"],
        "child"
      ),
      savedCalculation: savedCalculation(current, "child")
    });

    expect(state.mode).toBe("child_chart");
    expect(state.interpretationMode).toBe("child");
    expect(state.capabilities).toMatchObject({
      canRequestAi: false,
      canRequestPdf: false,
      canLink: true,
      canPublish: false
    });
  });

  it.each([
    ["adult_natal", "natal"],
    ["child", "child_chart"]
  ] as const)(
    "keeps a classified legacy v1 %s calculation available for an exact-id upgrade",
    (interpretationMode, expectedMode) => {
      const legacy = natalResult();
      const state = resolveChartEngineCalculationState({
        mode: expectedMode === "child_chart" ? "natal" : "child_chart",
        selectedClientId: clientId,
        selectedPartnerClientId: null,
        chartCalculation: chartCalculationRead(
          legacy,
          ["view_legacy", "recalculate"],
          interpretationMode
        ),
        savedCalculation: savedCalculation(legacy, interpretationMode)
      });

      expect(state.mode).toBe(expectedMode);
      expect(state.interpretationMode).toBe(interpretationMode);
      expect(state.capabilities).toMatchObject({
        view: "legacy",
        canRecalculate: true,
        canRequestAi: false,
        canRequestPdf: false,
        canLink: false,
        canPublish: false
      });
    }
  );
});

describe("chart engine controller hook recovery", () => {
  it("does not recommit a terminal job after URL and local state already point to its calculation", () => {
    expect(
      shouldCommitTerminalJobRecovery({
        localJobId: null,
        localCalculationId: calculationId,
        urlJobId: null,
        urlCalculationId: calculationId,
        terminalCalculationId: calculationId
      })
    ).toBe(false);
  });

  it("commits terminal job recovery once and then loads the exact authoritative result", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&jobId=${calculatingResponse.jobId}`
    );
    const replaceState = vi.spyOn(window.history, "replaceState");
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/jobs/${calculatingResponse.jobId}`) {
        return {
          id: calculatingResponse.jobId,
          status: "succeeded",
          interpretationMode: "legacy_unclassified",
          calculationId
        };
      }
      if (url === `/charts/calculations/${calculationId}`) {
        return chartCalculationRead(natalResult(), ["view_legacy", "recalculate"]);
      }
      if (url === `/calculations/${calculationId}`) {
        return savedCalculation(natalResult());
      }
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      throw new Error(`Unexpected GET ${url}`);
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => {
      expect(result.current.result?.schemaVersion).toBe("chart-result.v1");
    });
    expect(result.current.jobState).toBe("succeeded");
    expect(window.location.search).toContain(`calculationId=${calculationId}`);
    expect(window.location.search).not.toContain("jobId=");
    expect(
      replaceState.mock.calls.filter(([, , url]) =>
        String(url).includes(`calculationId=${calculationId}`)
      )
    ).toHaveLength(1);
    unmount();
  });

  it("canonicalizes a child URL back to persisted adult natal authority", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&calculationId=${calculationId}&mode=child_chart`
    );
    const current = natalResultV2();
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/calculations/${calculationId}`) {
        return chartCalculationRead(
          current,
          ["view_current", "recalculate", "link", "publish", "ai_draft", "pdf"],
          "adult_natal"
        );
      }
      if (url === `/calculations/${calculationId}`) {
        return savedCalculation(current, "adult_natal");
      }
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      if (url === `/charts/calculations/${calculationId}/report/pdf?locale=ru`) {
        return { job: null, currentResultChecksum: checksum };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => expect(result.current.mode).toBe("natal"));
    expect(result.current.interpretationMode).toBe("adult_natal");
    expect(result.current.capabilities.canRequestAi).toBe(true);
    expect(window.location.search).not.toContain("mode=child_chart");
    unmount();
  });

  it("canonicalizes an adult URL to persisted child authority", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&calculationId=${calculationId}`
    );
    const current = natalResultV2();
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/calculations/${calculationId}`) {
        return chartCalculationRead(current, ["view_current", "recalculate", "link"], "child");
      }
      if (url === `/calculations/${calculationId}`) return savedCalculation(current, "child");
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      throw new Error(`Unexpected GET ${url}`);
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => expect(result.current.mode).toBe("child_chart"));
    expect(result.current.interpretationMode).toBe("child");
    expect(result.current.capabilities.canRequestAi).toBe(false);
    expect(window.location.search).toContain("mode=child_chart");
    unmount();
  });

  it("treats a matching legacy result as requiring an exact-id upgrade", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&calculationId=${calculationId}`
    );
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/calculations/${calculationId}`) {
        return chartCalculationRead(natalResult(), ["view_legacy", "recalculate"]);
      }
      if (url === `/calculations/${calculationId}`) return savedCalculation(natalResult());
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      if (url === `/charts/jobs/${calculatingResponse.jobId}`) {
        return {
          id: calculatingResponse.jobId,
          status: "calculating",
          interpretationMode: "legacy_unclassified",
          targetCalculationId: calculationId,
          expectedSourceChecksum: checksum
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    const post = vi.spyOn(application.http, "post").mockResolvedValue(calculatingResponse);

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => expect(result.current.capabilities.view).toBe("legacy"));
    expect(result.current.isResultStale).toBe(true);

    await act(async () => result.current.onCreateNatalJob());

    expect(post).toHaveBeenCalledWith(
      `/charts/calculations/${calculationId}/recalculate`,
      { expectedResultChecksum: checksum, settings: settings() },
      { csrf: true }
    );
    unmount();
  });

  it("refreshes both exact same-id reads before accepting a synchronous replacement replay", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&calculationId=${calculationId}`
    );
    const replacement = natalResultV2();
    let strictReads = 0;
    let savedReads = 0;
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/calculations/${calculationId}`) {
        strictReads += 1;
        return strictReads === 1
          ? chartCalculationRead(natalResult(), ["view_legacy", "recalculate"])
          : chartCalculationRead(
              replacement,
              ["view_current", "recalculate"],
              "legacy_unclassified"
            );
      }
      if (url === `/calculations/${calculationId}`) {
        savedReads += 1;
        return savedReads === 1
          ? savedCalculation(natalResult())
          : savedCalculation(replacement, "legacy_unclassified");
      }
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      throw new Error(`Unexpected GET ${url}`);
    });
    vi.spyOn(application.http, "post").mockResolvedValue({
      status: "succeeded",
      calculationId,
      result: replacement
    });
    const queryClient = createChartControllerQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper(queryClient)
    });
    await waitFor(() => expect(result.current.result?.schemaVersion).toBe("chart-result.v1"));

    await act(async () => result.current.onCreateNatalJob());

    await waitFor(() => expect(result.current.result?.schemaVersion).toBe("chart-result.v2"));
    expect(strictReads).toBe(2);
    expect(savedReads).toBe(2);
    expect(invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["charts", "calculations", calculationId],
        exact: true
      })
    );
    expect(invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["calculations", calculationId], exact: true })
    );
    expect(
      invalidateQueries.mock.calls.some(([filters]) =>
        JSON.stringify(filters?.queryKey ?? []).includes("77777777-7777-4777-8777-777777777777")
      )
    ).toBe(false);
    unmount();
  });

  it("refreshes both exact same-id reads after a terminal replacement job", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&calculationId=${calculationId}`
    );
    const replacement = natalResultV2();
    let strictReads = 0;
    let savedReads = 0;
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/calculations/${calculationId}`) {
        strictReads += 1;
        return strictReads === 1
          ? chartCalculationRead(natalResult(), ["view_legacy", "recalculate"])
          : chartCalculationRead(
              replacement,
              ["view_current", "recalculate"],
              "legacy_unclassified"
            );
      }
      if (url === `/calculations/${calculationId}`) {
        savedReads += 1;
        return savedReads === 1
          ? savedCalculation(natalResult())
          : savedCalculation(replacement, "legacy_unclassified");
      }
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      if (url === `/charts/jobs/${calculatingResponse.jobId}`) {
        return {
          id: calculatingResponse.jobId,
          status: "succeeded",
          interpretationMode: "legacy_unclassified",
          calculationId,
          targetCalculationId: calculationId,
          expectedSourceChecksum: checksum
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    vi.spyOn(application.http, "post").mockResolvedValue(calculatingResponse);
    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });
    await waitFor(() => expect(result.current.result?.schemaVersion).toBe("chart-result.v1"));

    await act(async () => result.current.onCreateNatalJob());

    await waitFor(() => expect(result.current.result?.schemaVersion).toBe("chart-result.v2"));
    expect(strictReads).toBe(2);
    expect(savedReads).toBe(2);
    expect(window.location.search).toContain(`calculationId=${calculationId}`);
    expect(window.location.search).not.toContain("jobId=");
    unmount();
  });

  it("recovers a failed recalculation target from the owner-scoped job and retries the same id", async () => {
    const replacementJobId = "77777777-7777-4777-8777-777777777777";
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&jobId=${calculatingResponse.jobId}`
    );
    const currentResult = natalResultV2();
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/jobs/${calculatingResponse.jobId}`) {
        return {
          id: calculatingResponse.jobId,
          status: "failed",
          interpretationMode: "adult_natal",
          failureCode: "retry_exhausted",
          failureMessage: "Провайдер временно недоступен",
          targetCalculationId: calculationId,
          expectedSourceChecksum: checksum
        };
      }
      if (url === `/charts/jobs/${replacementJobId}`) {
        return {
          id: replacementJobId,
          status: "calculating",
          interpretationMode: "adult_natal",
          targetCalculationId: calculationId,
          expectedSourceChecksum: checksum
        };
      }
      if (url === `/charts/calculations/${calculationId}`) {
        return chartCalculationRead(currentResult, [
          "view_current",
          "recalculate",
          "link",
          "publish",
          "ai_draft",
          "pdf"
        ]);
      }
      if (url === `/calculations/${calculationId}`) return savedCalculation(currentResult);
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      throw new Error(`Unexpected GET ${url}`);
    });
    const post = vi.spyOn(application.http, "post").mockResolvedValue({
      status: "calculating",
      jobId: replacementJobId
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => expect(result.current.result?.schemaVersion).toBe("chart-result.v2"));
    expect(result.current.jobState).toBe("failed");

    await act(async () => result.current.onCreateNatalJob());

    expect(post).toHaveBeenCalledWith(
      `/charts/calculations/${calculationId}/recalculate`,
      { expectedResultChecksum: checksum, settings: settings() },
      { csrf: true }
    );
    unmount();
  });

  it("ignores a stale submission completion after the user changes chart mode", async () => {
    window.history.replaceState({}, "", `/chart-engine?clientId=${clientId}`);
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      throw new Error(`Unexpected GET ${url}`);
    });
    const pendingSubmission = deferred<ChartNatalJobCreateResponse>();
    vi.spyOn(application.http, "post").mockReturnValue(pendingSubmission.promise);

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });
    await waitFor(() => expect(result.current.selectedClient?.value).toBe(clientId));

    let submissionPromise: Promise<void> | undefined;
    act(() => {
      submissionPromise = result.current.onCreateNatalJob() as Promise<void>;
    });
    await waitFor(() => expect(result.current.isBusy).toBe(true));
    act(() => result.current.onModeChange("transit"));

    pendingSubmission.resolve(calculatingResponse);
    await act(async () => submissionPromise);

    expect(result.current.mode).toBe("transit");
    expect(result.current.calculationId).toBeNull();
    expect(window.location.search).toContain("mode=transit");
    expect(window.location.search).not.toContain("jobId=");
    unmount();
  });

  it("offers safe authoritative-client recovery for an identity mismatch", async () => {
    const wrongClientId = "77777777-7777-4777-8777-777777777777";
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${wrongClientId}&calculationId=${calculationId}`
    );
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/calculations/${calculationId}`) {
        return chartCalculationRead(natalResult(), ["view_legacy", "recalculate"]);
      }
      if (url === `/calculations/${calculationId}`) return savedCalculation(natalResult());
      if (url === `/clients/${wrongClientId}`) {
        return astrologerClientResponse({
          clientUserId: wrongClientId,
          displayName: "Другой клиент"
        });
      }
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      throw new Error(`Unexpected GET ${url}`);
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => expect(result.current.calculationIdentity.kind).toBe("client_mismatch"));
    expect(result.current.canRecoverCalculationIdentity).toBe(true);

    act(() => result.current.onRecoverCalculationIdentity());

    await waitFor(() => expect(result.current.selectedClient?.value).toBe(clientId));
    expect(result.current.calculationIdentity.kind).toBe("ready");
    expect(result.current.result?.schemaVersion).toBe("chart-result.v1");
    expect(window.location.search).toContain(`clientId=${clientId}`);
    unmount();
  });

  it("keeps a failed poll local and resumes the same job through its explicit retry", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&jobId=${calculatingResponse.jobId}`
    );
    let jobReads = 0;
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/jobs/${calculatingResponse.jobId}`) {
        jobReads += 1;
        if (jobReads === 1) throw new Error("Не удалось проверить статус расчёта");
        return {
          id: calculatingResponse.jobId,
          status: "succeeded",
          interpretationMode: "legacy_unclassified",
          calculationId
        };
      }
      if (url === `/charts/calculations/${calculationId}`) {
        return chartCalculationRead(natalResult(), ["view_legacy", "recalculate"]);
      }
      if (url === `/calculations/${calculationId}`) {
        return savedCalculation(natalResult());
      }
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      throw new Error(`Unexpected GET ${url}`);
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => {
      expect(result.current.pollErrorMessage).toBe("Не удалось проверить статус расчёта");
    });
    expect(result.current.jobState).toBe("failed");
    expect(window.location.search).toContain(`jobId=${calculatingResponse.jobId}`);

    await act(async () => result.current.onRetryPoll());

    await waitFor(() => {
      expect(result.current.result?.schemaVersion).toBe("chart-result.v1");
    });
    expect(jobReads).toBe(2);
    expect(result.current.pollErrorMessage).toBeNull();
    expect(result.current.jobState).toBe("succeeded");
    unmount();
  });

  it("retries only the failed strict result read for the same calculation", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&calculationId=${calculationId}`
    );
    let resultReads = 0;
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/calculations/${calculationId}`) {
        resultReads += 1;
        if (resultReads === 1) throw new Error("Строгий результат временно недоступен");
        return chartCalculationRead(natalResult(), ["view_legacy", "recalculate"]);
      }
      if (url === `/calculations/${calculationId}`) {
        return savedCalculation(natalResult());
      }
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      throw new Error(`Unexpected GET ${url}`);
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => {
      expect(result.current.resultErrorMessage).toBe("Строгий результат временно недоступен");
    });
    expect(result.current.jobState).toBe("failed");

    await act(async () => result.current.onRetryResult());

    await waitFor(() => {
      expect(result.current.result?.schemaVersion).toBe("chart-result.v1");
    });
    expect(resultReads).toBe(2);
    expect(result.current.resultErrorMessage).toBeNull();
    unmount();
  });

  it("retries failed saved-calculation and client reads without querying an empty partner ID", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&calculationId=${calculationId}`
    );
    let savedReads = 0;
    let clientReads = 0;
    const get = vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/calculations/${calculationId}`) {
        return chartCalculationRead(natalResult(), ["view_legacy", "recalculate"]);
      }
      if (url === `/calculations/${calculationId}`) {
        savedReads += 1;
        if (savedReads === 1) throw new Error("Сохранённый расчёт временно недоступен");
        return savedCalculation(natalResult());
      }
      if (url === `/clients/${clientId}`) {
        clientReads += 1;
        if (clientReads === 1) throw new Error("Клиент временно недоступен");
        return astrologerClientResponse();
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => {
      expect(result.current.savedCalculationErrorMessage).toBe(
        "Сохранённый расчёт временно недоступен"
      );
      expect(result.current.clientErrorMessage).toBe("Клиент временно недоступен");
    });

    await act(async () => result.current.onRetrySavedCalculation());

    await waitFor(() => {
      expect(result.current.result?.schemaVersion).toBe("chart-result.v1");
    });
    expect(savedReads).toBe(2);
    expect(clientReads).toBe(2);
    expect(get.mock.calls.some(([url]) => url === "/clients/")).toBe(false);
    unmount();
  });

  it("keeps link failures local and retries the exact current calculation", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&calculationId=${calculationId}`
    );
    const currentResult = natalResultV2();
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/calculations/${calculationId}`) {
        return chartCalculationRead(currentResult, [
          "view_current",
          "recalculate",
          "link",
          "publish",
          "ai_draft",
          "pdf"
        ]);
      }
      if (url === `/calculations/${calculationId}`) {
        return savedCalculation(currentResult);
      }
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      if (url === `/charts/calculations/${calculationId}/report/pdf?locale=ru`) {
        return { job: null, currentResultChecksum: checksum };
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    let linkWrites = 0;
    const post = vi.spyOn(application.http, "post").mockImplementation(async (url) => {
      if (url !== `/calculations/${calculationId}/link-client`) {
        throw new Error(`Unexpected POST ${url}`);
      }
      linkWrites += 1;
      if (linkWrites === 1) throw new Error("Не удалось связать расчёт");
      return linkedSavedCalculation(currentResult);
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });
    await waitFor(() => expect(result.current.result?.schemaVersion).toBe("chart-result.v2"));

    await act(async () => result.current.onLink());

    await waitFor(() => expect(result.current.linkErrorMessage).toBe("Не удалось связать расчёт"));
    expect(result.current.jobState).toBe("succeeded");
    expect(result.current.errorMessage).toBeNull();

    await act(async () => result.current.onRetryLink());

    await waitFor(() => expect(result.current.linkErrorMessage).toBeNull());
    expect(linkWrites).toBe(2);
    expect(post).toHaveBeenLastCalledWith(
      `/calculations/${calculationId}/link-client`,
      { clientId },
      { csrf: true }
    );
    unmount();
  });

  it("keeps PDF read failures local and retries without failing the chart result", async () => {
    window.history.replaceState(
      {},
      "",
      `/chart-engine?clientId=${clientId}&calculationId=${calculationId}`
    );
    const currentResult = natalResultV2();
    let pdfReads = 0;
    vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === `/charts/calculations/${calculationId}`) {
        return chartCalculationRead(currentResult, [
          "view_current",
          "recalculate",
          "link",
          "publish",
          "ai_draft",
          "pdf"
        ]);
      }
      if (url === `/calculations/${calculationId}`) {
        return savedCalculation(currentResult);
      }
      if (url === `/clients/${clientId}`) return astrologerClientResponse();
      if (url === `/charts/calculations/${calculationId}/report/pdf?locale=ru`) {
        pdfReads += 1;
        if (pdfReads === 1) throw new Error("Не удалось загрузить состояние PDF");
        return { job: null, currentResultChecksum: checksum };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const { result, unmount } = renderHook(() => useChartEngineController(), {
      wrapper: chartControllerWrapper()
    });

    await waitFor(() => {
      expect(result.current.pdfErrorMessage).toBe("Не удалось загрузить состояние PDF");
    });
    expect(result.current.jobState).toBe("succeeded");
    expect(result.current.errorMessage).toBeNull();

    await act(async () => result.current.onRetryPdf());

    await waitFor(() => expect(result.current.pdfErrorMessage).toBeNull());
    expect(pdfReads).toBe(2);
    expect(result.current.jobState).toBe("succeeded");
    unmount();
  });
});

describe("chart engine persisted result state", () => {
  it("restores transit mode and selected moment from a loaded calculation", () => {
    expect(restoreChartEngineViewState(transitResult())).toEqual({
      mode: "transit",
      settings: settings(),
      transitMoment: {
        date: "2026-10-25",
        time: "02:30",
        dstOccurrence: "second"
      }
    });
  });

  it("restores synastry mode and partner client id from a loaded calculation", () => {
    expect(restoreChartEngineViewState(synastryResult(), { partnerClientId })).toEqual({
      mode: "synastry",
      settings: settings(),
      partnerClientId
    });
  });

  it("restores composite mode and partner client id from a loaded calculation", () => {
    expect(restoreChartEngineViewState(compositeResult(), { partnerClientId })).toEqual({
      mode: "composite",
      settings: settings(),
      partnerClientId
    });
  });

  it("does not recover a pair participant from result payload without authoritative identity", () => {
    expect(restoreChartEngineViewState(synastryResult())).toEqual({
      mode: "synastry",
      settings: settings()
    });
  });

  it("restores solar return mode and selected year from a loaded calculation", () => {
    expect(restoreChartEngineViewState(solarReturnResult())).toEqual({
      mode: "solar_return",
      settings: settings(),
      solarReturnYear: 2026
    });
  });

  it("restores progression mode and selected target date from a loaded calculation", () => {
    expect(restoreChartEngineViewState(progressionResult())).toEqual({
      mode: "progression",
      settings: settings(),
      progressionTargetDate: "2026-07-23"
    });
  });

  it("restores horary mode and question snapshot from a loaded calculation", () => {
    expect(restoreChartEngineViewState(horaryResult())).toEqual({
      mode: "horary",
      settings: settings(),
      horaryQuestion: horaryQuestion()
    });
  });

  it("restores astrocartography mode from a loaded calculation", () => {
    expect(restoreChartEngineViewState(astrocartographyResult())).toEqual({
      mode: "astrocartography",
      settings: settings()
    });
  });

  it("restores a natal calculation from persisted authority rather than the route", () => {
    expect(
      restoreChartEngineViewState(natalResult(), { interpretationMode: "adult_natal" })
    ).toEqual({
      mode: "natal",
      settings: settings()
    });
    expect(restoreChartEngineViewState(natalResult(), { interpretationMode: "child" })).toEqual({
      mode: "child_chart",
      settings: settings()
    });
  });
});

function settings(): ChartSettings {
  return {
    zodiac: "tropical",
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  };
}

function savedModeSubmissions(): readonly ChartEngineSubmission[] {
  const target = { calculationId, expectedResultChecksum: checksum } as const;
  return [
    { ...target, mode: "natal", clientId, settings: settings() },
    { ...target, mode: "astrocartography", clientId, settings: settings() },
    {
      ...target,
      mode: "transit",
      clientId,
      settings: settings(),
      transit: { date: "2026-08-03", time: "14:30" }
    },
    { ...target, mode: "synastry", clientId, partnerClientId, settings: settings() },
    { ...target, mode: "composite", clientId, partnerClientId, settings: settings() },
    { ...target, mode: "solar_return", clientId, settings: settings(), year: 2027 },
    {
      ...target,
      mode: "progression",
      clientId,
      settings: settings(),
      targetDate: "2026-08-04"
    },
    { ...target, mode: "horary", clientId, settings: settings(), question: horaryQuestion() }
  ];
}

function createChartControllerQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
}

function chartControllerWrapper(queryClient = createChartControllerQueryClient()) {
  return function ChartControllerWrapper({ children }: { readonly children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(I18nProvider, {
        dictionaries: astrologerCopyByLocale,
        initialLocale: "ru",
        storage: null,
        documentElement: null,
        children
      })
    );
  };
}

function astrologerClientResponse(
  overrides: { readonly clientUserId?: string; readonly displayName?: string } = {}
) {
  const responseClientId = overrides.clientUserId ?? clientId;
  return {
    client: {
      clientUserId: responseClientId,
      displayName: overrides.displayName ?? "Марина Краснова",
      relationshipStatus: "active",
      firstLinkedAt: "2026-08-03T12:00:00.000Z",
      lastLinkedAt: "2026-08-03T12:00:00.000Z",
      birthData: {
        id: "66666666-6666-4666-8666-666666666666",
        clientUserId: responseClientId,
        label: "Основные данные",
        birthDate: "1990-07-15",
        birthTime: "10:30",
        birthTimePrecision: "exact",
        birthPlaceText: "Рим, Италия",
        birthCountryCode: "IT",
        birthCity: "Рим",
        birthRegion: "Лацио",
        birthTimezone: "Europe/Rome",
        birthTimeDstOccurrence: null,
        birthLatitude: 41.9028,
        birthLongitude: 12.4964,
        source: "manual",
        isPrimary: true,
        createdAt: "2026-08-03T12:00:00.000Z",
        updatedAt: "2026-08-03T12:00:00.000Z"
      }
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function chartCalculationRead(
  result: ChartResult,
  capabilities: readonly ChartCalculationCapability[],
  interpretationMode: ChartInterpretationMode = interpretationModeForResult(result)
): ChartCalculationRead {
  return {
    calculationId,
    interpretationMode,
    result,
    capabilities: [...capabilities]
  };
}

function savedCalculation(
  result: ChartResult,
  interpretationMode: ChartInterpretationMode = interpretationModeForResult(result)
): CalculationRecordResponse {
  return {
    id: calculationId,
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    module: "chart",
    mode: "individual",
    interpretationMode,
    methodCode: result.method,
    title: "Saved chart",
    status: "calculated",
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: { inputSnapshot: "inputSnapshot" in result ? result.inputSnapshot : null },
    resultData: result,
    resultSummary: { method: result.method },
    resultChecksum: checksum,
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId,
        displayName: "Марина Краснова"
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-08-03T12:00:00.000Z",
    updatedAt: "2026-08-03T12:00:00.000Z"
  };
}

function interpretationModeForResult(result: ChartResult): ChartInterpretationMode {
  return result.schemaVersion === "chart-result.v2" && result.method === "natal"
    ? "adult_natal"
    : "legacy_unclassified";
}

function linkedSavedCalculation(result: ChartResult): CalculationRecordResponse {
  return {
    ...savedCalculation(result),
    status: "linked",
    links: [
      {
        clientId,
        visibility: "private_to_astrologer",
        linkedAt: "2026-08-03T12:05:00.000Z",
        publishedAt: null
      }
    ]
  };
}

function natalResultV2(): Extract<
  ChartResult,
  { readonly schemaVersion: "chart-result.v2"; readonly method: "natal" }
> {
  return {
    schemaVersion: "chart-result.v2",
    method: "natal",
    methodVersion: chartMethodVersions.natal,
    provider: {
      name: "kerykeion",
      version: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      ephemeris: "moshier",
      ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      ephemerisDataRevision: null
    },
    reproducibilityFingerprint: `sha256:${"c".repeat(64)}`,
    settings: settings(),
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    result: {
      ...emptyRenderResult(),
      distributions: {
        elements: { fire: 10, earth: 0, air: 0, water: 0 },
        modalities: { cardinal: 10, fixed: 0, mutable: 0 },
        polarity: { masculine: 10, feminine: 0 }
      }
    }
  };
}

function natalResult(): StoredChartNatalCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    result: emptyRenderResult()
  };
}

function transitResult(): StoredChartCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "transit",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    transitSnapshot: {
      date: "2026-10-25",
      time: "02:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      dstOccurrence: "second"
    },
    result: {
      natal: emptyRenderResult(),
      transit: emptyRenderResult(),
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function synastryResult(): StoredChartSynastryCalculationPayload {
  const natal = emptyRenderResult();

  return {
    schemaVersion: "chart-result.v1",
    method: "synastry",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    partnerInputSnapshot: {
      birthDate: "1992-08-11",
      birthTime: "08:15",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173,
      birthTimePrecision: "exact"
    },
    relationshipSnapshot: {
      primaryClientId: clientId,
      partnerClientId: "55555555-5555-4555-8555-555555555555"
    },
    result: {
      primary: natal,
      partner: natal,
      aspectsBetween: [],
      houseOverlays: [],
      warnings: []
    }
  };
}

function compositeResult(): StoredChartCompositeCalculationPayload {
  const synastry = synastryResult();

  return {
    schemaVersion: "chart-result.v1",
    method: "composite",
    provider: synastry.provider,
    settings: synastry.settings,
    inputSnapshot: synastry.inputSnapshot,
    partnerInputSnapshot: synastry.partnerInputSnapshot,
    relationshipSnapshot: synastry.relationshipSnapshot,
    result: emptyRenderResult()
  };
}

function solarReturnResult(): StoredChartSolarReturnCalculationPayload {
  const natal = emptyRenderResult();

  return {
    schemaVersion: "chart-result.v1",
    method: "solar_return",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: natalResult().inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar",
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      },
      resolvedAt: "2026-07-15T01:20:01.000Z"
    },
    result: {
      natal,
      solarReturn: natal,
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function progressionResult(): StoredChartProgressionCalculationPayload {
  const natal = emptyRenderResult();

  return {
    schemaVersion: "chart-result.v1",
    method: "progression",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: natalResult().inputSnapshot,
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary",
      calculationBasis: {
        symbolicDate: "1990-08-20",
        ageDays: 36,
        dayForYearRatio: 1
      }
    },
    result: {
      natal,
      progressed: natal,
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function horaryResult(): StoredChartHoraryCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "horary",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    questionSnapshot: horaryQuestion(),
    result: emptyRenderResult()
  };
}

function astrocartographyResult(): StoredChartAstrocartographyCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "astrocartography",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: natalResult().inputSnapshot,
    result: {
      lines: [
        {
          id: "sun_mc",
          point: "sun",
          angle: "mc",
          label: "Солнце MC",
          path: [
            { latitude: -66, longitude: 10 },
            { latitude: 66, longitude: 10 }
          ]
        }
      ],
      warnings: []
    }
  };
}

function horaryQuestion(): ChartHoraryQuestionSnapshot {
  return {
    question: "Стоит ли принимать предложение?",
    category: "career",
    date: "2026-07-23",
    time: "14:30",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173,
    dstOccurrence: "first"
  };
}

function emptyRenderResult(): StoredChartCalculationPayload["result"] extends infer Result
  ? Result extends { readonly natal: infer Render }
    ? Render
    : never
  : never {
  return {
    points: [
      "sun",
      "moon",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto",
      "ascendant",
      "midheaven",
      "north_node",
      "south_node"
    ].map((id, index) => ({
      id,
      label: id,
      longitude: index * 20,
      sign: "aries",
      signDegree: index,
      house: index < 12 ? index + 1 : null,
      retrograde: false
    })),
    houses: Array.from({ length: 12 }, (_, index) => ({
      number: index + 1,
      longitude: index * 30,
      sign: "aries",
      signDegree: 0
    })),
    aspects: [],
    distributions: {
      elements: { fire: 0, earth: 0, air: 0, water: 0 },
      modalities: { cardinal: 0, fixed: 0, mutable: 0 },
      polarity: { masculine: 0, feminine: 0 }
    },
    warnings: []
  };
}
