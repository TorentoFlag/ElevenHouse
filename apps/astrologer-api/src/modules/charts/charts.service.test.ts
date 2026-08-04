import { HttpException, Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chartMethodVersions, type ReproducibleChartResult } from "@elevenhouse/contracts";
import {
  buildChartResultReproducibilityFingerprint,
  canonicalChartAiConsentNoticeHashes,
  currentChartAiConsentPolicy,
  sha256CanonicalJson,
  type CanonicalJson
} from "@elevenhouse/domain";
import type {
  AstrologerProfileStore,
  CalculationRecord,
  CalculationStore,
  ChartAiDraftCommandStore,
  ChartCalculationCommandStore,
  ChartCalculationJobStore,
  ClientConsentStore,
  ClientBirthData,
  ClientStore,
  DictionaryStore
} from "@elevenhouse/domain";
import type { AiGenerationService } from "../ai/ai-generation.service";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ChartsService } from "./charts.service";

const now = new Date("2026-07-20T12:00:00.000Z");
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const partnerClientId = "44444444-4444-4444-8444-444444444444";
const consentId = "55555555-5555-4555-8555-555555555555";
const aiDraftCommandId = "66666666-6666-4666-8666-666666666666";
const aiDraftIdempotencyKey = "charts:ai-draft:test-command";
const executionProfile = {
  provider: "kerykeion" as const,
  kerykeionVersion: "5.12.9" as const,
  pyswissephVersion: "2.10.3.2" as const,
  expectedEphemeris: "moshier" as const,
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"] as const,
  expectedEphemerisDataRevision: null
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChartsService", () => {
  it("observes every chart creation method through one safe outcome contract", async () => {
    const logger = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const service = createService();
    const privateQuestion = "PRIVATE_HORARY_QUESTION_DO_NOT_LOG";
    const commands = [
      {
        method: "natal",
        run: () =>
          service.createNatalJob(
            { clientId, interpretationMode: "adult_natal", settings: settings() },
            request()
          )
      },
      {
        method: "transit",
        run: () =>
          service.createTransitJob(
            {
              clientId,
              settings: settings(),
              transit: { date: "2026-08-03", time: "12:00" }
            },
            request()
          )
      },
      {
        method: "astrocartography",
        run: () => service.createAstrocartographyJob({ clientId, settings: settings() }, request())
      },
      {
        method: "synastry",
        run: () =>
          service.createSynastryJob({ clientId, partnerClientId, settings: settings() }, request())
      },
      {
        method: "composite",
        run: () =>
          service.createCompositeJob({ clientId, partnerClientId, settings: settings() }, request())
      },
      {
        method: "solar_return",
        run: () =>
          service.createSolarReturnJob({ clientId, year: 2026, settings: settings() }, request())
      },
      {
        method: "progression",
        run: () =>
          service.createProgressionJob(
            { clientId, targetDate: "2026-08-03", settings: settings() },
            request()
          )
      },
      {
        method: "horary",
        run: () =>
          service.createHoraryJob(
            {
              clientId,
              question: { ...horaryQuestion(), question: privateQuestion },
              settings: settings()
            },
            request()
          )
      }
    ] as const;

    for (const command of commands) await command.run();

    const records = logger.mock.calls.map(([record]) => record);
    expect(records).toEqual(
      commands.map(({ method }) => ({
        durationMs: expect.any(Number),
        event: "chart_job_command_completed",
        jobId,
        method,
        operation: "create",
        outcome: "active_job"
      }))
    );
    const serialized = JSON.stringify(records);
    for (const sensitive of [privateQuestion, "1990-07-15", "Europe/Rome", "41.9028", "12.4964"]) {
      expect(serialized).not.toContain(sensitive);
    }
    logger.mockRestore();
  });

  it("distinguishes an immediate calculation reuse without logging chart payloads", async () => {
    const logger = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const calculationId = "77777777-7777-4777-8777-777777777777";
    const result = natalChartResultV2();
    const service = createService({
      commandStore: createCommandStore({
        outcome: { kind: "existing_result", calculationId, result }
      })
    });

    await service.createNatalJob(
      { clientId, interpretationMode: "adult_natal", settings: settings() },
      request()
    );

    expect(logger).toHaveBeenCalledWith({
      calculationId,
      durationMs: expect.any(Number),
      event: "chart_job_command_completed",
      method: "natal",
      operation: "create",
      outcome: "reused_result"
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("1990-07-15");
    logger.mockRestore();
  });

  it("returns 400 for non-canonical uppercase client UUIDs before CRM or persistence", async () => {
    const clientStore = createClientStore();
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await expect(
      service.createNatalJob(
        {
          clientId: "22222222-2222-4222-8222-22222222222A",
          interpretationMode: "adult_natal",
          settings: settings()
        },
        request()
      )
    ).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code: "CHART_VALIDATION_FAILED" })
    });
    expect(clientStore.getAstrologerClient).not.toHaveBeenCalled();
    expect(commandStore.createOrReuseNatalJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("hydrates birth data from CRM and never accepts browser birth data", async () => {
    const clientStore = createClientStore();
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createNatalJob(
      {
        clientId,
        interpretationMode: "adult_natal",
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(commandStore.createOrReuseNatalJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        clientId,
        ...v2Envelope("natal", [{ role: "subject", clientId }]),
        inputSnapshot: expect.objectContaining({ birthDate: "1990-07-15" })
      })
    );
  });

  it("creates transit jobs with resolved natal-backed transit snapshot", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createTransitJob(
      {
        clientId,
        settings: settings(),
        transit: {
          date: "2026-07-22",
          time: "14:30"
        }
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "transit",
        ownerUserId,
        clientId,
        ...v2Envelope("transit", [{ role: "subject", clientId }]),
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          transitSnapshot: {
            date: "2026-07-22",
            time: "14:30",
            timezone: "Europe/Rome",
            latitude: 41.9028,
            longitude: 12.4964
          }
        }
      })
    );
  });

  it("allows an explicit transit timezone and coordinates", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createTransitJob(
      {
        clientId,
        settings: settings(),
        transit: {
          date: "2026-07-22",
          time: "14:30",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173
        }
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        inputSnapshot: expect.objectContaining({
          transitSnapshot: {
            date: "2026-07-22",
            time: "14:30",
            timezone: "Europe/Moscow",
            latitude: 55.7558,
            longitude: 37.6173
          }
        })
      })
    );
  });

  it("persists the selected repeated-hour occurrence in the durable transit snapshot", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createTransitJob(
      {
        clientId,
        settings: settings(),
        transit: {
          date: "2026-10-25",
          time: "02:30",
          timezone: "Europe/Rome",
          dstOccurrence: "second"
        }
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        inputSnapshot: expect.objectContaining({
          transitSnapshot: expect.objectContaining({
            date: "2026-10-25",
            time: "02:30",
            timezone: "Europe/Rome",
            dstOccurrence: "second"
          })
        })
      })
    );
  });

  it("creates synastry jobs from two owner-scoped CRM birth data snapshots", async () => {
    const clientStore = createClientStore({
      clients: {
        [clientId]: readyBirthData({ clientUserId: clientId, birthDate: "1990-07-15" }),
        [partnerClientId]: readyBirthData({
          clientUserId: partnerClientId,
          birthDate: "1992-08-11",
          birthTime: "08:15",
          birthTimezone: "Europe/Moscow",
          birthLatitude: 55.7558,
          birthLongitude: 37.6173
        })
      }
    });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createSynastryJob(
      {
        clientId,
        partnerClientId,
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: partnerClientId
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "synastry",
        ownerUserId,
        clientId,
        ...v2Envelope("synastry", [
          { role: "subject", clientId },
          { role: "partner", clientId: partnerClientId }
        ]),
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          partnerInputSnapshot: expect.objectContaining({
            birthDate: "1992-08-11",
            timezone: "Europe/Moscow"
          })
        }
      })
    );
    const synastryProviderInput = vi.mocked(commandStore.createOrReuseChartJobAndRequestCalculation)
      .mock.calls[0]?.[0].inputSnapshot;
    expect(JSON.stringify(synastryProviderInput)).not.toContain(clientId);
    expect(JSON.stringify(synastryProviderInput)).not.toContain(partnerClientId);
  });

  it("creates composite jobs from two owner-scoped CRM birth data snapshots", async () => {
    const clientStore = createClientStore({
      clients: {
        [clientId]: readyBirthData({ clientUserId: clientId, birthDate: "1990-07-15" }),
        [partnerClientId]: readyBirthData({
          clientUserId: partnerClientId,
          birthDate: "1992-08-11",
          birthTime: "08:15",
          birthTimezone: "Europe/Moscow",
          birthLatitude: 55.7558,
          birthLongitude: 37.6173
        })
      }
    });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createCompositeJob(
      {
        clientId,
        partnerClientId,
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: partnerClientId
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "composite",
        ownerUserId,
        clientId,
        ...v2Envelope("composite", [
          { role: "subject", clientId },
          { role: "partner", clientId: partnerClientId }
        ]),
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          partnerInputSnapshot: expect.objectContaining({
            birthDate: "1992-08-11",
            timezone: "Europe/Moscow"
          })
        }
      })
    );
    const compositeProviderInput = vi.mocked(
      commandStore.createOrReuseChartJobAndRequestCalculation
    ).mock.calls[0]?.[0].inputSnapshot;
    expect(JSON.stringify(compositeProviderInput)).not.toContain(clientId);
    expect(JSON.stringify(compositeProviderInput)).not.toContain(partnerClientId);
  });

  it("creates solar return jobs with natal-backed return location", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createSolarReturnJob(
      {
        clientId,
        year: 2026,
        settings: settings()
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "solar_return",
        ownerUserId,
        clientId,
        ...v2Envelope("solar_return", [{ role: "subject", clientId }]),
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          solarReturnSnapshot: {
            year: 2026,
            returnType: "solar",
            location: {
              timezone: "Europe/Rome",
              latitude: 41.9028,
              longitude: 12.4964
            }
          }
        }
      })
    );
  });

  it("creates secondary progression jobs from the owner-scoped CRM birth data snapshot", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createProgressionJob(
      {
        clientId,
        targetDate: "2026-07-23",
        settings: settings()
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "progression",
        ownerUserId,
        clientId,
        ...v2Envelope("progression", [{ role: "subject", clientId }]),
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          progressionSnapshot: {
            targetDate: "2026-07-23",
            progressionType: "secondary"
          }
        }
      })
    );
  });

  it("creates horary jobs from a private question snapshot without requiring birth data", async () => {
    const clientStore = createClientStore({ birthData: null });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createHoraryJob(
      {
        clientId,
        question: horaryQuestion(),
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "horary",
        ownerUserId,
        clientId,
        ...v2Envelope("horary", [{ role: "subject", clientId }]),
        inputSnapshot: {
          questionSnapshot: horaryQuestion()
        },
        settingsSnapshot: expect.objectContaining(settings())
      })
    );
  });

  it("creates astrocartography jobs from owner-scoped CRM birth data", async () => {
    const clientStore = createClientStore();
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createAstrocartographyJob(
      {
        clientId,
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "astrocartography",
        ownerUserId,
        clientId,
        ...v2Envelope("astrocartography", [{ role: "subject", clientId }]),
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            birthTime: "10:30",
            timezone: "Europe/Rome"
          })
        },
        settingsSnapshot: expect.objectContaining(settings())
      })
    );
  });

  it("rejects browser-supplied birth data in astrocartography job requests", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await expect(
      service.createAstrocartographyJob(
        {
          clientId,
          birthDate: "1988-01-01",
          settings: settings()
        },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_VALIDATION_FAILED" })
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("reuses an existing astrocartography calculation result for an identical request", async () => {
    const calculationId = "77777777-7777-4777-8777-777777777777";
    const result = toV2ChartResult(astrocartographyResult());
    const commandStore = createCommandStore({
      outcome: { kind: "existing_result", calculationId, result }
    });
    const jobStore = createJobStore({
      result: astrocartographyResult()
    });
    const service = createService({ commandStore, jobStore });

    await expect(
      service.createAstrocartographyJob(
        {
          clientId,
          settings: settings()
        },
        request()
      )
    ).resolves.toMatchObject({
      status: "succeeded",
      calculationId,
      result: { method: "astrocartography" }
    });
    expect(jobStore.getOwnerScopedResult).not.toHaveBeenCalled();
  });

  it("reuses an existing solar return calculation result for an identical request", async () => {
    const calculationId = "77777777-7777-4777-8777-777777777777";
    const result = toV2ChartResult(solarReturnResult());
    const commandStore = createCommandStore({
      outcome: { kind: "existing_result", calculationId, result }
    });
    const jobStore = createJobStore({
      result: solarReturnResult()
    });
    const service = createService({ commandStore, jobStore });

    await expect(
      service.createSolarReturnJob(
        {
          clientId,
          year: 2026,
          settings: settings()
        },
        request()
      )
    ).resolves.toMatchObject({
      status: "succeeded",
      calculationId,
      result: { method: "solar_return" }
    });
    expect(jobStore.getOwnerScopedResult).not.toHaveBeenCalled();
  });

  it("returns a valid persisted v2 result on immediate reuse", async () => {
    const calculationId = "77777777-7777-4777-8777-777777777777";
    const result = natalChartResultV2();
    const commandStore = createCommandStore({
      outcome: { kind: "existing_result", calculationId, result }
    });
    const jobStore = createJobStore({ result: { corrupt: true } });
    const service = createService({ commandStore, jobStore });

    await expect(
      service.createNatalJob(
        { clientId, interpretationMode: "adult_natal", settings: settings() },
        request()
      )
    ).resolves.toMatchObject({
      status: "succeeded",
      calculationId,
      result: { schemaVersion: "chart-result.v2", method: "natal" }
    });
    expect(jobStore.getOwnerScopedResult).not.toHaveBeenCalled();
  });

  it("does not deduplicate same-owner clients with identical birth data", async () => {
    const secondClientId = "66666666-6666-4666-8666-666666666666";
    const clientStore = createClientStore({
      clients: {
        [clientId]: readyBirthData({ clientUserId: clientId }),
        [secondClientId]: readyBirthData({ clientUserId: secondClientId })
      }
    });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createNatalJob(
      { clientId, interpretationMode: "adult_natal", settings: settings() },
      request()
    );
    await service.createNatalJob(
      { clientId: secondClientId, interpretationMode: "adult_natal", settings: settings() },
      request()
    );

    const calls = vi.mocked(commandStore.createOrReuseNatalJobAndRequestCalculation).mock.calls;
    expect(calls[0]?.[0].inputFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(calls[1]?.[0].inputFingerprint).not.toBe(calls[0]?.[0].inputFingerprint);
  });

  it("rejects synastry jobs for the same client", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await expect(
      service.createSynastryJob(
        { clientId, partnerClientId: clientId, settings: settings() },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_SYNASTRY_PARTNER_REQUIRED" })
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("rejects composite jobs for the same client", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await expect(
      service.createCompositeJob(
        { clientId, partnerClientId: clientId, settings: settings() },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_COMPOSITE_PARTNER_REQUIRED" })
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("rejects synastry jobs when the partner has no birth data", async () => {
    const clientStore = createClientStore({
      clients: {
        [clientId]: readyBirthData({ clientUserId: clientId }),
        [partnerClientId]: null
      }
    });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await expect(
      service.createSynastryJob({ clientId, partnerClientId, settings: settings() }, request())
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_PARTNER_CLIENT_NOT_FOUND" })
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("maps unknown birth time to an actionable validation error", async () => {
    const clientStore = createClientStore({
      birthData: { ...readyBirthData(), birthTime: null, birthTimePrecision: "unknown" }
    });
    const service = createService({ clientStore });

    await expect(
      service.createNatalJob(
        { clientId, interpretationMode: "adult_natal", settings: settings() },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_BIRTH_TIME_REQUIRED" })
    });
  });

  it.each([
    ["ru" as const, "Не удалось рассчитать карту после нескольких попыток"],
    ["en" as const, "Chart calculation failed after multiple attempts"]
  ])(
    "maps an allowlisted failed-job code to fixed %s copy without exposing persisted diagnostics",
    async (locale, expectedMessage) => {
      const persistedDiagnostic =
        "SELECT secret FROM clients WHERE email = 'anton.private@example.com'";
      const jobStore = createJobStore({
        job: {
          id: jobId,
          ownerUserId,
          clientId,
          resultCalculationId: null,
          targetCalculationId: null,
          expectedSourceChecksum: null,
          method: "natal",
          interpretationMode: "adult_natal",
          status: "failed",
          inputFingerprint: "sha256:test",
          lastErrorCode: "retry_exhausted",
          lastErrorMessage: persistedDiagnostic
        }
      });
      const service = createService({ jobStore, locale });

      const response = await service.getJob(jobId, request());

      expect(response).toMatchObject({
        id: jobId,
        status: "failed",
        calculationId: null,
        failureCode: "retry_exhausted",
        failureMessage: expectedMessage
      });
      expect(JSON.stringify(response)).not.toContain(persistedDiagnostic);
      expect(JSON.stringify(response)).not.toContain("anton.private@example.com");
    }
  );

  it.each(["postgres_unique_violation_private", "constructor"])(
    "maps untrusted persisted failure code %s and SQL/PII message to a generic public failure",
    async (persistedCode) => {
      const persistedDiagnostic =
        "duplicate key for client anton.private@example.com; SELECT * FROM client_profiles";
      const jobStore = createJobStore({
        job: {
          id: jobId,
          ownerUserId,
          clientId,
          resultCalculationId: null,
          targetCalculationId: null,
          expectedSourceChecksum: null,
          method: "natal",
          interpretationMode: "adult_natal",
          status: "failed",
          inputFingerprint: "sha256:test",
          lastErrorCode: persistedCode,
          lastErrorMessage: persistedDiagnostic
        }
      });
      const service = createService({ jobStore });

      const response = await service.getJob(jobId, request());

      expect(response).toMatchObject({
        id: jobId,
        status: "failed",
        calculationId: null,
        failureCode: "chart_calculation_failed",
        failureMessage: "Не удалось рассчитать карту; запустите расчёт повторно"
      });
      expect(JSON.stringify(response)).not.toContain(persistedCode);
      expect(JSON.stringify(response)).not.toContain(persistedDiagnostic);
      expect(JSON.stringify(response)).not.toContain("anton.private@example.com");
    }
  );

  it("projects the exact replacement target and source checksum for a succeeded job", async () => {
    const calculationId = "77777777-7777-4777-8777-777777777777";
    const expectedSourceChecksum = `sha256:${"a".repeat(64)}`;
    const service = createService({
      jobStore: createJobStore({
        job: {
          id: jobId,
          ownerUserId,
          clientId,
          resultCalculationId: calculationId,
          targetCalculationId: calculationId,
          expectedSourceChecksum,
          method: "natal",
          interpretationMode: "adult_natal",
          status: "succeeded",
          inputFingerprint: `sha256:${"b".repeat(64)}`,
          lastErrorCode: null,
          lastErrorMessage: null
        }
      })
    });

    await expect(service.getJob(jobId, request())).resolves.toEqual({
      id: jobId,
      status: "succeeded",
      calculationId,
      targetCalculationId: calculationId,
      expectedSourceChecksum,
      interpretationMode: "adult_natal",
      failureCode: null,
      failureMessage: null
    });
  });

  it("returns authoritative legacy/current capabilities and rejects archived reads", async () => {
    const legacy = chartCalculationRecord();
    const current = chartCalculationRecord({ resultData: natalChartResultV2() });
    const forged = chartCalculationRecord({
      resultData: {
        ...natalChartResultV2(),
        reproducibilityFingerprint: `sha256:${"0".repeat(64)}`
      }
    });
    const archived = chartCalculationRecord({
      status: "archived",
      resultData: natalChartResultV2()
    });

    await expect(
      createService({ calculationStore: createCalculationStore(legacy) }).getCalculation(
        legacy.id,
        request()
      )
    ).resolves.toMatchObject({
      calculationId: legacy.id,
      capabilities: ["view_legacy", "recalculate"]
    });
    await expect(
      createService({ calculationStore: createCalculationStore(current) }).getCalculation(
        current.id,
        request()
      )
    ).resolves.toMatchObject({
      calculationId: current.id,
      capabilities: expect.arrayContaining(["view_current", "recalculate", "ai_draft", "pdf"])
    });
    await expect(
      createService({ calculationStore: createCalculationStore(archived) }).getCalculation(
        archived.id,
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_CALCULATION_ARCHIVED" })
    });
    await expect(
      createService({ calculationStore: createCalculationStore(forged) }).getCalculation(
        forged.id,
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_STORED_RESULT_INTEGRITY_INVALID" })
    });
  });

  it("recalculates the exact transit target from current CRM data and its saved event", async () => {
    const logger = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const calculation = transitCalculationRecord();
    const clientStore = createClientStore({
      birthData: readyBirthData({ birthDate: "2001-02-03", birthTime: "07:45" })
    });
    const commandStore = createCommandStore();
    const service = createService({
      clientStore,
      commandStore,
      calculationStore: createCalculationStore(calculation)
    });
    const replacementSettings = { ...settings(), zodiac: "tropical", houseSystem: "whole_sign" };

    await expect(
      service.recalculate(
        calculation.id,
        {
          expectedResultChecksum: calculation.resultChecksum,
          settings: replacementSettings
        },
        request()
      )
    ).resolves.toEqual({ status: "calculating", jobId });

    expect(commandStore.createOrReuseNatalJobAndRequestCalculation).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith({
      durationMs: expect.any(Number),
      event: "chart_job_command_completed",
      jobId,
      method: "transit",
      operation: "recalculate",
      outcome: "active_job"
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "transit",
        methodVersion: chartMethodVersions.transit,
        targetCalculationId: calculation.id,
        expectedSourceChecksum: calculation.resultChecksum,
        participants: [{ role: "subject", clientId }],
        settingsSnapshot: replacementSettings,
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "2001-02-03",
            birthTime: "07:45"
          }),
          transitSnapshot: {
            date: "2026-10-05",
            time: "09:15",
            timezone: "Europe/Moscow",
            latitude: 55.7558,
            longitude: 37.6173
          }
        }
      })
    );
  });

  it("reconstructs the precise legacy relationship defect from current owner-scoped clients", async () => {
    const calculation = legacySynastryCalculationRecord();
    const clientStore = createClientStore({
      clients: {
        [clientId]: readyBirthData({ clientUserId: clientId, birthDate: "2000-01-02" }),
        [partnerClientId]: readyBirthData({
          clientUserId: partnerClientId,
          birthDate: "2002-03-04",
          birthTimezone: "Europe/Moscow"
        })
      }
    });
    const commandStore = createCommandStore();
    const service = createService({
      clientStore,
      commandStore,
      calculationStore: createCalculationStore(calculation)
    });

    await service.recalculate(
      calculation.id,
      { expectedResultChecksum: calculation.resultChecksum },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "synastry",
        targetCalculationId: calculation.id,
        expectedSourceChecksum: calculation.resultChecksum,
        participants: [
          { role: "subject", clientId },
          { role: "partner", clientId: partnerClientId }
        ],
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({ birthDate: "2000-01-02" }),
          partnerInputSnapshot: expect.objectContaining({ birthDate: "2002-03-04" })
        }
      })
    );
    const providerInput = vi.mocked(commandStore.createOrReuseChartJobAndRequestCalculation).mock
      .calls[0]?.[0].inputSnapshot;
    expect(JSON.stringify(providerInput)).not.toContain(clientId);
    expect(JSON.stringify(providerInput)).not.toContain(partnerClientId);
    expect(JSON.stringify(providerInput)).not.toContain("1981-05-06");
  });

  it("rejects stale, archived, foreign and malformed recalculation before CRM or persistence", async () => {
    const cases = [
      {
        calculation: transitCalculationRecord(),
        checksum: `sha256:${"f".repeat(64)}`,
        code: "CHART_RESULT_CHANGED"
      },
      {
        calculation: { ...transitCalculationRecord(), status: "archived" as const },
        checksum: transitCalculationRecord().resultChecksum,
        code: "CHART_CALCULATION_ARCHIVED"
      },
      {
        calculation: { ...transitCalculationRecord(), inputData: { malformed: true } },
        checksum: transitCalculationRecord().resultChecksum,
        code: "CHART_STORED_RESULT_INTEGRITY_INVALID"
      }
    ];

    for (const candidate of cases) {
      const clientStore = createClientStore();
      const commandStore = createCommandStore();
      const service = createService({
        clientStore,
        commandStore,
        calculationStore: createCalculationStore(candidate.calculation)
      });
      await expect(
        service.recalculate(
          candidate.calculation.id,
          { expectedResultChecksum: candidate.checksum },
          request()
        )
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: candidate.code }) });
      expect(clientStore.getAstrologerClient).not.toHaveBeenCalled();
      expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
    }

    const foreignClientStore = createClientStore();
    const foreignCommandStore = createCommandStore();
    const foreign = createService({
      clientStore: foreignClientStore,
      commandStore: foreignCommandStore,
      calculationStore: createCalculationStore(null)
    });
    await expect(
      foreign.recalculate(
        transitCalculationRecord().id,
        { expectedResultChecksum: transitCalculationRecord().resultChecksum },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_CALCULATION_NOT_FOUND" })
    });
    expect(foreignClientStore.getAstrologerClient).not.toHaveBeenCalled();
    expect(foreignCommandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("generates a checksum-bound natal AI draft without client consent", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const calculationStore = createCalculationStore(calculation);
    const dictionaryStore = createDictionaryStore();
    const consentStore = createConsentStore("missing");
    const aiGeneration = createAiGenerationService();
    const aiDraftCommandStore = createAiDraftCommandStore();
    const service = createService({
      calculationStore,
      dictionaryStore,
      consentStore,
      aiGeneration,
      aiDraftCommandStore,
      locale: "en",
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    const response = await service.createAiDraft(
      calculation.id,
      { expectedResultChecksum: calculation.resultChecksum },
      request(),
      aiDraftIdempotencyKey
    );

    expect(consentStore.findChartAiConsentEvidence).not.toHaveBeenCalled();
    expect(aiDraftCommandStore.acquire).toHaveBeenCalledWith(
      expect.objectContaining({
        now: "2026-07-20T12:00:00.000Z",
        expiresAt: "2026-07-21T12:00:00.000Z"
      })
    );
    expect(dictionaryStore.listEntriesByCodes).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        locale: "en",
        codes: expect.arrayContaining(["sun_aries", "moon_house_2", "house_1"])
      })
    );
    expect(aiGeneration.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "chart.interpretationDraft",
        ownerUserId,
        consentAuthorizations: [],
        usageEvidence: {
          processingAuthorityVersion: "verified-test-authority.v1",
          resourceEvidence: {
            resourceType: "chart_calculation",
            resourceId: calculation.id,
            sourceChecksum: calculation.resultChecksum
          }
        },
        input: expect.objectContaining({ locale: "en", methodCode: "natal" })
      })
    );
    const providerInput = vi.mocked(aiGeneration.generate).mock.calls[0]?.[0].input;
    expect(JSON.stringify(providerInput)).not.toContain(calculation.id);
    expect(JSON.stringify(providerInput)).not.toContain(calculation.resultChecksum);
    expect(JSON.stringify(providerInput)).not.toContain("birthDate");
    expect(response.interpretations[0]).toMatchObject({
      status: "draft",
      text: expect.stringContaining("OVERVIEW")
    });
    expect(calculationStore.saveInterpretation).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "ai",
        modelId: "gpt-test",
        promptVersion: "chart.interpretationDraft@3",
        expectedResultChecksum: calculation.resultChecksum
      })
    );
    const saveInput = vi.mocked(calculationStore.saveInterpretation).mock.calls[0]?.[0];
    expect(saveInput?.interpretationIdGenerator()).toBe(aiDraftCommandId);
  });

  it("replays a completed durable success without a second provider call or save", async () => {
    const calculation = chartCalculationRecord({
      resultData: natalChartResultV2(),
      interpretations: [aiInterpretation(aiDraftCommandId)]
    });
    const calculationStore = createCalculationStore(calculation);
    const aiGeneration = createAiGenerationService();
    const aiDraftCommandStore = createAiDraftCommandStore({
      acquireOutcome: {
        kind: "completed",
        commandId: aiDraftCommandId,
        result: successCommandResult(calculation.id)
      }
    });
    const service = createService({
      calculationStore,
      consentStore: createConsentStore("granted"),
      aiGeneration,
      aiDraftCommandStore,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).resolves.toMatchObject({
      id: calculation.id,
      interpretations: [expect.objectContaining({ id: aiDraftCommandId })]
    });
    expect(aiGeneration.generate).not.toHaveBeenCalled();
    expect(calculationStore.saveInterpretation).not.toHaveBeenCalled();
  });

  it("replays terminal success after consent revocation and authority outage without new processing", async () => {
    const calculation = chartCalculationRecord({
      resultData: natalChartResultV2(),
      interpretations: [aiInterpretation(aiDraftCommandId)]
    });
    const consentStore = createConsentStore("missing");
    const dictionaryStore = createDictionaryStore();
    const profileStore = createProfileStore("en");
    const aiGeneration = createAiGenerationService();
    const aiDraftCommandStore = createAiDraftCommandStore({
      acquireOutcome: {
        kind: "completed",
        commandId: aiDraftCommandId,
        result: successCommandResult(calculation.id)
      }
    });
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      consentStore,
      dictionaryStore,
      profileStore,
      aiGeneration,
      aiDraftCommandStore,
      chartAiConfig: { enabled: false, processingAuthorityVersion: null }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).resolves.toMatchObject({
      id: calculation.id,
      interpretations: [expect.objectContaining({ id: aiDraftCommandId })]
    });
    expect(consentStore.findChartAiConsentEvidence).not.toHaveBeenCalled();
    expect(profileStore.findByOwnerUserId).not.toHaveBeenCalled();
    expect(dictionaryStore.listEntriesByCodes).not.toHaveBeenCalled();
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("replays terminal success before reading the current chart execution profile", async () => {
    const calculation = chartCalculationRecord({
      resultData: natalChartResultV2(),
      interpretations: [aiInterpretation(aiDraftCommandId)]
    });
    const executionProfileProvider = {
      getProfile: vi.fn(() => {
        throw new Error("chart execution profile unavailable");
      })
    };
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      executionProfileProvider,
      aiDraftCommandStore: createAiDraftCommandStore({
        acquireOutcome: {
          kind: "completed",
          commandId: aiDraftCommandId,
          result: successCommandResult(calculation.id)
        }
      })
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).resolves.toMatchObject({
      id: calculation.id,
      interpretations: [expect.objectContaining({ id: aiDraftCommandId })]
    });
    expect(executionProfileProvider.getProfile).not.toHaveBeenCalled();
  });

  it("persists execution-profile lookup failure as a known preflight outcome", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const executionProfileProvider = {
      getProfile: vi.fn(() => {
        throw new Error("chart execution profile unavailable");
      })
    };
    const aiDraftCommandStore = createAiDraftCommandStore();
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      executionProfileProvider,
      aiDraftCommandStore,
      aiGeneration
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: "CHART_AI_DRAFT_PREFLIGHT_UNAVAILABLE" })
    });
    expect(aiDraftCommandStore.completeKnownFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        failure: expect.objectContaining({
          statusCode: 503,
          code: "CHART_AI_DRAFT_PREFLIGHT_UNAVAILABLE"
        })
      })
    );
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("returns a typed conflict for a live duplicate before provider work", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const aiGeneration = createAiGenerationService();
    const aiDraftCommandStore = createAiDraftCommandStore({
      acquireOutcome: {
        kind: "processing",
        commandId: aiDraftCommandId,
        updatedAt: now.toISOString()
      },
      completeSuccessResult: null
    });
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      consentStore: createConsentStore("granted"),
      aiGeneration,
      aiDraftCommandStore,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "CHART_AI_DRAFT_IN_PROGRESS" })
    });
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("recovers processing after deterministic save and replays without provider work", async () => {
    const calculation = chartCalculationRecord({
      resultData: natalChartResultV2(),
      interpretations: [aiInterpretation(aiDraftCommandId)]
    });
    const aiGeneration = createAiGenerationService();
    const aiDraftCommandStore = createAiDraftCommandStore({
      acquireOutcome: {
        kind: "processing",
        commandId: aiDraftCommandId,
        updatedAt: now.toISOString()
      },
      completeSuccessResult: successCommandResult(calculation.id)
    });
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      consentStore: createConsentStore("granted"),
      aiGeneration,
      aiDraftCommandStore,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).resolves.toMatchObject({
      interpretations: [expect.objectContaining({ id: aiDraftCommandId })]
    });
    expect(aiDraftCommandStore.completeSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: aiDraftCommandId, calculationId: calculation.id })
    );
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("recovers a committed deterministic interpretation after the save acknowledgement is lost", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const recoveredCalculation = {
      ...calculation,
      interpretations: [aiInterpretation(aiDraftCommandId)]
    };
    const calculationStore = createCalculationStore(calculation);
    vi.mocked(calculationStore.findByOwnerAndId)
      .mockResolvedValueOnce(calculation)
      .mockResolvedValueOnce(calculation)
      .mockResolvedValue(recoveredCalculation);
    vi.mocked(calculationStore.saveInterpretation).mockRejectedValueOnce(
      new Error("database acknowledgement was lost after commit")
    );
    const aiDraftCommandStore = createAiDraftCommandStore({
      completeSuccessResult: successCommandResult(calculation.id)
    });
    const service = createService({
      calculationStore,
      consentStore: createConsentStore("granted"),
      aiGeneration: createAiGenerationService(),
      aiDraftCommandStore,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).resolves.toMatchObject({
      interpretations: [expect.objectContaining({ id: aiDraftCommandId })]
    });
    expect(aiDraftCommandStore.completeSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: aiDraftCommandId, calculationId: calculation.id })
    );
    expect(aiDraftCommandStore.completeUnknownOutcome).not.toHaveBeenCalled();
  });

  it("retries the exact deterministic save after a transient pre-commit failure without repeating provider cost", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const calculationStore = createCalculationStore(calculation);
    vi.mocked(calculationStore.saveInterpretation).mockRejectedValueOnce(
      new Error("transient database failure before commit")
    );
    const aiGeneration = createAiGenerationService();
    const aiDraftCommandStore = createAiDraftCommandStore({
      completeSuccessResult: successCommandResult(calculation.id)
    });
    const service = createService({
      calculationStore,
      consentStore: createConsentStore("granted"),
      aiGeneration,
      aiDraftCommandStore,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).resolves.toMatchObject({
      interpretations: [expect.objectContaining({ id: aiDraftCommandId, status: "draft" })]
    });
    expect(calculationStore.saveInterpretation).toHaveBeenCalledTimes(2);
    expect(vi.mocked(calculationStore.saveInterpretation).mock.calls[1]?.[0]).toEqual(
      vi.mocked(calculationStore.saveInterpretation).mock.calls[0]?.[0]
    );
    expect(aiGeneration.generate).toHaveBeenCalledTimes(1);
    expect(aiDraftCommandStore.completeUnknownOutcome).not.toHaveBeenCalled();
  });

  it("keeps the AI command recoverable when durable save evidence cannot be read", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const calculationStore = createCalculationStore(calculation);
    vi.mocked(calculationStore.saveInterpretation)
      .mockRejectedValueOnce(new Error("database acknowledgement was lost"))
      .mockRejectedValueOnce(new Error("database evidence remains unavailable"));
    const aiDraftCommandStore = createAiDraftCommandStore();
    vi.mocked(aiDraftCommandStore.completeSuccess).mockRejectedValueOnce(
      new Error("durable evidence read unavailable")
    );
    const service = createService({
      calculationStore,
      consentStore: createConsentStore("granted"),
      aiGeneration: createAiGenerationService(),
      aiDraftCommandStore,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN" })
    });
    expect(aiDraftCommandStore.completeSuccess).toHaveBeenCalledOnce();
    expect(calculationStore.saveInterpretation).toHaveBeenCalledTimes(2);
    expect(aiDraftCommandStore.completeUnknownOutcome).not.toHaveBeenCalled();
  });

  it("persists and replays a known terminal provider rejection exactly once", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const aiGeneration = createAiGenerationService();
    vi.mocked(aiGeneration.generate).mockRejectedValueOnce(
      new HttpException({ message: "AI generation was refused for this input" }, 422)
    );
    const aiDraftCommandStore = createStatefulAiDraftCommandStore();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      consentStore: createConsentStore("granted"),
      aiGeneration,
      aiDraftCommandStore,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        service.createAiDraft(
          calculation.id,
          { expectedResultChecksum: calculation.resultChecksum },
          request(),
          aiDraftIdempotencyKey
        )
      ).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({ code: "CHART_AI_DRAFT_REJECTED" })
      });
    }
    expect(aiGeneration.generate).toHaveBeenCalledOnce();
    expect(aiDraftCommandStore.completeKnownFailure).toHaveBeenCalledOnce();
  });

  it("persists an ambiguous provider outcome and never silently repeats it", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const aiGeneration = createAiGenerationService();
    vi.mocked(aiGeneration.generate).mockRejectedValueOnce(
      new HttpException({ message: "AI generation is temporarily unavailable" }, 503)
    );
    const aiDraftCommandStore = createStatefulAiDraftCommandStore();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      consentStore: createConsentStore("granted"),
      aiGeneration,
      aiDraftCommandStore,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        service.createAiDraft(
          calculation.id,
          { expectedResultChecksum: calculation.resultChecksum },
          request(),
          aiDraftIdempotencyKey
        )
      ).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({ code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN" })
      });
    }
    expect(aiGeneration.generate).toHaveBeenCalledOnce();
    expect(aiDraftCommandStore.completeUnknownOutcome).toHaveBeenCalledOnce();
  });

  it("logs only structured metadata when ambiguous-provider fencing cannot be persisted", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const aiGeneration = createAiGenerationService();
    vi.mocked(aiGeneration.generate).mockRejectedValueOnce(
      new Error("provider payload and prompt must not reach logs")
    );
    const aiDraftCommandStore = createAiDraftCommandStore();
    vi.mocked(aiDraftCommandStore.completeUnknownOutcome).mockRejectedValueOnce(
      new Error("unknown fence persistence unavailable")
    );
    const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      consentStore: createConsentStore("granted"),
      aiGeneration,
      aiDraftCommandStore,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN" })
    });
    expect(logger).toHaveBeenCalledWith({
      event: "chart_ai_draft_unknown_outcome_persistence_failed",
      commandId: aiDraftCommandId,
      errorName: "Error"
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("provider payload");
    expect(JSON.stringify(logger.mock.calls)).not.toContain(
      "unknown fence persistence unavailable"
    );
  });

  it("generates without current consent", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const calculationStore = createCalculationStore(calculation);
    const dictionaryStore = createDictionaryStore();
    const profileStore = createProfileStore("en");
    const consentStore = createConsentStore("missing");
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore,
      dictionaryStore,
      profileStore,
      consentStore,
      aiGeneration,
      locale: "en",
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).resolves.toMatchObject({
      id: calculation.id,
      interpretations: [expect.objectContaining({ status: "draft" })]
    });
    expect(consentStore.findChartAiConsentEvidence).not.toHaveBeenCalled();
    expect(profileStore.findByOwnerUserId).toHaveBeenCalledOnce();
    expect(dictionaryStore.listEntriesByCodes).toHaveBeenCalledOnce();
    expect(aiGeneration.generate).toHaveBeenCalledWith(
      expect.objectContaining({ consentAuthorizations: [] })
    );
    expect(calculationStore.saveInterpretation).toHaveBeenCalledOnce();
  });

  it("fails closed before profile and Dictionary when chart AI authority is unavailable", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const dictionaryStore = createDictionaryStore();
    const profileStore = createProfileStore("en");
    const consentStore = createConsentStore("granted");
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      dictionaryStore,
      profileStore,
      consentStore,
      aiGeneration,
      chartAiConfig: { enabled: false, processingAuthorityVersion: null }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({
        code: "CHART_AI_PROCESSING_AUTHORITY_UNAVAILABLE"
      })
    });
    expect(consentStore.findChartAiConsentEvidence).not.toHaveBeenCalled();
    expect(profileStore.findByOwnerUserId).not.toHaveBeenCalled();
    expect(dictionaryStore.listEntriesByCodes).not.toHaveBeenCalled();
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("persists a non-ambiguous preflight failure without poisoning the key as provider-unknown", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const dictionaryStore = createDictionaryStore();
    vi.mocked(dictionaryStore.listEntriesByCodes).mockRejectedValueOnce(
      new Error("dictionary storage unavailable")
    );
    const aiDraftCommandStore = createAiDraftCommandStore();
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      dictionaryStore,
      consentStore: createConsentStore("granted"),
      aiDraftCommandStore,
      aiGeneration,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: "CHART_AI_DRAFT_PREFLIGHT_UNAVAILABLE" })
    });
    expect(aiDraftCommandStore.completeKnownFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        failure: expect.objectContaining({ code: "CHART_AI_DRAFT_PREFLIGHT_UNAVAILABLE" })
      })
    );
    expect(aiDraftCommandStore.completeUnknownOutcome).not.toHaveBeenCalled();
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("logs a structured operator event when unknown-outcome fencing cannot be persisted", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const dictionaryStore = createDictionaryStore();
    vi.mocked(dictionaryStore.listEntriesByCodes).mockRejectedValueOnce(
      new Error("dictionary storage unavailable")
    );
    const aiDraftCommandStore = createAiDraftCommandStore();
    vi.mocked(aiDraftCommandStore.completeKnownFailure).mockRejectedValueOnce(
      new Error("known failure persistence unavailable")
    );
    vi.mocked(aiDraftCommandStore.completeUnknownOutcome).mockRejectedValueOnce(
      new Error("unknown fence persistence unavailable")
    );
    const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      dictionaryStore,
      consentStore: createConsentStore("granted"),
      aiDraftCommandStore,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN" })
    });
    expect(logger).toHaveBeenCalledWith({
      event: "chart_ai_draft_unknown_outcome_persistence_failed",
      commandId: aiDraftCommandId,
      errorName: "Error"
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("dictionary storage unavailable");
  });

  it("generates AI drafts for manual chart participants", async () => {
    const calculation = chartCalculationRecord({
      resultData: natalChartResultV2(),
      participants: [
        {
          role: "subject",
          source: "manual",
          clientId: null,
          displayName: "Manual client"
        }
      ]
    });
    const consentStore = createConsentStore("granted");
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      consentStore,
      aiGeneration,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).resolves.toMatchObject({
      id: calculation.id,
      interpretations: [expect.objectContaining({ status: "draft" })]
    });
    expect(consentStore.findChartAiConsentEvidence).not.toHaveBeenCalled();
    expect(aiGeneration.generate).toHaveBeenCalledWith(
      expect.objectContaining({ consentAuthorizations: [] })
    );
  });

  it("rejects stale chart AI draft requests before calling the provider", async () => {
    const calculation = chartCalculationRecord({ resultData: natalChartResultV2() });
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      aiGeneration
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: `sha256:${"f".repeat(64)}` },
        request(),
        aiDraftIdempotencyKey
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_RESULT_CHANGED" })
    });
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("rejects legacy and archived AI before consent or downstream work", async () => {
    for (const candidate of [
      { calculation: chartCalculationRecord(), code: "CHART_INTERPRETATION_MODE_UNAVAILABLE" },
      {
        calculation: chartCalculationRecord({
          resultData: {
            ...natalChartResultV2(),
            reproducibilityFingerprint: `sha256:${"0".repeat(64)}`
          }
        }),
        code: "CHART_STORED_RESULT_INTEGRITY_INVALID"
      },
      {
        calculation: chartCalculationRecord({
          status: "archived",
          resultData: natalChartResultV2()
        }),
        code: "CHART_CALCULATION_ARCHIVED"
      }
    ]) {
      const dictionaryStore = createDictionaryStore();
      const profileStore = createProfileStore("ru");
      const aiGeneration = createAiGenerationService();
      const service = createService({
        calculationStore: createCalculationStore(candidate.calculation),
        dictionaryStore,
        profileStore,
        aiGeneration
      });

      await expect(
        service.createAiDraft(
          candidate.calculation.id,
          { expectedResultChecksum: candidate.calculation.resultChecksum },
          request(),
          aiDraftIdempotencyKey
        )
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: candidate.code }) });
      expect(profileStore.findByOwnerUserId).not.toHaveBeenCalled();
      expect(dictionaryStore.listEntriesByCodes).not.toHaveBeenCalled();
      expect(aiGeneration.generate).not.toHaveBeenCalled();
    }
  });

  it("does not let valid adult consent unlock child AI or acquire an idempotency command", async () => {
    const calculation = chartCalculationRecord({
      resultData: natalChartResultV2(),
      interpretationMode: "child"
    });
    const consentStore = createConsentStore("granted");
    const aiDraftCommandStore = createAiDraftCommandStore();
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      consentStore,
      aiDraftCommandStore,
      aiGeneration,
      chartAiConfig: {
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      }
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "CHART_INTERPRETATION_MODE_UNAVAILABLE" })
    });
    expect(aiDraftCommandStore.acquire).not.toHaveBeenCalled();
    expect(consentStore.findChartAiConsentEvidence).not.toHaveBeenCalled();
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("rejects unsupported chart AI methods without calling the provider", async () => {
    const calculation = chartCalculationRecord({ methodCode: "transit" });
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      aiGeneration
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request(),
        aiDraftIdempotencyKey
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_INTERPRETATION_MODE_UNAVAILABLE" })
    });
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });
});

