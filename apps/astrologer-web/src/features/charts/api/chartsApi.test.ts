import { afterEach, describe, expect, it, vi } from "vitest";
import { chartMethodVersions, type ChartNatalJobCreateResponse } from "@elevenhouse/contracts";
import { application } from "../../../Application";
import {
  createAstrocartographyChartJob,
  createHoraryChartJob,
  createCompositeChartJob,
  createChartAiDraft,
  createChartAiDraftIdempotencyKey,
  createNatalChartJob,
  createProgressionChartJob,
  createSolarReturnChartJob,
  createSynastryChartJob,
  createTransitChartJob,
  downloadChartPdf,
  enqueueChartPdf,
  getChartCalculation,
  getChartJob,
  getLatestChartPdf,
  recalculateChart
} from "./chartsApi";

const clientId = "22222222-2222-4222-8222-222222222222";
const partnerClientId = "55555555-5555-4555-8555-555555555555";
const jobId = "33333333-3333-4333-8333-333333333333";
const calculationId = "44444444-4444-4444-8444-444444444444";
const createResponse = {
  status: "calculating",
  jobId
} satisfies ChartNatalJobCreateResponse;
const checksum = `sha256:${"a".repeat(64)}`;
const now = "2026-07-22T00:00:00.000Z";

describe("chartsApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates natal jobs with client id, interpretation authority and settings only", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      createNatalChartJob({
        clientId,
        interpretationMode: "adult_natal",
        birthDate: "1990-07-15",
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      "/charts/natal/jobs",
      {
        clientId,
        interpretationMode: "adult_natal",
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      },
      { csrf: true }
    );
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain("birthDate");
  });

  it("sends explicit child interpretation authority through the natal endpoint", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      createNatalChartJob({
        clientId,
        interpretationMode: "child",
        settings: chartSettings()
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      "/charts/natal/jobs",
      { clientId, interpretationMode: "child", settings: chartSettings() },
      { csrf: true }
    );
  });

  it("rejects a legacy immediate result from a new chart job instead of treating it as current", async () => {
    vi.spyOn(application.http, "post").mockResolvedValue({
      status: "succeeded",
      calculationId,
      result: chartPayload().result
    });

    await expect(
      createNatalChartJob({
        clientId,
        interpretationMode: "adult_natal",
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).rejects.toThrow();
  });

  it("binds every create endpoint to its expected immediate result method", async () => {
    vi.spyOn(application.http, "post").mockResolvedValue({
      status: "succeeded",
      calculationId,
      result: currentNatalResult()
    });

    await expect(
      createNatalChartJob({
        clientId,
        interpretationMode: "adult_natal",
        settings: chartSettings()
      })
    ).resolves.toMatchObject({ status: "succeeded", calculationId });

    for (const createWrongMethodJob of [
      () =>
        createTransitChartJob({
          clientId,
          settings: chartSettings(),
          transit: { date: "2026-08-03", time: "14:30" }
        }),
      () =>
        createSynastryChartJob({
          clientId,
          partnerClientId,
          settings: chartSettings()
        }),
      () =>
        createCompositeChartJob({
          clientId,
          partnerClientId,
          settings: chartSettings()
        }),
      () => createSolarReturnChartJob({ clientId, year: 2026, settings: chartSettings() }),
      () =>
        createProgressionChartJob({
          clientId,
          targetDate: "2026-08-03",
          settings: chartSettings()
        }),
      () =>
        createHoraryChartJob({
          clientId,
          settings: chartSettings(),
          question: {
            question: "Стоит ли принимать предложение?",
            category: "career",
            date: "2026-08-03",
            time: "14:30",
            timezone: "Europe/Moscow",
            latitude: 55.7558,
            longitude: 37.6173
          }
        }),
      () => createAstrocartographyChartJob({ clientId, settings: chartSettings() })
    ]) {
      await expect(createWrongMethodJob()).rejects.toThrow("CHART_SUBMISSION_METHOD_MISMATCH");
    }
  });

  it("creates chart AI drafts with checksum only and CSRF protection", async () => {
    const response = calculationRecordResponse();
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);

    await expect(
      createChartAiDraft({
        calculationId,
        idempotencyKey: "charts:ai-draft:test-command",
        body: { expectedResultChecksum: checksum }
      })
    ).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      `/charts/calculations/${calculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      {
        csrf: true,
        headers: { "idempotency-key": "charts:ai-draft:test-command" }
      }
    );
  });

  it("keeps one chart AI command key stable across a transport retry", async () => {
    const response = calculationRecordResponse();
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);
    const idempotencyKey = createChartAiDraftIdempotencyKey(
      () => "11111111-1111-4111-8111-111111111111"
    );
    const input = {
      calculationId,
      idempotencyKey,
      body: { expectedResultChecksum: checksum }
    };

    await createChartAiDraft(input);
    await createChartAiDraft(input);

    expect(idempotencyKey).toBe("charts:ai-draft:11111111-1111-4111-8111-111111111111");
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0]?.[2]).toEqual(post.mock.calls[1]?.[2]);
  });

  it("does not expose a child chart job endpoint because child chart reuses natal calculations", () => {
    expect(Object.keys({ createNatalChartJob })).toEqual(["createNatalChartJob"]);
    expect(createNatalChartJob.name).toBe("createNatalChartJob");
  });

  it("creates transit jobs with client id, settings and transit moment only", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      createTransitChartJob({
        clientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        transit: {
          date: "2026-07-22",
          time: "14:30"
        },
        birthDate: "1990-07-15"
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      "/charts/transits/jobs",
      {
        clientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        transit: {
          date: "2026-07-22",
          time: "14:30"
        }
      },
      { csrf: true }
    );
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain("birthDate");
  });

  it("creates synastry jobs with two client ids and settings only", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      createSynastryChartJob({
        clientId,
        partnerClientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        birthDate: "1990-07-15",
        partnerBirthDate: "1992-08-11"
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      "/charts/synastry/jobs",
      {
        clientId,
        partnerClientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      },
      { csrf: true }
    );
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain("birthDate");
  });

  it("creates composite jobs with two client ids and settings only", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      createCompositeChartJob({
        clientId,
        partnerClientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        birthDate: "1990-07-15",
        partnerBirthDate: "1992-08-11"
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      "/charts/composite/jobs",
      {
        clientId,
        partnerClientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      },
      { csrf: true }
    );
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain("birthDate");
  });

  it("creates solar return jobs with client id, target year and settings only", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      createSolarReturnChartJob({
        clientId,
        year: 2026,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        birthDate: "1990-07-15"
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      "/charts/solar-return/jobs",
      {
        clientId,
        year: 2026,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      },
      { csrf: true }
    );
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain("birthDate");
  });

  it("creates progression jobs with client id, target date and settings only", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      createProgressionChartJob({
        clientId,
        targetDate: "2026-07-23",
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        birthDate: "1990-07-15"
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      "/charts/progressions/jobs",
      {
        clientId,
        targetDate: "2026-07-23",
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      },
      { csrf: true }
    );
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain("birthDate");
  });

  it("creates horary jobs with client id, private question snapshot and settings only", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      createHoraryChartJob({
        clientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        question: {
          question: "Стоит ли принимать предложение?",
          category: "career",
          date: "2026-07-23",
          time: "14:30",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173
        },
        birthDate: "1990-07-15"
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      "/charts/horary/jobs",
      {
        clientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        question: {
          question: "Стоит ли принимать предложение?",
          category: "career",
          date: "2026-07-23",
          time: "14:30",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173
        }
      },
      { csrf: true }
    );
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain("birthDate");
  });

  it("creates astrocartography jobs with client id and settings only", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      createAstrocartographyChartJob({
        clientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        birthDate: "1990-07-15"
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      "/charts/astrocartography/jobs",
      {
        clientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      },
      { csrf: true }
    );
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain("birthDate");
  });

  it("loads chart job and calculation through shared response contracts", async () => {
    vi.spyOn(application.http, "get")
      .mockResolvedValueOnce({
        id: jobId,
        status: "calculating",
        interpretationMode: "legacy_unclassified"
      })
      .mockResolvedValueOnce(chartPayload());

    await expect(getChartJob(jobId)).resolves.toMatchObject({ id: jobId, status: "calculating" });
    await expect(getChartCalculation(calculationId)).resolves.toMatchObject({
      calculationId,
      capabilities: ["view_legacy", "recalculate"],
      result: { schemaVersion: "chart-result.v1" }
    });

    expect(application.http.get).toHaveBeenNthCalledWith(1, `/charts/jobs/${jobId}`, {
      cache: "no-store"
    });
  });

  it("rejects a calculation read whose response id differs from the requested id", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({
      ...chartPayload(),
      calculationId: "66666666-6666-4666-8666-666666666666"
    });

    await expect(getChartCalculation(calculationId)).rejects.toThrow(
      "CHART_CALCULATION_ID_MISMATCH"
    );
  });

  it("recalculates an existing chart through the calculation-scoped CSRF route", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      recalculateChart({
        calculationId,
        expectedResultChecksum: checksum,
        expectedMethod: "natal",
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major_minor",
          orbMultiplier: 1
        }
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      `/charts/calculations/${calculationId}/recalculate`,
      {
        expectedResultChecksum: checksum,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major_minor",
          orbMultiplier: 1
        }
      },
      { csrf: true }
    );
  });

  it("recalculates with the expected checksum only when settings are unchanged", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      recalculateChart({
        calculationId,
        expectedResultChecksum: checksum,
        expectedMethod: "natal"
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      `/charts/calculations/${calculationId}/recalculate`,
      { expectedResultChecksum: checksum },
      { csrf: true }
    );
  });

  it("rejects an immediate recalculation response for another id or method", async () => {
    const post = vi.spyOn(application.http, "post");
    post.mockResolvedValueOnce({
      status: "succeeded",
      calculationId: "66666666-6666-4666-8666-666666666666",
      result: currentNatalResult()
    });

    await expect(
      recalculateChart({
        calculationId,
        expectedResultChecksum: checksum,
        expectedMethod: "natal"
      })
    ).rejects.toThrow("CHART_SUBMISSION_CALCULATION_ID_MISMATCH");

    post.mockResolvedValueOnce({
      status: "succeeded",
      calculationId,
      result: currentNatalResult()
    });

    await expect(
      recalculateChart({
        calculationId,
        expectedResultChecksum: checksum,
        expectedMethod: "transit"
      })
    ).rejects.toThrow("CHART_SUBMISSION_METHOD_MISMATCH");
  });

  it("loads, enqueues and downloads chart PDFs through calculation-scoped routes", async () => {
    const pdf = pdfResponse("queued");
    const download = {
      url: "https://objects.example.test/private/chart.pdf?signature=signed",
      expiresAt: now
    };
    const get = vi
      .spyOn(application.http, "get")
      .mockResolvedValueOnce(pdf)
      .mockResolvedValueOnce(download);
    const post = vi.spyOn(application.http, "post").mockResolvedValue(pdf);

    await expect(getLatestChartPdf({ calculationId, locale: "en" })).resolves.toEqual(pdf);
    await expect(
      enqueueChartPdf({
        calculationId,
        body: { expectedResultChecksum: checksum, locale: "ru" }
      })
    ).resolves.toEqual(pdf);
    await expect(downloadChartPdf({ calculationId, jobId })).resolves.toEqual(download);

    expect(get).toHaveBeenNthCalledWith(
      1,
      `/charts/calculations/${calculationId}/report/pdf?locale=en`
    );
    expect(post).toHaveBeenCalledWith(
      `/charts/calculations/${calculationId}/report/pdf`,
      { expectedResultChecksum: checksum, locale: "ru" },
      { csrf: true }
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      `/charts/calculations/${calculationId}/report/pdf/${jobId}/download`
    );
  });
});

function chartPayload() {
  return {
    calculationId,
    interpretationMode: "legacy_unclassified" as const,
    result: {
      schemaVersion: "chart-result.v1",
      method: "natal",
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings: {
        zodiac: "tropical",
        houseSystem: "placidus",
        nodeType: "true",
        aspectPreset: "major",
        orbMultiplier: 1
      },
      inputSnapshot: {
        birthDate: "1990-07-15",
        birthTime: "10:30",
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964,
        birthTimePrecision: "exact"
      },
      result: {
        points: completePoints(),
        houses: completeHouses(),
        aspects: [],
        distributions: {
          elements: { fire: 3, earth: 2, air: 3, water: 2 },
          modalities: { cardinal: 4, fixed: 3, mutable: 3 },
          polarity: { masculine: 6, feminine: 4 }
        },
        warnings: []
      }
    },
    capabilities: ["view_legacy", "recalculate"]
  };
}

function chartSettings() {
  return {
    zodiac: "tropical" as const,
    houseSystem: "placidus" as const,
    nodeType: "true" as const,
    aspectPreset: "major" as const,
    orbMultiplier: 1
  };
}

function currentNatalResult() {
  return {
    schemaVersion: "chart-result.v2" as const,
    method: "natal" as const,
    methodVersion: chartMethodVersions.natal,
    provider: {
      name: "kerykeion" as const,
      version: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      ephemeris: "moshier" as const,
      ephemerisFlags: ["FLG_MOSEPH" as const, "FLG_SPEED" as const],
      ephemerisDataRevision: null
    },
    reproducibilityFingerprint: `sha256:${"c".repeat(64)}`,
    settings: chartSettings(),
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact" as const
    },
    result: {
      points: completePoints(),
      houses: completeHouses(),
      aspects: [],
      distributions: {
        elements: { fire: 3, earth: 2, air: 3, water: 2 },
        modalities: { cardinal: 4, fixed: 3, mutable: 3 },
        polarity: { masculine: 6, feminine: 4 }
      },
      warnings: []
    }
  };
}

function calculationRecordResponse() {
  return {
    id: calculationId,
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    module: "chart",
    mode: "individual",
    interpretationMode: "adult_natal",
    methodCode: "natal",
    title: "QA Natal",
    status: "calculated",
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: { method: "natal" },
    resultData: chartPayload().result,
    resultSummary: { method: "natal" },
    resultChecksum: checksum,
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId,
        displayName: "QA Missing Birth Data"
      }
    ],
    links: [],
    interpretations: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        status: "draft",
        text: "OVERVIEW\nDraft"
      }
    ],
    artifacts: [],
    createdAt: now,
    updatedAt: now
  };
}

function completePoints() {
  return [
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
    signDegree: index % 29,
    house: index < 12 ? index + 1 : null,
    retrograde: false
  }));
}

function completeHouses() {
  return Array.from({ length: 12 }, (_, index) => ({
    number: index + 1,
    longitude: index * 30,
    sign: "aries",
    signDegree: 0
  }));
}

function pdfResponse(status: "queued" | "processing" | "ready" | "failed") {
  return {
    job: {
      id: jobId,
      calculationId,
      resultChecksum: checksum,
      locale: "en",
      status,
      artifactId: null,
      mediaAssetId: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now
    },
    currentResultChecksum: checksum
  };
}
