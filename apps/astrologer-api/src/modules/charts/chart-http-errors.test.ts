import { describe, expect, it } from "vitest";
import {
  ChartAiConsentRequiredError,
  ChartAiDraftIdempotencyKeyReuseError,
  ChartAiDraftInProgressError,
  ChartAiDraftOutcomeUnknownError,
  ChartBirthDataReadinessError,
  ChartParticipantRelationshipInactiveError,
  ChartStoredResultIntegrityError,
  ClientConsentIntegrityError,
  ClientConsentRelationshipInactiveError,
  ClientConsentRelationshipRequiredError,
  type ChartBirthDataReadinessErrorCode
} from "@elevenhouse/domain";
import { mapChartError } from "./chart-http-errors";

describe("mapChartError", () => {
  it.each([
    "CHART_BIRTH_DATE_REQUIRED",
    "CHART_BIRTH_DATE_INVALID",
    "CHART_BIRTH_TIME_REQUIRED",
    "CHART_BIRTH_TIME_INVALID",
    "CHART_BIRTH_TIMEZONE_REQUIRED",
    "CHART_BIRTH_TIMEZONE_INVALID",
    "CHART_BIRTH_TIME_DST_OCCURRENCE_REQUIRED",
    "CHART_BIRTH_TIME_NONEXISTENT",
    "CHART_BIRTH_COORDINATES_REQUIRED"
  ] satisfies readonly ChartBirthDataReadinessErrorCode[])(
    "maps %s without losing its code",
    async (code) => {
      await expect(
        mapChartError(async () => {
          throw new ChartBirthDataReadinessError(code);
        })
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code })
      });
    }
  );

  it("maps stored-result integrity failure to a stable conflict response", async () => {
    await expect(
      mapChartError(async () => {
        throw new ChartStoredResultIntegrityError();
      })
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: "CHART_STORED_RESULT_INTEGRITY_INVALID",
        message: "Stored chart result failed integrity validation"
      })
    });
  });

  it("maps a relationship revoked during chart submission to a typed conflict", async () => {
    await expect(
      mapChartError(async () => {
        throw new ChartParticipantRelationshipInactiveError();
      })
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: "CHART_PARTICIPANT_RELATIONSHIP_INACTIVE",
        message: "Client relationship changed; reload and retry"
      })
    });
  });

  it.each([
    new ChartAiConsentRequiredError("11111111-1111-4111-8111-111111111111", "missing"),
    new ClientConsentRelationshipRequiredError("11111111-1111-4111-8111-111111111111"),
    new ClientConsentRelationshipInactiveError("11111111-1111-4111-8111-111111111111", "archived")
  ])("maps unavailable participant consent to one non-identifying response", async (error) => {
    await expect(
      mapChartError(async () => {
        throw error;
      })
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        code: "CHART_AI_CONSENT_REQUIRED",
        message: "Current client consent is required for chart AI generation"
      })
    });
  });

  it("maps inconsistent consent evidence to an observable fail-closed response", async () => {
    await expect(
      mapChartError(async () => {
        throw new ClientConsentIntegrityError();
      })
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({
        code: "CHART_AI_CONSENT_EVIDENCE_UNAVAILABLE"
      })
    });
  });

  it.each([new ChartAiDraftIdempotencyKeyReuseError(), new ChartAiDraftInProgressError()])(
    "maps chart AI command conflicts to typed 409 responses",
    async (error) => {
      await expect(
        mapChartError(async () => {
          throw error;
        })
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: error.code })
      });
    }
  );

  it("maps ambiguous chart AI outcomes to observable 503 responses", async () => {
    await expect(
      mapChartError(async () => {
        throw new ChartAiDraftOutcomeUnknownError();
      })
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN" })
    });
  });
});