function createService(
  input: {
    readonly clientStore?: ClientStore;
    readonly commandStore?: ChartCalculationCommandStore;
    readonly jobStore?: ChartCalculationJobStore;
    readonly calculationStore?: CalculationStore;
    readonly dictionaryStore?: DictionaryStore;
    readonly profileStore?: AstrologerProfileStore;
    readonly aiGeneration?: AiGenerationService;
    readonly consentStore?: ClientConsentStore;
    readonly aiDraftCommandStore?: ChartAiDraftCommandStore;
    readonly executionProfileProvider?: { readonly getProfile: () => typeof executionProfile };
    readonly chartAiConfig?: {
      readonly enabled: boolean;
      readonly processingAuthorityVersion: string | null;
    };
    readonly locale?: "ru" | "en";
  } = {}
): ChartsService {
  return new ChartsService(
    input.clientStore ?? createClientStore(),
    input.commandStore ?? createCommandStore(),
    input.jobStore ?? createJobStore(),
    input.calculationStore ?? createCalculationStore(null),
    input.dictionaryStore ?? createDictionaryStore(),
    input.profileStore ?? createProfileStore(input.locale ?? "ru"),
    { now: () => now } as SystemClock,
    input.aiGeneration ?? createAiGenerationService(),
    (input.executionProfileProvider ?? { getProfile: () => executionProfile }) as never,
    input.chartAiConfig ?? { enabled: false, processingAuthorityVersion: null },
    input.aiDraftCommandStore ?? createAiDraftCommandStore()
  );
}

