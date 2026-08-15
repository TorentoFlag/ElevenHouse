import { performance } from "node:perf_hooks";
import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException
} from "@nestjs/common";
import {
  chartInterpretationDraftPromptV2,
  renderChartInterpretationV2Text,
  type AiGenerationResult,
  type ChartInterpretationDraftPromptOutput
} from "@elevenhouse/ai";
import {
  assertChartBirthDataReady,
  buildChartAiDraftCommandRequestHash,
  buildChartJobRequestFingerprint,
  chartAiDraftCommandTtlMs,
  CalculationInterpretationModeUnavailableError,
  ChartAiDraftInProgressError,
  ChartAiDraftOutcomeUnknownError,
  createChartJobAndRequestCalculation,
  createNatalChartJobAndRequestCalculation,
  DEFAULT_CHART_JOB_MAX_ATTEMPTS,
  deriveChartCalculationCapabilities,
  getCalculation,
  assertStoredChartCalculationIntegrity,
  assertStoredChartCalculationSelfIntegrity,
  listDictionaryEntriesByCodes,
  prepareChartRecalculation,
  resolveChartAiDraftTariffCapabilities,
  resolveChartInterpretationMode,
  resolvePlatformTariffCapabilities,
  saveCalculationInterpretation,
  ChartStoredResultIntegrityError,
  type AstrologerProfileStore,
  type CanonicalJson,
  type CalculationRecord,
  type CalculationStore,
  type ChartAiDraftCommandKnownFailure,
  type ChartAiDraftCommandResult,
  type ChartAiDraftCommandStore,
  type ChartCalculationCommandStore,
  type CreateOrReuseChartJobResult,
  type ChartCalculationJob,
  type ChartCalculationJobStore,
  type ChartCalculationParticipant,
  type ChartInterpretationMode,
  type ChartRecalculationTarget,
  type ChartReadyBirthData,
  type ClientStore,
  type DictionaryStore,
  type PlatformTariffEntitlementStore
} from "@elevenhouse/domain";
import {
  chartAstrocartographyJobCreateRequestSchema,
  chartAstrocartographyJobInputSnapshotSchema,
  chartCalculationResponseSchema,
  chartCompositeJobCreateRequestSchema,
  createChartAiDraftRequestSchema,
  chartHoraryJobCreateRequestSchema,
  chartHoraryJobInputSnapshotSchema,
  chartInputSnapshotSchema,
  chartJobResponseSchema,
  chartNatalJobCreateRequestSchema,
  chartNatalJobCreateResponseSchema,
  chartProgressionJobCreateRequestSchema,
  chartProgressionJobInputSnapshotSchema,
  chartRecalculateRequestSchema,
  chartRelationshipJobInputSnapshotSchema,
  chartSolarReturnJobCreateRequestSchema,
  chartSolarReturnJobInputSnapshotSchema,
  chartSynastryJobCreateRequestSchema,
  chartTransitJobCreateRequestSchema,
  chartTransitJobInputSnapshotSchema,
  chartMethodVersions,
  reproducibleChartResultSchema,
  chartResultSchema,
  type ChartCalculationMethod,
  type CalculationRecordResponse,
  type CreateChartAiDraftRequest,
  type ChartNatalJobCreateRequest,
  type ChartAstrocartographyJobCreateRequest,
  type ChartCalculationResponse,
  type ChartCompositeJobCreateRequest,
  type ChartHoraryJobCreateRequest,
  type ChartJobResponse,
  type ChartNatalJobCreateResponse,
  type ChartProgressionJobCreateRequest,
  type ChartRecalculateRequest,
  type ChartSolarReturnJobCreateRequest,
  type ChartSynastryJobCreateRequest,
  type ChartTransitJobCreateRequest
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";
import { AiGenerationService } from "../ai/ai-generation.service";
import { ASTROLOGER_PROFILE_STORE } from "../astrologer-profile/astrologer-profile.tokens";
import { toCalculationResponse } from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import { SystemClock } from "../clock/system-clock.service";
import { CLIENT_STORE } from "../clients/clients.tokens";
import { DICTIONARY_STORE } from "../dictionary/dictionary.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { chartHttpError, mapChartError } from "./chart-http-errors";
import { buildChartAiDraftContext, getChartAiDictionaryCodes } from "./chart-ai-context";
import { ChartExecutionProfileProvider } from "./chart-execution-profile.provider";
import {
  CHART_AI_DRAFT_COMMAND_STORE,
  CHART_COMMAND_STORE,
  CHART_JOB_STORE
} from "./charts.tokens";
import { PLATFORM_TARIFF_ENTITLEMENT_STORE } from "../platform-entitlements/platform-entitlements.tokens";

const calculationIdParamSchema = z.object({ calculationId: z.string().uuid() }).strict();
const jobIdParamSchema = z.object({ jobId: z.string().uuid() }).strict();
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/u);
const CHART_AI_DRAFT_SAVE_ATTEMPTS = 2;

@Injectable()
export class ChartsService {
  private readonly logger = new Logger(ChartsService.name);

