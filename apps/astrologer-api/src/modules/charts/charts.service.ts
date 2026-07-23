import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  assertChartBirthDataReady,
  createChartJobAndRequestCalculation,
  createNatalChartJobAndRequestCalculation,
  sha256CanonicalJson,
  type CanonicalJson,
  type ChartCalculationCommandStore,
  type ChartCalculationJob,
  type ChartCalculationJobStore,
  type ChartReadyBirthData,
  type ClientStore
} from "@elevenhouse/domain";
import {
  chartCalculationResponseSchema,
  chartCompositeJobCreateRequestSchema,
  chartHoraryJobCreateRequestSchema,
  chartJobResponseSchema,
  chartNatalJobCreateRequestSchema,
  chartNatalJobCreateResponseSchema,
  chartProgressionJobCreateRequestSchema,
  chartSolarReturnJobCreateRequestSchema,
  chartSynastryJobCreateRequestSchema,
  chartTransitJobCreateRequestSchema,
  storedChartCalculationPayloadSchema,
  type ChartNatalJobCreateRequest,
  type ChartCalculationResponse,
  type ChartCompositeJobCreateRequest,
  type ChartHoraryJobCreateRequest,
  type ChartJobResponse,
  type ChartNatalJobCreateResponse,
  type ChartProgressionJobCreateRequest,
  type ChartSolarReturnJobCreateRequest,
  type ChartSynastryJobCreateRequest,
  type ChartTransitJobCreateRequest
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import { CLIENT_STORE } from "../clients/clients.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { chartHttpError, mapChartError } from "./chart-http-errors";
import { CHART_COMMAND_STORE, CHART_JOB_STORE } from "./charts.tokens";

const calculationIdParamSchema = z.object({ calculationId: z.string().uuid() }).strict();
const jobIdParamSchema = z.object({ jobId: z.string().uuid() }).strict();
const providerVersion = "kerykeion-5.12";

@Injectable()
export class ChartsService {
  constructor(
    @Inject(CLIENT_STORE) private readonly clientStore: ClientStore,
    @Inject(CHART_COMMAND_STORE) private readonly commandStore: ChartCalculationCommandStore,
    @Inject(CHART_JOB_STORE) private readonly jobStore: ChartCalculationJobStore,
    private readonly clock: SystemClock
  ) {}

  async createNatalJob(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ChartNatalJobCreateResponse> {
    const parsedBody = parseChartContract<ChartNatalJobCreateRequest>(
      chartNatalJobCreateRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapChartError(async () => {
      const client = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.clientId
      });
      if (!client?.birthData) {
        throw chartHttpError(404, "CHART_CLIENT_NOT_FOUND", "Client was not found");
      }
      const readyBirthData = assertChartBirthDataReady(client.birthData);
      const inputSnapshot = toChartInputSnapshot(readyBirthData);
      const requestFingerprint = sha256CanonicalJson({
        schemaVersion: "chart-request.v1",
        providerVersion,
        method: "natal",
        clientId: parsedBody.clientId,
        inputSnapshot: inputSnapshot as CanonicalJson,
        settings: parsedBody.settings as CanonicalJson
      });
      const outcome = await createNatalChartJobAndRequestCalculation({
        store: this.commandStore,
        ownerUserId,
        clientId: parsedBody.clientId,
        inputFingerprint: requestFingerprint,
        inputSnapshot,
        settingsSnapshot: parsedBody.settings,
        now: this.clock.now()
      });
      if (outcome.kind === "existing_result") {
        const result = await this.jobStore.getOwnerScopedResult({
          ownerUserId,
          calculationId: outcome.calculationId
        });
        if (!result) {
          throw chartHttpError(
            404,
            "CHART_CALCULATION_NOT_FOUND",
            "Chart calculation was not found"
          );
        }
        return chartNatalJobCreateResponseSchema.parse({
          status: "succeeded",
          calculationId: outcome.calculationId,
          result: storedChartCalculationPayloadSchema.parse(result)
        });
      }
      return chartNatalJobCreateResponseSchema.parse({
        status: "calculating",
        jobId: outcome.jobId
      });
    });
  }

  async createTransitJob(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ChartNatalJobCreateResponse> {
    const parsedBody = parseChartContract<ChartTransitJobCreateRequest>(
      chartTransitJobCreateRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapChartError(async () => {
      const client = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.clientId
      });
      if (!client?.birthData) {
        throw chartHttpError(404, "CHART_CLIENT_NOT_FOUND", "Client was not found");
      }
      const readyBirthData = assertChartBirthDataReady(client.birthData);
      const inputSnapshot = toChartInputSnapshot(readyBirthData);
      const transitSnapshot = {
        date: parsedBody.transit.date,
        time: parsedBody.transit.time,
        timezone: parsedBody.transit.timezone ?? inputSnapshot.timezone,
        latitude: parsedBody.transit.latitude ?? inputSnapshot.latitude,
        longitude: parsedBody.transit.longitude ?? inputSnapshot.longitude
      };
      const requestSnapshot = { inputSnapshot, transitSnapshot };
      const requestFingerprint = sha256CanonicalJson({
        schemaVersion: "chart-request.v1",
        providerVersion,
        method: "transit",
        clientId: parsedBody.clientId,
        inputSnapshot: requestSnapshot as CanonicalJson,
        settings: parsedBody.settings as CanonicalJson
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        method: "transit",
        ownerUserId,
        clientId: parsedBody.clientId,
        inputFingerprint: requestFingerprint,
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        now: this.clock.now()
      });
      if (outcome.kind === "existing_result") {
        const result = await this.jobStore.getOwnerScopedResult({
          ownerUserId,
          calculationId: outcome.calculationId
        });
        if (!result) {
          throw chartHttpError(
            404,
            "CHART_CALCULATION_NOT_FOUND",
            "Chart calculation was not found"
          );
        }
        return chartNatalJobCreateResponseSchema.parse({
          status: "succeeded",
          calculationId: outcome.calculationId,
          result: storedChartCalculationPayloadSchema.parse(result)
        });
      }
      return chartNatalJobCreateResponseSchema.parse({
        status: "calculating",
        jobId: outcome.jobId
      });
    });
  }

  async createSynastryJob(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ChartNatalJobCreateResponse> {
    const parsedBody = parseChartContract<ChartSynastryJobCreateRequest>(
      chartSynastryJobCreateRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapChartError(async () => {
      if (parsedBody.clientId === parsedBody.partnerClientId) {
        throw chartHttpError(
          400,
          "CHART_SYNASTRY_PARTNER_REQUIRED",
          "Synastry requires a different partner client"
        );
      }
      const client = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.clientId
      });
      if (!client?.birthData) {
        throw chartHttpError(404, "CHART_CLIENT_NOT_FOUND", "Client was not found");
      }
      const partnerClient = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.partnerClientId
      });
      if (!partnerClient?.birthData) {
        throw chartHttpError(404, "CHART_PARTNER_CLIENT_NOT_FOUND", "Partner client was not found");
      }
      const inputSnapshot = toChartInputSnapshot(assertChartBirthDataReady(client.birthData));
      const partnerInputSnapshot = toChartInputSnapshot(
        assertChartBirthDataReady(partnerClient.birthData)
      );
      const requestSnapshot = {
        inputSnapshot,
        partnerInputSnapshot,
        relationshipSnapshot: {
          primaryClientId: parsedBody.clientId,
          partnerClientId: parsedBody.partnerClientId
        }
      };
      const requestFingerprint = sha256CanonicalJson({
        schemaVersion: "chart-request.v1",
        providerVersion,
        method: "synastry",
        clientId: parsedBody.clientId,
        partnerClientId: parsedBody.partnerClientId,
        inputSnapshot: requestSnapshot as CanonicalJson,
        settings: parsedBody.settings as CanonicalJson
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        method: "synastry",
        ownerUserId,
        clientId: parsedBody.clientId,
        inputFingerprint: requestFingerprint,
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        now: this.clock.now()
      });
      if (outcome.kind === "existing_result") {
        const result = await this.jobStore.getOwnerScopedResult({
          ownerUserId,
          calculationId: outcome.calculationId
        });
        if (!result) {
          throw chartHttpError(
            404,
            "CHART_CALCULATION_NOT_FOUND",
            "Chart calculation was not found"
          );
        }
        return chartNatalJobCreateResponseSchema.parse({
          status: "succeeded",
          calculationId: outcome.calculationId,
          result: storedChartCalculationPayloadSchema.parse(result)
        });
      }
      return chartNatalJobCreateResponseSchema.parse({
        status: "calculating",
        jobId: outcome.jobId
      });
    });
  }

  async createCompositeJob(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ChartNatalJobCreateResponse> {
    const parsedBody = parseChartContract<ChartCompositeJobCreateRequest>(
      chartCompositeJobCreateRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapChartError(async () => {
      if (parsedBody.clientId === parsedBody.partnerClientId) {
        throw chartHttpError(
          400,
          "CHART_COMPOSITE_PARTNER_REQUIRED",
          "Composite requires a different partner client"
        );
      }
      const client = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.clientId
      });
      if (!client?.birthData) {
        throw chartHttpError(404, "CHART_CLIENT_NOT_FOUND", "Client was not found");
      }
      const partnerClient = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.partnerClientId
      });
      if (!partnerClient?.birthData) {
        throw chartHttpError(404, "CHART_PARTNER_CLIENT_NOT_FOUND", "Partner client was not found");
      }
      const inputSnapshot = toChartInputSnapshot(assertChartBirthDataReady(client.birthData));
      const partnerInputSnapshot = toChartInputSnapshot(
        assertChartBirthDataReady(partnerClient.birthData)
      );
      const requestSnapshot = {
        inputSnapshot,
        partnerInputSnapshot,
        relationshipSnapshot: {
          primaryClientId: parsedBody.clientId,
          partnerClientId: parsedBody.partnerClientId
        }
      };
      const requestFingerprint = sha256CanonicalJson({
        schemaVersion: "chart-request.v1",
        providerVersion,
        method: "composite",
        clientId: parsedBody.clientId,
        partnerClientId: parsedBody.partnerClientId,
        inputSnapshot: requestSnapshot as CanonicalJson,
        settings: parsedBody.settings as CanonicalJson
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        method: "composite",
        ownerUserId,
        clientId: parsedBody.clientId,
        inputFingerprint: requestFingerprint,
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        now: this.clock.now()
      });
      if (outcome.kind === "existing_result") {
        const result = await this.jobStore.getOwnerScopedResult({
          ownerUserId,
          calculationId: outcome.calculationId
        });
        if (!result) {
          throw chartHttpError(
            404,
            "CHART_CALCULATION_NOT_FOUND",
            "Chart calculation was not found"
          );
        }
        return chartNatalJobCreateResponseSchema.parse({
          status: "succeeded",
          calculationId: outcome.calculationId,
          result: storedChartCalculationPayloadSchema.parse(result)
        });
      }
      return chartNatalJobCreateResponseSchema.parse({
        status: "calculating",
        jobId: outcome.jobId
      });
    });
  }

  async createSolarReturnJob(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ChartNatalJobCreateResponse> {
    const parsedBody = parseChartContract<ChartSolarReturnJobCreateRequest>(
      chartSolarReturnJobCreateRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapChartError(async () => {
      const client = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.clientId
      });
      if (!client?.birthData) {
        throw chartHttpError(404, "CHART_CLIENT_NOT_FOUND", "Client was not found");
      }
      const inputSnapshot = toChartInputSnapshot(assertChartBirthDataReady(client.birthData));
      const solarReturnSnapshot = {
        year: parsedBody.year,
        returnType: "solar" as const,
        location: {
          timezone: inputSnapshot.timezone,
          latitude: inputSnapshot.latitude,
          longitude: inputSnapshot.longitude
        }
      };
      const requestSnapshot = { inputSnapshot, solarReturnSnapshot };
      const requestFingerprint = sha256CanonicalJson({
        schemaVersion: "chart-request.v1",
        providerVersion,
        method: "solar_return",
        clientId: parsedBody.clientId,
        inputSnapshot: requestSnapshot as CanonicalJson,
        settings: parsedBody.settings as CanonicalJson
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        method: "solar_return",
        ownerUserId,
        clientId: parsedBody.clientId,
        inputFingerprint: requestFingerprint,
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        now: this.clock.now()
      });
      if (outcome.kind === "existing_result") {
        const result = await this.jobStore.getOwnerScopedResult({
          ownerUserId,
          calculationId: outcome.calculationId
        });
        if (!result) {
          throw chartHttpError(
            404,
            "CHART_CALCULATION_NOT_FOUND",
            "Chart calculation was not found"
          );
        }
        return chartNatalJobCreateResponseSchema.parse({
          status: "succeeded",
          calculationId: outcome.calculationId,
          result: storedChartCalculationPayloadSchema.parse(result)
        });
      }
      return chartNatalJobCreateResponseSchema.parse({
        status: "calculating",
        jobId: outcome.jobId
      });
    });
  }

  async createProgressionJob(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ChartNatalJobCreateResponse> {
    const parsedBody = parseChartContract<ChartProgressionJobCreateRequest>(
      chartProgressionJobCreateRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapChartError(async () => {
      const client = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.clientId
      });
      if (!client?.birthData) {
        throw chartHttpError(404, "CHART_CLIENT_NOT_FOUND", "Client was not found");
      }
      const inputSnapshot = toChartInputSnapshot(assertChartBirthDataReady(client.birthData));
      const progressionSnapshot = {
        targetDate: parsedBody.targetDate,
        progressionType: "secondary" as const
      };
      const requestSnapshot = { inputSnapshot, progressionSnapshot };
      const requestFingerprint = sha256CanonicalJson({
        schemaVersion: "chart-request.v1",
        providerVersion,
        method: "progression",
        clientId: parsedBody.clientId,
        inputSnapshot: requestSnapshot as CanonicalJson,
        settings: parsedBody.settings as CanonicalJson
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        method: "progression",
        ownerUserId,
        clientId: parsedBody.clientId,
        inputFingerprint: requestFingerprint,
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        now: this.clock.now()
      });
      if (outcome.kind === "existing_result") {
        const result = await this.jobStore.getOwnerScopedResult({
          ownerUserId,
          calculationId: outcome.calculationId
        });
        if (!result) {
          throw chartHttpError(
            404,
            "CHART_CALCULATION_NOT_FOUND",
            "Chart calculation was not found"
          );
        }
        return chartNatalJobCreateResponseSchema.parse({
          status: "succeeded",
          calculationId: outcome.calculationId,
          result: storedChartCalculationPayloadSchema.parse(result)
        });
      }
      return chartNatalJobCreateResponseSchema.parse({
        status: "calculating",
        jobId: outcome.jobId
      });
    });
  }

  async createHoraryJob(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ChartNatalJobCreateResponse> {
    const parsedBody = parseChartContract<ChartHoraryJobCreateRequest>(
      chartHoraryJobCreateRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapChartError(async () => {
      const client = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.clientId
      });
      if (!client) {
        throw chartHttpError(404, "CHART_CLIENT_NOT_FOUND", "Client was not found");
      }
      const requestSnapshot = { questionSnapshot: parsedBody.question };
      const requestFingerprint = sha256CanonicalJson({
        schemaVersion: "chart-request.v1",
        providerVersion,
        method: "horary",
        clientId: parsedBody.clientId,
        inputSnapshot: requestSnapshot as CanonicalJson,
        settings: parsedBody.settings as CanonicalJson
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        method: "horary",
        ownerUserId,
        clientId: parsedBody.clientId,
        inputFingerprint: requestFingerprint,
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        now: this.clock.now()
      });
      if (outcome.kind === "existing_result") {
        const result = await this.jobStore.getOwnerScopedResult({
          ownerUserId,
          calculationId: outcome.calculationId
        });
        if (!result) {
          throw chartHttpError(
            404,
            "CHART_CALCULATION_NOT_FOUND",
            "Chart calculation was not found"
          );
        }
        return chartNatalJobCreateResponseSchema.parse({
          status: "succeeded",
          calculationId: outcome.calculationId,
          result: storedChartCalculationPayloadSchema.parse(result)
        });
      }
      return chartNatalJobCreateResponseSchema.parse({
        status: "calculating",
        jobId: outcome.jobId
      });
    });
  }

  async getJob(jobId: string, request: AstrologerSessionRequest): Promise<ChartJobResponse> {
    const params = parseChartContract<{ jobId: string }>(jobIdParamSchema, { jobId });
    const ownerUserId = requireOwnerUserId(request);
    const job = await this.jobStore.getOwnerScopedJob({ ownerUserId, jobId: params.jobId });
    if (!job) throw chartHttpError(404, "CHART_JOB_NOT_FOUND", "Chart job was not found");
    return toJobResponse(job);
  }

  async getCalculation(
    calculationId: string,
    request: AstrologerSessionRequest
  ): Promise<ChartCalculationResponse> {
    const params = parseChartContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const ownerUserId = requireOwnerUserId(request);
    const result = await this.jobStore.getOwnerScopedResult({
      ownerUserId,
      calculationId: params.calculationId
    });
    if (!result) {
      throw chartHttpError(404, "CHART_CALCULATION_NOT_FOUND", "Chart calculation was not found");
    }
    return chartCalculationResponseSchema.parse({
      calculationId: params.calculationId,
      result: storedChartCalculationPayloadSchema.parse(result)
    });
  }

  async recalculate(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ChartNatalJobCreateResponse> {
    parseChartContract<{ calculationId: string }>(calculationIdParamSchema, { calculationId });
    return this.createNatalJob(body, request);
  }
}

function toJobResponse(job: ChartCalculationJob): ChartJobResponse {
  return chartJobResponseSchema.parse({
    id: job.id,
    status: job.status === "queued" || job.status === "processing" ? "calculating" : job.status,
    calculationId: job.resultCalculationId,
    failureCode: job.lastErrorCode,
    failureMessage: job.lastErrorMessage
  });
}

function toChartInputSnapshot(input: ChartReadyBirthData) {
  return {
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    timezone: input.birthTimezone,
    latitude: input.birthLatitude,
    longitude: input.birthLongitude,
    birthTimePrecision: input.birthTimePrecision,
    ...(input.birthTimeDstOccurrence ? { dstOccurrence: input.birthTimeDstOccurrence } : {})
  };
}

function parseChartContract<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  value: unknown
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw chartHttpError(400, "CHART_VALIDATION_FAILED", "Invalid chart request");
  }
  return result.data as T;
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }
  return ownerUserId;
}