function createAiDraftCommandStore(
  input: {
    readonly acquireOutcome?: Awaited<ReturnType<ChartAiDraftCommandStore["acquire"]>>;
    readonly completeSuccessResult?: Awaited<
      ReturnType<ChartAiDraftCommandStore["completeSuccess"]>
    >;
  } = {}
): ChartAiDraftCommandStore {
  return {
    acquire: vi.fn(async () =>
      input.acquireOutcome
        ? input.acquireOutcome
        : { kind: "acquired" as const, commandId: aiDraftCommandId }
    ),
    completeSuccess: vi.fn(async (command) =>
      input.completeSuccessResult === undefined
        ? successCommandResult(command.calculationId)
        : input.completeSuccessResult
    ),
    completeKnownFailure: vi.fn(async (command) => ({
      schemaVersion: "chart-ai-draft-command-result.v1" as const,
      kind: "known_failure" as const,
      ...command.failure
    })),
    completeUnknownOutcome: vi.fn(async () => unknownCommandResult()),
    reconcileExpiredProcessing: vi.fn(async () => 0)
  };
}

function createStatefulAiDraftCommandStore(): ChartAiDraftCommandStore {
  let result: Awaited<ReturnType<ChartAiDraftCommandStore["completeKnownFailure"]>> | null = null;
  return {
    acquire: vi.fn(async () =>
      result
        ? { kind: "completed" as const, commandId: aiDraftCommandId, result }
        : { kind: "acquired" as const, commandId: aiDraftCommandId }
    ),
    completeSuccess: vi.fn(async (command) => {
      result = successCommandResult(command.calculationId);
      return result;
    }),
    completeKnownFailure: vi.fn(async (command) => {
      const completed = {
        schemaVersion: "chart-ai-draft-command-result.v1",
        kind: "known_failure" as const,
        ...command.failure
      };
      result = completed;
      return completed;
    }),
    completeUnknownOutcome: vi.fn(async () => {
      result = unknownCommandResult();
      return result;
    }),
    reconcileExpiredProcessing: vi.fn(async () => 0)
  };
}

