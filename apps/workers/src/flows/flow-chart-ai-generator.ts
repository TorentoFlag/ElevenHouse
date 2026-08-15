import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import {
  AiProviderAuthenticationError,
  AiProviderBadRequestError,
  AiProviderBillingError,
  AiProviderIncompleteResponseError,
  AiProviderRateLimitError,
  AiProviderRefusalError,
  AiProviderResponseFormatError,
  AiProviderServerError,
  AiProviderTimeoutError,
  AiProviderUnavailableError,
  buildNatalChartAiContext,
  chartInterpretationDraftPromptV1,
  createAiGenerationRuntime,
  createOpenAiProvider,
  RedisAiRateLimiter,
  renderChartInterpretationText,
  type AiGenerationUsageRecorder,
  type RedisAiRateLimitClient
} from "@elevenhouse/ai";
import {
  normalizeAiUsageResourceEvidence,
  type AiUsageResourceEvidence,
  type AiUsageSafeErrorCode
} from "@elevenhouse/domain";
import type { ReproducibleChartResult } from "@elevenhouse/contracts";

type NatalChartResult = Extract<ReproducibleChartResult, { readonly method: "natal" }>;
type FlowChartAiConfig = {
  readonly openAiApiKey: string;
  readonly openAiBaseUrl: string;
  readonly qualityDraftModel: "gpt-5.4-mini" | "gpt-5.5";
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly rateLimitRedisKeyPrefix: string;
  readonly rateLimits: {
    readonly userPerMinute: { readonly limit: number; readonly windowSeconds: number };
    readonly userPerHour: { readonly limit: number; readonly windowSeconds: number };
    readonly userPerDay: { readonly limit: number; readonly windowSeconds: number };
  };
};

export function createFlowChartAiGenerator(input: {
  readonly config: FlowChartAiConfig;
  readonly redis: RedisAiRateLimitClient;
  readonly usageRecorder: AiGenerationUsageRecorder<AiUsageResourceEvidence, AiUsageSafeErrorCode>;
}) {
  const provider = createOpenAiProvider({
    getConfig: () => ({
      openAiApiKey: input.config.openAiApiKey,
      openAiBaseUrl: input.config.openAiBaseUrl,
      fastDraftModel: input.config.qualityDraftModel,
      qualityDraftModel: input.config.qualityDraftModel,
      timeoutMs: input.config.timeoutMs
    }),
    client: new OpenAI({
      apiKey: input.config.openAiApiKey,
      baseURL: input.config.openAiBaseUrl,
      timeout: input.config.timeoutMs
    })
  });
  const runtime = createAiGenerationRuntime<AiUsageResourceEvidence, AiUsageSafeErrorCode>({
    provider,
    rateLimiter: new RedisAiRateLimiter(input.redis, {
      keyPrefix: input.config.rateLimitRedisKeyPrefix,
      userPerMinute: input.config.rateLimits.userPerMinute,
      userPerHour: input.config.rateLimits.userPerHour,
      userPerDay: input.config.rateLimits.userPerDay
    }),
    usageRecorder: input.usageRecorder,
    getRuntimeConfig: () => ({ maxOutputTokens: input.config.maxOutputTokens }),
    getUsageEvidenceRequirement: (feature) =>
      feature === "chart.interpretationDraft" ? { usageEvidence: "required" } : null,
    normalizeResourceEvidence: (evidence) => normalizeAiUsageResourceEvidence(evidence ?? null),
    createSafetyIdentifier: (ownerUserId) =>
      `eh_${createHash("sha256").update(ownerUserId).digest("hex").slice(0, 61)}`,
    toSafeErrorCode,
    idGenerator: randomUUID
  });

  return {
    generate: async (input: {
      readonly ownerUserId: string;
      readonly calculationId: string;
      readonly sourceChecksum: string;
      readonly locale: "ru" | "en";
      readonly resultData: NatalChartResult;
      readonly dictionaryEntries: readonly {
        code: string;
        categoryCode: string;
        title: string;
        content: string;
        source: "platform" | "modified" | "custom";
      }[];
    }) => {
      const generated = await runtime.generate({
        prompt: chartInterpretationDraftPromptV1,
        input: chartInterpretationDraftPromptV1.inputSchema.parse(
          buildNatalChartAiContext({
            locale: input.locale,
            result: input.resultData,
            dictionaryEntries: input.dictionaryEntries
          })
        ),
        ownerUserId: input.ownerUserId,
        feature: "chart.interpretationDraft",
        resourceEvidence: {
          resourceType: "chart_calculation",
          resourceId: input.calculationId,
          sourceChecksum: input.sourceChecksum
        }
      });
      return {
        text: renderChartInterpretationText(generated.output, input.locale),
        modelId: generated.model,
        promptVersion: `${chartInterpretationDraftPromptV1.id}@${chartInterpretationDraftPromptV1.version}`
      };
    }
  };
}

function toSafeErrorCode(error: unknown): AiUsageSafeErrorCode {
  if (error instanceof AiProviderRefusalError) return "AI_PROVIDER_REFUSED";
  if (error instanceof AiProviderBadRequestError) return "AI_PROVIDER_BAD_REQUEST";
  if (error instanceof AiProviderResponseFormatError) return "AI_PROVIDER_RESPONSE_INVALID";
  if (error instanceof AiProviderIncompleteResponseError) return "AI_PROVIDER_INCOMPLETE_RESPONSE";
  if (error instanceof AiProviderUnavailableError) return "AI_PROVIDER_UNAVAILABLE";
  if (error instanceof AiProviderAuthenticationError) return "AI_PROVIDER_AUTHENTICATION_FAILED";
  if (error instanceof AiProviderBillingError) return "AI_PROVIDER_BILLING_FAILED";
  if (error instanceof AiProviderRateLimitError) return "AI_PROVIDER_RATE_LIMITED";
  if (error instanceof AiProviderServerError) return "AI_PROVIDER_SERVER_ERROR";
  if (error instanceof AiProviderTimeoutError) return "AI_PROVIDER_TIMEOUT";
  return "AI_PROVIDER_UNKNOWN_FAILURE";
}