  constructor(
    @Inject(CLIENT_STORE) private readonly clientStore: ClientStore,
    @Inject(CHART_COMMAND_STORE) private readonly commandStore: ChartCalculationCommandStore,
    @Inject(CHART_JOB_STORE) private readonly jobStore: ChartCalculationJobStore,
    @Inject(CALCULATION_STORE) private readonly calculationStore: CalculationStore,
    @Inject(DICTIONARY_STORE) private readonly dictionaryStore: DictionaryStore,
    @Inject(ASTROLOGER_PROFILE_STORE)
    private readonly profileStore: AstrologerProfileStore,
    private readonly clock: SystemClock,
    private readonly aiGeneration: AiGenerationService,
    private readonly executionProfile: ChartExecutionProfileProvider,
    @Inject(CHART_AI_DRAFT_COMMAND_STORE)
    private readonly aiDraftCommandStore: ChartAiDraftCommandStore,
    @Inject(PLATFORM_TARIFF_ENTITLEMENT_STORE)
    private readonly entitlementStore: PlatformTariffEntitlementStore
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
    const startedAt = performance.now();
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
      const job = this.buildCreationEnvelope({
        ownerUserId,
        method: "natal",
        interpretationMode: parsedBody.interpretationMode,
        inputSnapshot,
        settingsSnapshot: parsedBody.settings,
        participants: [{ role: "subject", clientId: parsedBody.clientId }]
      });
      const outcome = await createNatalChartJobAndRequestCalculation({
        store: this.commandStore,
        ...job,
        now: this.clock.now()
      });
      return this.toObservedJobCommandResponse({
        operation: "create",
        method: "natal",
        startedAt,
        outcome
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
    const startedAt = performance.now();
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
        longitude: parsedBody.transit.longitude ?? inputSnapshot.longitude,
        ...(parsedBody.transit.dstOccurrence
          ? { dstOccurrence: parsedBody.transit.dstOccurrence }
          : {})
      };
      const requestSnapshot = { inputSnapshot, transitSnapshot };
      const job = this.buildCreationEnvelope({
        ownerUserId,
        method: "transit",
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        participants: [{ role: "subject", clientId: parsedBody.clientId }]
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        ...job,
        now: this.clock.now()
      });
      return this.toObservedJobCommandResponse({
        operation: "create",
        method: "transit",
        startedAt,
        outcome
      });
    });
  }

  async createAstrocartographyJob(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ChartNatalJobCreateResponse> {
    const parsedBody = parseChartContract<ChartAstrocartographyJobCreateRequest>(
      chartAstrocartographyJobCreateRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    const startedAt = performance.now();
    return mapChartError(async () => {
      const client = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.clientId
      });
      if (!client?.birthData) {
        throw chartHttpError(404, "CHART_CLIENT_NOT_FOUND", "Client was not found");
      }
      const inputSnapshot = toChartInputSnapshot(assertChartBirthDataReady(client.birthData));
      const requestSnapshot = { inputSnapshot };
      const job = this.buildCreationEnvelope({
        ownerUserId,
        method: "astrocartography",
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        participants: [{ role: "subject", clientId: parsedBody.clientId }]
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        ...job,
        now: this.clock.now()
      });
      return this.toObservedJobCommandResponse({
        operation: "create",
        method: "astrocartography",
        startedAt,
        outcome
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
    const startedAt = performance.now();
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
        partnerInputSnapshot
      };
      const job = this.buildCreationEnvelope({
        ownerUserId,
        method: "synastry",
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        participants: [
          { role: "subject", clientId: parsedBody.clientId },
          { role: "partner", clientId: parsedBody.partnerClientId }
        ]
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        ...job,
        now: this.clock.now()
      });
      return this.toObservedJobCommandResponse({
        operation: "create",
        method: "synastry",
        startedAt,
        outcome
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
    const startedAt = performance.now();
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
        partnerInputSnapshot
      };
      const job = this.buildCreationEnvelope({
        ownerUserId,
        method: "composite",
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        participants: [
          { role: "subject", clientId: parsedBody.clientId },
          { role: "partner", clientId: parsedBody.partnerClientId }
        ]
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        ...job,
        now: this.clock.now()
      });
      return this.toObservedJobCommandResponse({
        operation: "create",
        method: "composite",
        startedAt,
        outcome
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
    const startedAt = performance.now();
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
      const job = this.buildCreationEnvelope({
        ownerUserId,
        method: "solar_return",
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        participants: [{ role: "subject", clientId: parsedBody.clientId }]
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        ...job,
        now: this.clock.now()
      });
      return this.toObservedJobCommandResponse({
        operation: "create",
        method: "solar_return",
        startedAt,
        outcome
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
    const startedAt = performance.now();
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
      const job = this.buildCreationEnvelope({
        ownerUserId,
        method: "progression",
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        participants: [{ role: "subject", clientId: parsedBody.clientId }]
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        ...job,
        now: this.clock.now()
      });
      return this.toObservedJobCommandResponse({
        operation: "create",
        method: "progression",
        startedAt,
        outcome
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
    const startedAt = performance.now();
    return mapChartError(async () => {
      const client = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: parsedBody.clientId
      });
      if (!client) {
        throw chartHttpError(404, "CHART_CLIENT_NOT_FOUND", "Client was not found");
      }
      const requestSnapshot = { questionSnapshot: parsedBody.question };
      const job = this.buildCreationEnvelope({
        ownerUserId,
        method: "horary",
        inputSnapshot: requestSnapshot,
        settingsSnapshot: parsedBody.settings,
        participants: [{ role: "subject", clientId: parsedBody.clientId }]
      });
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        ...job,
        now: this.clock.now()
      });
      return this.toObservedJobCommandResponse({
        operation: "create",
        method: "horary",
        startedAt,
        outcome
      });
    });
  }

  private toObservedJobCommandResponse(input: {
    readonly operation: "create" | "recalculate";
    readonly method: ChartCalculationMethod;
    readonly startedAt: number;
    readonly outcome: CreateOrReuseChartJobResult;
  }): ChartNatalJobCreateResponse {
    const durationMs = performance.now() - input.startedAt;
    if (input.outcome.kind === "existing_result") {
      const response = chartNatalJobCreateResponseSchema.parse({
        status: "succeeded",
        calculationId: input.outcome.calculationId,
        result: input.outcome.result
      });
      this.logger.log({
        event: "chart_job_command_completed",
        operation: input.operation,
        method: input.method,
        outcome: "reused_result",
        calculationId: input.outcome.calculationId,
        durationMs
      });
      return response;
    }
    const response = chartNatalJobCreateResponseSchema.parse({
      status: "calculating",
      jobId: input.outcome.jobId
    });
    this.logger.log({
      event: "chart_job_command_completed",
      operation: input.operation,
      method: input.method,
      outcome: "active_job",
      jobId: input.outcome.jobId,
      durationMs
    });
    return response;
  }

  private buildCreationEnvelope(input: {
    readonly ownerUserId: string;
    readonly method: ChartCalculationMethod;
    readonly interpretationMode?: ChartInterpretationMode;
    readonly inputSnapshot: unknown;
    readonly settingsSnapshot: unknown;
    readonly participants: readonly ChartCalculationParticipant[];
  }) {
    return this.buildJobEnvelope({
      ...input,
      targetCalculationId: null,
      expectedSourceChecksum: null
    });
  }

  private buildReplacementEnvelope(input: {
    readonly ownerUserId: string;
    readonly method: ChartCalculationMethod;
    readonly interpretationMode: ChartInterpretationMode;
    readonly inputSnapshot: unknown;
    readonly settingsSnapshot: unknown;
    readonly participants: readonly ChartCalculationParticipant[];
    readonly targetCalculationId: string;
    readonly expectedSourceChecksum: string;
  }) {
    return this.buildJobEnvelope(input);
  }

  private buildJobEnvelope(input: {
    readonly ownerUserId: string;
    readonly method: ChartCalculationMethod;
    readonly interpretationMode?: ChartInterpretationMode;
    readonly inputSnapshot: unknown;
    readonly settingsSnapshot: unknown;
    readonly participants: readonly ChartCalculationParticipant[];
    readonly targetCalculationId: string | null;
    readonly expectedSourceChecksum: string | null;
  }) {
    const clientId = input.participants[0]?.clientId;
    if (!clientId) throw new Error("CHART_JOB_PARTICIPANTS_INVALID");
    const methodVersion = chartMethodVersions[input.method];
    const interpretationMode =
      input.interpretationMode ??
      (input.method === "natal"
        ? raiseChartJobInterpretationModeRequired()
        : "legacy_unclassified");
    const executionProfile = this.executionProfile.getProfile();
    const inputFingerprint = buildChartJobRequestFingerprint({
      ownerUserId: input.ownerUserId,
      method: input.method,
      interpretationMode,
      methodVersion,
      executionProfile,
      settings: input.settingsSnapshot as CanonicalJson,
      inputSnapshot: input.inputSnapshot as CanonicalJson,
      participants: input.participants,
      targetCalculationId: input.targetCalculationId,
      expectedSourceChecksum: input.expectedSourceChecksum
    });
    return {
      method: input.method,
      interpretationMode,
      methodVersion,
      executionProfile,
      ownerUserId: input.ownerUserId,
      clientId,
      participants: input.participants,
      maxAttempts: DEFAULT_CHART_JOB_MAX_ATTEMPTS,
      targetCalculationId: input.targetCalculationId,
      expectedSourceChecksum: input.expectedSourceChecksum,
      inputFingerprint,
      inputSnapshot: input.inputSnapshot,
      settingsSnapshot: input.settingsSnapshot
    };
  }

  async getJob(jobId: string, request: AstrologerSessionRequest): Promise<ChartJobResponse> {
    const params = parseChartContract<{ jobId: string }>(jobIdParamSchema, { jobId });
    const ownerUserId = requireOwnerUserId(request);
    const job = await this.jobStore.getOwnerScopedJob({ ownerUserId, jobId: params.jobId });
    if (!job) throw chartHttpError(404, "CHART_JOB_NOT_FOUND", "Chart job was not found");
    const profile = await this.profileStore.findByOwnerUserId({ ownerUserId });
    return toJobResponse(job, profile?.locale === "en" ? "en" : "ru");
  }

  async getCalculation(
    calculationId: string,
    request: AstrologerSessionRequest
  ): Promise<ChartCalculationResponse> {
    const params = parseChartContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const ownerUserId = requireOwnerUserId(request);
    return mapChartError(async () => {
      const calculation = await getCalculation({
        store: this.calculationStore,
        ownerUserId,
        calculationId: params.calculationId
      });
      const expectedExecutionProfile = this.executionProfile.getProfile();
      const result = assertReadableChartCalculation(calculation, expectedExecutionProfile);
      return chartCalculationResponseSchema.parse({
        calculationId: calculation.id,
        interpretationMode: resolveChartInterpretationMode(calculation, result.method),
        result,
        capabilities: deriveChartCalculationCapabilities({
          calculation,
          expectedExecutionProfile
        })
      });
    });
  }

  async recalculate(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ChartNatalJobCreateResponse> {
    const params = parseChartContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsedBody = parseChartContract<ChartRecalculateRequest>(
      chartRecalculateRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    const startedAt = performance.now();
    return mapChartError(async () => {
      const calculation = await getCalculation({
        store: this.calculationStore,
        ownerUserId,
        calculationId: params.calculationId
      });
      const target = prepareChartRecalculation({
        calculation,
        ownerUserId,
        calculationId: params.calculationId,
        expectedResultChecksum: parsedBody.expectedResultChecksum,
        expectedExecutionProfile: this.executionProfile.getProfile(),
        settings: parsedBody.settings
      });
      const inputSnapshot = await this.reconstructCurrentInput(ownerUserId, target);
      const outcome = await createChartJobAndRequestCalculation({
        store: this.commandStore,
        ...this.buildReplacementEnvelope({
          ownerUserId,
          method: target.method,
          interpretationMode: target.interpretationMode,
          inputSnapshot,
          settingsSnapshot: target.settings,
          participants: target.participants,
          targetCalculationId: target.calculationId,
          expectedSourceChecksum: target.expectedSourceChecksum
        }),
        now: this.clock.now()
      });
      return this.toObservedJobCommandResponse({
        operation: "recalculate",
        method: target.method,
        startedAt,
        outcome
      });
    });
  }

  private async reconstructCurrentInput(
    ownerUserId: string,
    target: ChartRecalculationTarget
  ): Promise<unknown> {
    const snapshots = new Map<"subject" | "partner", ReturnType<typeof toChartInputSnapshot>>();
    for (const participant of target.participants) {
      const client = await this.clientStore.getAstrologerClient({
        astrologerUserId: ownerUserId,
        clientUserId: participant.clientId
      });
      if (!client || (target.method !== "horary" && !client.birthData)) {
        throw participant.role === "partner"
          ? chartHttpError(404, "CHART_PARTNER_CLIENT_NOT_FOUND", "Partner client was not found")
          : chartHttpError(404, "CHART_CLIENT_NOT_FOUND", "Client was not found");
      }
      if (target.method !== "horary") {
        snapshots.set(
          participant.role,
          toChartInputSnapshot(assertChartBirthDataReady(client.birthData!))
        );
      }
    }

    if (target.method === "horary") {
      return chartHoraryJobInputSnapshotSchema.parse(target.eventSnapshot);
    }
    const inputSnapshot = snapshots.get("subject");
    if (!inputSnapshot) throw new Error("CHART_JOB_PARTICIPANTS_INVALID");
    if (target.method === "natal") return chartInputSnapshotSchema.parse(inputSnapshot);
    if (target.method === "astrocartography") {
      return chartAstrocartographyJobInputSnapshotSchema.parse({ inputSnapshot });
    }
    if (target.method === "transit") {
      return chartTransitJobInputSnapshotSchema.parse({
        inputSnapshot,
        ...target.eventSnapshot
      });
    }
    if (target.method === "synastry" || target.method === "composite") {
      const partnerInputSnapshot = snapshots.get("partner");
      if (!partnerInputSnapshot) throw new Error("CHART_JOB_PARTICIPANTS_INVALID");
      return chartRelationshipJobInputSnapshotSchema.parse({
        inputSnapshot,
        partnerInputSnapshot
      });
    }
    if (target.method === "solar_return") {
      return chartSolarReturnJobInputSnapshotSchema.parse({
        inputSnapshot,
        ...target.eventSnapshot
      });
    }
    return chartProgressionJobInputSnapshotSchema.parse({
      inputSnapshot,
      ...target.eventSnapshot
    });
  }

  async createAiDraft(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest,
    idempotencyKey: unknown
  ): Promise<CalculationRecordResponse> {
    const params = parseChartContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsedBody = parseChartContract<CreateChartAiDraftRequest>(
      createChartAiDraftRequestSchema,
      body
    );
    const normalizedIdempotencyKey = parseChartContract<string>(
      idempotencyKeySchema,
      idempotencyKey
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapChartError(async () => {
      const calculation = await getCalculation({
        store: this.calculationStore,
        ownerUserId,
        calculationId: params.calculationId
      });
      const result = assertChartAiCalculation(calculation);
      const subjectKind = resolveChartAiDraftSubjectKind(calculation, result.method);
      await this.assertChartAiDraftEntitlement(ownerUserId, result.method);
      if (calculation.resultChecksum !== parsedBody.expectedResultChecksum) {
        throw chartHttpError(409, "CHART_RESULT_CHANGED", "Chart result changed; reload and retry");
      }
      const commandNow = this.clock.now();
      const command = await this.aiDraftCommandStore.acquire({
        actorUserId: ownerUserId,
        key: normalizedIdempotencyKey,
        requestHash: buildChartAiDraftCommandRequestHash({
          actorUserId: ownerUserId,
          calculationId: calculation.id,
          body: parsedBody
        }),
        now: commandNow.toISOString(),
        expiresAt: new Date(commandNow.getTime() + chartAiDraftCommandTtlMs).toISOString()
      });

      if (command.kind === "completed") {
        return this.replayAiDraftCommand(command.result, calculation, ownerUserId);
      }
      if (command.kind === "processing") {
        let recovered: ChartAiDraftCommandResult | null;
        try {
          recovered = await this.aiDraftCommandStore.completeSuccess({
            commandId: command.commandId,
            actorUserId: ownerUserId,
            calculationId: calculation.id,
            expectedResultChecksum: parsedBody.expectedResultChecksum,
            now: this.clock.now().toISOString()
          });
        } catch {
          throw new ChartAiDraftOutcomeUnknownError();
        }
        if (recovered) return this.replayAiDraftCommand(recovered, calculation, ownerUserId);
        throw new ChartAiDraftInProgressError();
      }

      let locale: "ru" | "en";
      let dictionary: Awaited<ReturnType<typeof listDictionaryEntriesByCodes>>;
      try {
        assertStoredChartCalculationIntegrity({
          calculation,
          expectedExecutionProfile: this.executionProfile.getProfile()
        });
        const profile = await this.profileStore.findByOwnerUserId({ ownerUserId });
        locale = profile?.locale === "en" ? "en" : "ru";
        dictionary = await listDictionaryEntriesByCodes({
          store: this.dictionaryStore,
          ownerUserId,
          locale,
          codes: getChartAiDictionaryCodes(result)
        });
      } catch (error) {
        const mapped = await mapChartAiPreflightError(error);
        const knownFailure =
          (mapped ? toReplayableChartAiDraftFailure(mapped) : null) ??
          chartAiPreflightUnavailableFailure();
        try {
          const completed = await this.aiDraftCommandStore.completeKnownFailure({
            commandId: command.commandId,
            actorUserId: ownerUserId,
            failure: knownFailure,
            now: this.clock.now().toISOString()
          });
          return this.replayAiDraftCommand(completed, calculation, ownerUserId);
        } catch (completionError) {
          if (completionError instanceof HttpException) throw completionError;
          await this.markAiDraftUnknownIfPossible(command.commandId, ownerUserId);
          throw new ChartAiDraftOutcomeUnknownError();
        }
      }

      let generated: AiGenerationResult<ChartInterpretationDraftPromptOutput>;
      try {
        generated = await this.aiGeneration.generate({
          prompt: chartInterpretationDraftPromptV2,
          input: chartInterpretationDraftPromptV2.inputSchema.parse(
            buildChartAiDraftContext({
              locale,
              result,
              subjectKind,
              dictionaryEntries: dictionary.entries
            })
          ),
          ownerUserId,
          feature: "chart.interpretationDraft",
          resourceEvidence: {
            resourceType: "chart_calculation",
            resourceId: calculation.id,
            sourceChecksum: calculation.resultChecksum
          }
        });
      } catch (error) {
        const knownFailure = toKnownChartAiDraftFailure(error);
        if (knownFailure) {
          try {
            const completed = await this.aiDraftCommandStore.completeKnownFailure({
              commandId: command.commandId,
              actorUserId: ownerUserId,
              failure: knownFailure,
              now: this.clock.now().toISOString()
            });
            return this.replayAiDraftCommand(completed, calculation, ownerUserId);
          } catch (completionError) {
            if (completionError instanceof HttpException) throw completionError;
            await this.markAiDraftUnknownIfPossible(command.commandId, ownerUserId);
            throw new ChartAiDraftOutcomeUnknownError();
          }
        }
        await this.markAiDraftUnknownIfPossible(command.commandId, ownerUserId);
        throw new ChartAiDraftOutcomeUnknownError();
      }

      const saveCommand = {
        store: this.calculationStore,
        ownerUserId,
        calculationId: calculation.id,
        expectedResultChecksum: parsedBody.expectedResultChecksum,
        source: "ai" as const,
        text: renderChartInterpretationV2Text(generated.output, locale),
        modelId: generated.model,
        promptVersion: `${chartInterpretationDraftPromptV2.id}@${chartInterpretationDraftPromptV2.version}`,
        interpretationIdGenerator: () => command.commandId,
        now: this.clock.now()
      };
      let saved: CalculationRecord;
      try {
        saved = await retryExactChartAiDraftSave(() => saveCalculationInterpretation(saveCommand));
      } catch {
        let recovered: ChartAiDraftCommandResult | null;
        try {
          recovered = await this.aiDraftCommandStore.completeSuccess({
            commandId: command.commandId,
            actorUserId: ownerUserId,
            calculationId: calculation.id,
            expectedResultChecksum: parsedBody.expectedResultChecksum,
            now: this.clock.now().toISOString()
          });
        } catch {
          // Leave the command processing so a later retry can reconcile durable save evidence.
          throw new ChartAiDraftOutcomeUnknownError();
        }
        if (recovered) {
          return this.replayAiDraftCommand(recovered, calculation, ownerUserId);
        }
        await this.markAiDraftUnknownIfPossible(command.commandId, ownerUserId);
        throw new ChartAiDraftOutcomeUnknownError();
      }

      let completed: ChartAiDraftCommandResult | null;
      try {
        completed = await this.aiDraftCommandStore.completeSuccess({
          commandId: command.commandId,
          actorUserId: ownerUserId,
          calculationId: calculation.id,
          expectedResultChecksum: parsedBody.expectedResultChecksum,
          now: this.clock.now().toISOString()
        });
      } catch {
        // Keep the command processing: a retry can recover from the deterministic interpretation id.
        throw new ChartAiDraftOutcomeUnknownError();
      }
      if (!completed || completed.kind !== "success") {
        await this.markAiDraftUnknownIfPossible(command.commandId, ownerUserId);
        throw new ChartAiDraftOutcomeUnknownError();
      }
      if (
        completed.calculationId !== calculation.id ||
        completed.interpretationId !== command.commandId
      ) {
        throw new ChartAiDraftOutcomeUnknownError();
      }
      return toCalculationResponse(saved);
    });
  }

  private async assertChartAiDraftEntitlement(
    ownerUserId: string,
    method: ChartCalculationMethod
  ): Promise<void> {
    const resolutions = await resolvePlatformTariffCapabilities({
      store: this.entitlementStore,
      ownerUserId,
      capabilities: resolveChartAiDraftTariffCapabilities(method),
      operation: "generation",
      now: this.clock.now().toISOString()
    });
    const denied = resolutions.find(({ decision }) => decision !== "allow");
    if (!denied) return;
    throw new ForbiddenException({
      statusCode: 403,
      error: "entitlement_required",
      code: "entitlement_required",
      surfaceId: "ai.chart.draft",
      capability: denied.capability,
      operation: "generation",
      access: denied.decision,
      message: "The current tariff entitlement does not permit this operation"
    });
  }

  private async replayAiDraftCommand(
    result: ChartAiDraftCommandResult,
    calculation: CalculationRecord,
    ownerUserId: string
  ): Promise<CalculationRecordResponse> {
    if (result.kind === "known_failure") throw storedChartAiDraftFailure(result);
    if (result.kind === "unknown_outcome") throw new ChartAiDraftOutcomeUnknownError();
    if (result.calculationId !== calculation.id || result.interpretationId.length === 0) {
      throw new ChartAiDraftOutcomeUnknownError();
    }
    if (
      !calculation.interpretations.some(
        (interpretation) =>
          interpretation.id === result.interpretationId && interpretation.source === "ai"
      )
    ) {
      const refreshed = await getCalculation({
        store: this.calculationStore,
        ownerUserId,
        calculationId: result.calculationId
      });
      if (
        refreshed.resultChecksum !== calculation.resultChecksum ||
        !refreshed.interpretations.some(
          (interpretation) =>
            interpretation.id === result.interpretationId && interpretation.source === "ai"
        )
      ) {
        throw new ChartAiDraftOutcomeUnknownError();
      }
      return toCalculationResponse(refreshed);
    }
    return toCalculationResponse(calculation);
  }

  private async markAiDraftUnknownIfPossible(
    commandId: string,
    actorUserId: string
  ): Promise<void> {
    try {
      await this.aiDraftCommandStore.completeUnknownOutcome({
        commandId,
        actorUserId,
        now: this.clock.now().toISOString()
      });
    } catch (error) {
      this.logger.error({
        event: "chart_ai_draft_unknown_outcome_persistence_failed",
        commandId,
        errorName: readErrorName(error)
      });
    }
  }
}

async function mapChartAiPreflightError(error: unknown): Promise<HttpException | null> {
  try {
    await mapChartError(async () => {
      throw error;
    });
  } catch (mapped) {
    return mapped instanceof HttpException ? mapped : null;
  }
  return null;
}

function toReplayableChartAiDraftFailure(
  error: HttpException
): Omit<ChartAiDraftCommandKnownFailure, "schemaVersion" | "kind"> | null {
  const response = error.getResponse();
  if (response === null || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  const statusCode = error.getStatus();
  if (
    !Number.isInteger(statusCode) ||
    statusCode < 400 ||
    statusCode > 599 ||
    typeof record.code !== "string" ||
    !/^[A-Z0-9_]{1,120}$/u.test(record.code) ||
    typeof record.message !== "string" ||
    record.message.length < 1 ||
    record.message.length > 240
  ) {
    return null;
  }
  return { statusCode, code: record.code, message: record.message };
}

function chartAiPreflightUnavailableFailure(): Omit<
  ChartAiDraftCommandKnownFailure,
  "schemaVersion" | "kind"
> {
  return {
    statusCode: 503,
    code: "CHART_AI_DRAFT_PREFLIGHT_UNAVAILABLE",
    message: "Chart AI prerequisites are temporarily unavailable"
  };
}

function readErrorName(error: unknown): string {
  return error instanceof Error && error.name.length > 0 ? error.name : "UnknownError";
}

function toKnownChartAiDraftFailure(
  error: unknown
): Omit<ChartAiDraftCommandKnownFailure, "schemaVersion" | "kind"> | null {
  if (!(error instanceof HttpException)) return null;
  const statusCode = error.getStatus();
  if (statusCode === 422) {
    return {
      statusCode,
      code: "CHART_AI_DRAFT_REJECTED",
      message: "AI generation was refused for this input"
    };
  }
  if (statusCode === 429) {
    return {
      statusCode,
      code: "CHART_AI_DRAFT_RATE_LIMITED",
      message: "AI generation rate limit reached"
    };
  }
  if (statusCode === 502) {
    return {
      statusCode,
      code: "CHART_AI_DRAFT_OUTPUT_INVALID",
      message: "AI generation returned invalid output"
    };
  }
  return null;
}

function storedChartAiDraftFailure(result: ChartAiDraftCommandKnownFailure): HttpException {
  return new HttpException(
    {
      statusCode: result.statusCode,
      error: result.code,
      code: result.code,
      message: result.message
    },
    result.statusCode
  );
}

function toJobResponse(job: ChartCalculationJob, locale: "ru" | "en"): ChartJobResponse {
  const failure = toPublicChartJobFailure(job.lastErrorCode, job.lastErrorMessage, locale);
  return chartJobResponseSchema.parse({
    id: job.id,
    interpretationMode: job.interpretationMode,
    status: job.status === "queued" || job.status === "processing" ? "calculating" : job.status,
    calculationId: job.resultCalculationId,
    targetCalculationId: job.targetCalculationId,
    expectedSourceChecksum: job.expectedSourceChecksum,
    failureCode: failure.code,
    failureMessage: failure.message
  });
}

type ChartJobPublicFailureKind =
  | "configuration"
  | "durable_state"
  | "input_or_result"
  | "legacy"
  | "replacement"
  | "retry_exhausted"
  | "transient";

const chartJobPublicFailureKinds: Readonly<Record<string, ChartJobPublicFailureKind>> = {
  legacy_job_requires_requeue: "legacy",
  retry_exhausted: "retry_exhausted",
  chart_job_durable_state_invalid: "durable_state",
  chart_job_readiness_profile_unavailable: "configuration",
  chart_provider_timeout: "transient",
  chart_worker_shutdown: "transient",
  chart_job_lease_expired: "transient",
  chart_provider_transient_failure: "transient",
  chart_job_input_invalid: "input_or_result",
  CHART_ENGINE_BASE_URL_INVALID: "configuration",
  CHART_ENGINE_TIMEOUT_INVALID: "configuration",
  CHART_ENGINE_REQUEST_INVALID: "input_or_result",
  CHART_ENGINE_RESPONSE_INVALID_JSON: "input_or_result",
  CHART_ENGINE_RESPONSE_INVALID_SCHEMA: "input_or_result",
  CHART_ENGINE_REDIRECT_REFUSED: "configuration",
  CHART_ENGINE_READY_INVALID_JSON: "configuration",
  CHART_ENGINE_READY_INVALID_SCHEMA: "configuration",
  CHART_ENGINE_READY_EXPECTED_PROFILE_INVALID: "configuration",
  CHART_ENGINE_READY_PROFILE_MISMATCH: "configuration",
  CHART_REPLACEMENT_TARGET_NOT_FOUND: "replacement",
  CHART_REPLACEMENT_SOURCE_CHANGED: "replacement",
  CHART_REPLACEMENT_TARGET_MISMATCH: "replacement",
  CHART_REPLACEMENT_PARTICIPANT_MISMATCH: "replacement",
  CHART_REPLACEMENT_EXACT_KEY_CONFLICT: "replacement",
  CHART_REPLACEMENT_RESULT_INTEGRITY_INVALID: "replacement",
  CHART_REPLACEMENT_JOB_IDENTITY_INVALID: "replacement",
  CHART_RESULT_CONTRACT_INVALID: "input_or_result",
  CHART_RESULT_V2_REQUIRED: "input_or_result",
  CHART_RESULT_REPRODUCIBILITY_FINGERPRINT_MISMATCH: "input_or_result",
  CHART_RESULT_CHECKSUM_MISMATCH: "input_or_result",
  CHART_RESULT_JOB_BINDING_MISMATCH: "input_or_result",
  CHART_RESULT_EXECUTION_PROFILE_MISMATCH: "input_or_result",
  CHART_JOB_FINGERPRINT_MISMATCH: "input_or_result",
  CHART_PARTICIPANT_PROFILE_INVALID: "input_or_result"
};

const chartJobPublicFailureCopy: Readonly<
  Record<"ru" | "en", Readonly<Record<ChartJobPublicFailureKind | "generic", string>>>
> = {
  ru: {
    configuration: "Сервис расчёта карты временно недоступен из-за конфигурации",
    durable_state: "Состояние расчёта не прошло проверку; запустите расчёт повторно",
    input_or_result: "Результат расчёта не прошёл проверку; проверьте данные и повторите расчёт",
    legacy: "Устаревший расчёт карты нужно запустить повторно",
    replacement: "Карта изменилась; обновите страницу и повторите перерасчёт",
    retry_exhausted: "Не удалось рассчитать карту после нескольких попыток",
    transient: "Сервис расчёта карты временно недоступен; повторите попытку",
    generic: "Не удалось рассчитать карту; запустите расчёт повторно"
  },
  en: {
    configuration: "The chart calculation service is unavailable because of its configuration",
    durable_state: "The calculation state failed validation; start the calculation again",
    input_or_result: "The calculation result failed validation; check the data and try again",
    legacy: "The legacy chart calculation must be started again",
    replacement: "The chart changed; reload the page and run the recalculation again",
    retry_exhausted: "Chart calculation failed after multiple attempts",
    transient: "The chart calculation service is temporarily unavailable; try again",
    generic: "Chart calculation failed; start the calculation again"
  }
};

function toPublicChartJobFailure(
  persistedCode: string | null,
  persistedMessage: string | null,
  locale: "ru" | "en"
): { readonly code: string | null; readonly message: string | null } {
  if (persistedCode === null && persistedMessage === null) {
    return { code: null, message: null };
  }
  const kind =
    persistedCode && Object.hasOwn(chartJobPublicFailureKinds, persistedCode)
      ? chartJobPublicFailureKinds[persistedCode]
      : undefined;
  if (!kind) {
    return {
      code: "chart_calculation_failed",
      message: chartJobPublicFailureCopy[locale].generic
    };
  }
  return { code: persistedCode, message: chartJobPublicFailureCopy[locale][kind] };
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

async function retryExactChartAiDraftSave<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CHART_AI_DRAFT_SAVE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function raiseChartJobInterpretationModeRequired(): never {
  throw new Error("CHART_NATAL_INTERPRETATION_MODE_INVALID");
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

function assertChartAiCalculation(calculation: CalculationRecord) {
  if (calculation.status === "archived") {
    throw chartHttpError(409, "CHART_CALCULATION_ARCHIVED", "Chart calculation is archived");
  }
  if (calculation.module !== "chart") {
    throw chartHttpError(409, "CHART_CALCULATION_MISMATCH", "Calculation is not a chart result");
  }
  const readable = chartResultSchema.safeParse(calculation.resultData);
  if (readable.success && readable.data.schemaVersion === "chart-result.v1") {
    throw chartHttpError(
      409,
      "CHART_RECALCULATION_REQUIRED",
      "Legacy chart calculation must be recalculated before AI generation"
    );
  }
  const parsed = reproducibleChartResultSchema.safeParse(calculation.resultData);
  if (!parsed.success) {
    throw chartHttpError(
      409,
      "CHART_CALCULATION_MISMATCH",
      "Stored chart calculation result is invalid"
    );
  }
  const result = assertStoredChartCalculationSelfIntegrity({ calculation });
  if (
    result.schemaVersion !== "chart-result.v2" ||
    result.method !== calculation.methodCode ||
    result.method !== parsed.data.method
  ) {
    throw new ChartStoredResultIntegrityError();
  }
  if (
    result.method === "natal" &&
    resolveChartInterpretationMode(calculation, result.method) === "legacy_unclassified"
  ) {
    throw new CalculationInterpretationModeUnavailableError(
      "Chart AI draft is unavailable for this interpretation mode"
    );
  }
  return result;
}

function resolveChartAiDraftSubjectKind(
  calculation: CalculationRecord,
  method: ChartCalculationMethod
): "adult" | "child" {
  if (method !== "natal") return "adult";
  return resolveChartInterpretationMode(calculation, method) === "child" ? "child" : "adult";
}

function assertReadableChartCalculation(
  calculation: CalculationRecord,
  expectedExecutionProfile: ReturnType<ChartExecutionProfileProvider["getProfile"]>
) {
  if (calculation.status === "archived") {
    throw chartHttpError(409, "CHART_CALCULATION_ARCHIVED", "Chart calculation is archived");
  }
  if (calculation.module !== "chart") {
    throw chartHttpError(409, "CHART_CALCULATION_MISMATCH", "Calculation is not a chart result");
  }
  return assertStoredChartCalculationIntegrity({ calculation, expectedExecutionProfile });
}