function successCommandResult(calculationId: string) {
  return {
    schemaVersion: "chart-ai-draft-command-result.v1" as const,
    kind: "success" as const,
    calculationId,
    interpretationId: aiDraftCommandId
  };
}

function unknownCommandResult() {
  return {
    schemaVersion: "chart-ai-draft-command-result.v1" as const,
    kind: "unknown_outcome" as const,
    code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN" as const,
    message: "Chart AI draft provider outcome requires reconciliation"
  };
}

function aiInterpretation(id: string) {
  return {
    id,
    source: "ai" as const,
    status: "draft" as const,
    text: "OVERVIEW\nRecovered draft",
    modelId: "gpt-test",
    promptVersion: "chart.interpretationDraft@3",
    approvedAt: null,
    updatedAt: now.toISOString()
  };
}

function createCalculationStore(record: CalculationRecord | null): CalculationStore {
  return {
    listByOwner: vi.fn(async () => ({
      calculations: record ? [record] : [],
      total: record ? 1 : 0
    })),
    findByOwnerAndId: vi.fn(async (input) => {
      if (!record) return null;
      return record.ownerUserId === input.ownerUserId && record.id === input.calculationId
        ? record
        : null;
    }),
    findExact: vi.fn(async () => null),
    create: vi.fn(async () => raise()),
    replaceResult: vi.fn(async () => ({ status: "not_found" as const })),
    ensureClientLinks: vi.fn(async () => null),
    linkClient: vi.fn(async () => null),
    publishClientLink: vi.fn(async () => null),
    saveInterpretation: vi.fn(async (input) => {
      if (!record || input.expectedResultChecksum !== record.resultChecksum) return null;
      return {
        ...record,
        interpretations: [
          {
            id: input.interpretationIdGenerator(),
            source: input.source,
            status: "draft" as const,
            text: input.text,
            modelId: input.modelId,
            promptVersion: input.promptVersion,
            approvedAt: null,
            updatedAt: input.now
          }
        ],
        updatedAt: input.now
      };
    }),
    approveInterpretation: vi.fn(async () => null),
    archive: vi.fn(async () => null)
  };
}

function createDictionaryStore(): DictionaryStore {
  return {
    listCategories: vi.fn(async () => ({ categories: [], total: 0 })),
    listEntries: vi.fn(async () => ({ entries: [], total: 0, counts: sourceCounts() })),
    listEntriesByCodes: vi.fn(async (query) => ({
      entries: query.codes.slice(0, 4).map((code: string) => ({
        id: `entry-${code}`,
        categoryId: "category-chart",
        categoryCode: code.startsWith("house_") ? "house_meanings" : "planets_in_signs",
        code,
        locale: query.locale,
        source: "platform" as const,
        title: code,
        content: `Grounding for ${code}`,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      })),
      total: query.codes.length,
      counts: sourceCounts()
    })),
    createCustomEntry: vi.fn(async () => raise()),
    updateCustomEntry: vi.fn(async () => raise()),
    upsertPlatformEntryOverride: vi.fn(async () => raise()),
    deleteAstrologerEntry: vi.fn(async () => raise()),
    resetAstrologerEntries: vi.fn(async () => raise()),
    resetPlatformEntryOverride: vi.fn(async () => raise())
  };
}

function sourceCounts() {
  return { sources: { all: 0, platform: 0, modified: 0, custom: 0 } };
}

function createProfileStore(locale: "ru" | "en"): AstrologerProfileStore {
  return {
    findByOwnerUserId: vi.fn(async () => ({
      ownerUserId,
      publicHandle: "qa",
      publicName: "QA",
      headline: null,
      bio: null,
      timezone: "Europe/Moscow",
      locale,
      avatarMediaId: null,
      coverMediaId: null,
      consultationLanguages: [locale],
      visibilityStatus: "draft" as const,
      professionalExperienceYears: null,
      professionalSchool: null,
      specializations: [],
      methods: [],
      socialLinks: { telegram: null, instagram: null, whatsapp: null, website: null },
      ownBirthData: { date: null, time: null, place: null, showOnPublicPage: false },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    upsert: vi.fn(async () => raise())
  };
}

function createAiGenerationService(): AiGenerationService {
  return {
    generate: vi.fn(async () => ({
      provider: "openai" as const,
      model: "gpt-test",
      finishReason: "stop" as const,
      output: {
        overview: "Overview.",
        coreThemes: "Core themes.",
        strengths: "Strengths.",
        growthEdges: "Growth edges.",
        sessionFocus: "Session focus.",
        reflectionQuestions: ["Question one?", "Question two?", "Question three?"]
      }
    }))
  } as unknown as AiGenerationService;
}

function createConsentStore(state: "granted" | "missing"): ClientConsentStore {
  return {
    listRelationshipConsentsForClient: vi.fn(async () => []),
    grantConsentAtomically: vi.fn(async () => ({ status: "relationship_not_found" as const })),
    revokeConsentAtomically: vi.fn(async () => ({ status: "not_found" as const })),
    findChartAiConsentEvidence: vi.fn(async ({ astrologerUserId, clientUserIds }) =>
      clientUserIds.map((clientUserId: string) => ({
        relationship: {
          id: "66666666-6666-4666-8666-666666666666",
          clientUserId,
          astrologerUserId,
          status: "active" as const
        },
        consent:
          state === "granted"
            ? {
                id: consentId,
                relationshipId: "66666666-6666-4666-8666-666666666666",
                clientUserId,
                astrologerUserId,
                purpose: currentChartAiConsentPolicy.purpose,
                policyVersion: currentChartAiConsentPolicy.policyVersion,
                processorCode: currentChartAiConsentPolicy.processorCode,
                noticeLocale: "ru" as const,
                noticeSha256: canonicalChartAiConsentNoticeHashes.ru,
                grantedAt: now.toISOString(),
                revokedAt: null
              }
            : null
      }))
    )
  };
}

function createCommandStore(
  input: {
    readonly outcome?: Awaited<
      ReturnType<ChartCalculationCommandStore["createOrReuseChartJobAndRequestCalculation"]>
    >;
  } = {}
): ChartCalculationCommandStore {
  return {
    createOrReuseChartJobAndRequestCalculation: vi.fn(
      async () => input.outcome ?? ({ kind: "active_job", jobId } as const)
    ),
    createOrReuseNatalJobAndRequestCalculation: vi.fn(
      async () => input.outcome ?? ({ kind: "active_job", jobId } as const)
    )
  };
}

function createJobStore(
  input: {
    readonly job?: Awaited<ReturnType<ChartCalculationJobStore["getOwnerScopedJob"]>>;
    readonly result?: Awaited<ReturnType<ChartCalculationJobStore["getOwnerScopedResult"]>>;
  } = {}
): ChartCalculationJobStore {
  return {
    createOrReuseChartJob: vi.fn(async () => ({ kind: "active_job", jobId }) as const),
    createOrReuseNatalJob: vi.fn(async () => ({ kind: "active_job", jobId }) as const),
    getOwnerScopedJob: vi.fn(async () => input.job ?? null),
    getOwnerScopedResult: vi.fn(async () => input.result ?? null)
  };
}

function createClientStore(
  input: {
    readonly birthData?: ClientBirthData | null;
    readonly clients?: Record<string, ClientBirthData | null>;
  } = {}
): ClientStore {
  return {
    createJoinIntent: vi.fn(async () => raise()),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(async () => raise()),
    upsertClientProfile: vi.fn(async () => undefined),
    upsertClientBirthData: vi.fn(async () => raise()),
    listClientBirthDataProfiles: vi.fn(async () => []),
    createClientBirthDataProfile: vi.fn(async () => raise()),
    updateClientBirthDataProfile: vi.fn(async () => raise()),
    listAstrologerClients: vi.fn(async () => ({ clients: [], total: 0 })),
    getAstrologerClient: vi.fn(async ({ clientUserId }) => {
      const birthData = input.clients
        ? (input.clients[clientUserId] ?? null)
        : input.birthData === undefined
          ? readyBirthData({ clientUserId })
          : input.birthData;
      return {
        clientUserId,
        displayName: clientUserId === partnerClientId ? "Партнер" : "Мария Иванова",
        relationshipStatus: "active" as const,
        firstLinkedAt: now.toISOString(),
        lastLinkedAt: now.toISOString(),
        birthData
      };
    })
  };
}

function readyBirthData(input: Partial<ClientBirthData> = {}): ClientBirthData {
  return {
    id: input.id ?? "55555555-5555-4555-8555-555555555555",
    clientUserId: input.clientUserId ?? clientId,
    label: input.label ?? null,
    birthDate: input.birthDate ?? "1990-07-15",
    birthTime: input.birthTime ?? "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: input.birthPlaceText ?? null,
    birthCountryCode: input.birthCountryCode ?? null,
    birthCity: input.birthCity ?? null,
    birthRegion: input.birthRegion ?? null,
    birthTimezone: input.birthTimezone ?? "Europe/Rome",
    birthTimeDstOccurrence: input.birthTimeDstOccurrence ?? null,
    birthLatitude: input.birthLatitude ?? 41.9028,
    birthLongitude: input.birthLongitude ?? 12.4964,
    source: input.source ?? "manual",
    isPrimary: input.isPrimary ?? true,
    createdAt: input.createdAt ?? now.toISOString(),
    updatedAt: input.updatedAt ?? now.toISOString()
  };
}

function settings() {
  return {
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  };
}

function horaryQuestion() {
  return {
    question: "Стоит ли принимать предложение?",
    category: "career",
    date: "2026-07-23",
    time: "14:30",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  };
}

function chartCalculationRecord(input: Partial<CalculationRecord> = {}): CalculationRecord {
  const defaultResult = natalChartResult();
  const resultData = input.resultData ?? defaultResult;
  const resultSchemaVersion =
    resultData !== null && typeof resultData === "object" && "schemaVersion" in resultData
      ? resultData.schemaVersion
      : null;
  const defaultInputData = {
    inputSnapshot: defaultResult.inputSnapshot,
    settings: defaultResult.settings
  };
  const defaultResultChecksum = sha256CanonicalJson(resultData as unknown as CanonicalJson);
  return {
    id: "99999999-9999-4999-8999-999999999999",
    ownerUserId,
    module: "chart",
    mode: "individual",
    methodCode: input.methodCode ?? "natal",
    interpretationMode:
      input.interpretationMode !== undefined
        ? input.interpretationMode
        : resultSchemaVersion === "chart-result.v2" && (input.methodCode ?? "natal") === "natal"
          ? "adult_natal"
          : "legacy_unclassified",
    title: "QA Natal",
    status: "calculated",
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId,
        displayName: "QA Missing Birth Data"
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    requestFingerprint: `sha256:${"e".repeat(64)}`,
    inputData: defaultInputData,
    resultSummary: { method: "natal" },
    resultChecksum: defaultResultChecksum,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...input,
    resultData
  };
}

function transitCalculationRecord(): CalculationRecord {
  const natal = natalChartResult();
  const transitSnapshot = {
    date: "2026-10-05",
    time: "09:15",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  };
  return chartCalculationRecord({
    methodCode: "transit",
    inputData: {
      inputSnapshot: {
        inputSnapshot: { ...natal.inputSnapshot, birthDate: "1981-05-06" },
        transitSnapshot
      },
      settings: settings()
    },
    resultData: {
      schemaVersion: "chart-result.v1",
      method: "transit",
      provider: natal.provider,
      settings: natal.settings,
      inputSnapshot: { ...natal.inputSnapshot, birthDate: "1981-05-06" },
      transitSnapshot,
      result: {
        natal: natal.result,
        transit: natal.result,
        aspectsToNatal: [],
        warnings: []
      }
    },
    resultSummary: { method: "transit" }
  });
}

function legacySynastryCalculationRecord(): CalculationRecord {
  const natal = natalChartResult();
  const inputSnapshot = { ...natal.inputSnapshot, birthDate: "1981-05-06" };
  const partnerInputSnapshot = {
    ...natal.inputSnapshot,
    birthDate: "1979-08-09",
    birthTime: "08:15",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  };
  const relationshipSnapshot = {
    primaryClientId: clientId,
    partnerClientId
  };
  return chartCalculationRecord({
    methodCode: "synastry",
    mode: "individual",
    inputData: {
      inputSnapshot: { inputSnapshot, partnerInputSnapshot, relationshipSnapshot },
      settings: settings()
    },
    resultData: {
      schemaVersion: "chart-result.v1",
      method: "synastry",
      provider: natal.provider,
      settings: natal.settings,
      inputSnapshot,
      partnerInputSnapshot,
      relationshipSnapshot,
      result: {
        primary: natal.result,
        partner: natal.result,
        aspectsBetween: [],
        houseOverlays: [],
        warnings: []
      }
    },
    resultSummary: { method: "synastry" }
  });
}

function natalChartResult() {
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: { zodiac: "tropical" as const, ...settings() },
    inputSnapshot: {
      birthDate: "1991-07-10",
      birthTime: "13:10",
      timezone: "Europe/Saratov",
      latitude: 51.499947,
      longitude: 44.484581,
      birthTimePrecision: "exact" as const
    },
    result: {
      points: completePoints(),
      houses: completeHouses(),
      aspects: [
        {
          pointA: "sun",
          pointB: "moon",
          type: "trine",
          angle: 120,
          orb: 1.2,
          applying: true,
          strength: 0.9
        }
      ],
      distributions: {
        elements: { fire: 2, earth: 2, air: 4, water: 6 },
        modalities: { cardinal: 4, fixed: 5, mutable: 5 },
        polarity: { masculine: 6, feminine: 8 }
      },
      warnings: []
    }
  };
}

function natalChartResultV2() {
  const legacy = natalChartResult();
  const candidate = {
    ...legacy,
    schemaVersion: "chart-result.v2",
    methodVersion: chartMethodVersions.natal,
    provider: {
      name: "kerykeion",
      version: "5.12.9",
      ephemeris: "moshier",
      pyswissephVersion: "2.10.3.2",
      ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      ephemerisDataRevision: null
    },
    reproducibilityFingerprint: `sha256:${"a".repeat(64)}`,
    result: {
      ...legacy.result,
      distributions: {
        elements: { fire: 3, earth: 3, air: 2, water: 2 },
        modalities: { cardinal: 4, fixed: 3, mutable: 3 },
        polarity: { masculine: 5, feminine: 5 }
      }
    }
  } as ReproducibleChartResult;
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function solarReturnResult() {
  const inputSnapshot = {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9028,
    longitude: 12.4964,
    birthTimePrecision: "exact" as const
  };
  const chart = {
    points: completePoints(),
    houses: completeHouses(),
    aspects: [],
    distributions: {
      elements: { fire: 0, earth: 0, air: 0, water: 0 },
      modalities: { cardinal: 0, fixed: 0, mutable: 0 },
      polarity: { masculine: 0, feminine: 0 }
    },
    warnings: []
  };
  return {
    schemaVersion: "chart-result.v1",
    method: "solar_return",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: { zodiac: "tropical" as const, ...settings() },
    inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar" as const,
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      },
      resolvedAt: "2026-07-15T01:20:01.000Z"
    },
    result: {
      natal: chart,
      solarReturn: chart,
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function astrocartographyResult() {
  const inputSnapshot = {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9028,
    longitude: 12.4964,
    birthTimePrecision: "exact" as const
  };
  return {
    schemaVersion: "chart-result.v1",
    method: "astrocartography",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: { zodiac: "tropical" as const, ...settings() },
    inputSnapshot,
    result: {
      lines: completeAstrocartographyLines(),
      warnings: []
    }
  };
}

function toV2ChartResult(
  result: ReturnType<typeof astrocartographyResult> | ReturnType<typeof solarReturnResult>
): ReproducibleChartResult {
  const candidate = {
    ...result,
    schemaVersion: "chart-result.v2",
    methodVersion: chartMethodVersions[result.method as keyof typeof chartMethodVersions],
    provider: {
      name: "kerykeion",
      version: executionProfile.kerykeionVersion,
      pyswissephVersion: executionProfile.pyswissephVersion,
      ephemeris: executionProfile.expectedEphemeris,
      ephemerisFlags: [...executionProfile.expectedEphemerisFlags],
      ephemerisDataRevision: executionProfile.expectedEphemerisDataRevision
    },
    reproducibilityFingerprint: `sha256:${"0".repeat(64)}`
  } as unknown as ReproducibleChartResult;
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function completeAstrocartographyLines() {
  const points = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ];
  const angles = ["mc", "ic", "asc", "dsc"];
  return points.flatMap((point, pointIndex) =>
    angles.map((angle, angleIndex) => ({
      id: `${point}_${angle}`,
      point,
      angle,
      label: `${point} ${angle}`,
      path: [
        { latitude: -66, longitude: -80 + pointIndex * 8 + angleIndex },
        { latitude: 0, longitude: -80 + pointIndex * 8 + angleIndex },
        { latitude: 66, longitude: -80 + pointIndex * 8 + angleIndex }
      ]
    }))
  );
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

function request(): AstrologerSessionRequest {
  return {
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as AstrologerSessionRequest;
}

function v2Envelope(
  method: keyof typeof chartMethodVersions,
  participants: readonly { readonly role: "subject" | "partner"; readonly clientId: string }[]
) {
  return {
    interpretationMode: method === "natal" ? "adult_natal" : "legacy_unclassified",
    methodVersion: chartMethodVersions[method],
    executionProfile,
    participants,
    maxAttempts: 3,
    targetCalculationId: null,
    expectedSourceChecksum: null
  };
}

function raise(): never {
  throw new Error("Unexpected dependency call");
}
