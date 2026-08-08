import { desc, and, eq } from "drizzle-orm";
import type { ChartExecutionProfile, ReproducibleChartResult } from "@elevenhouse/contracts";
import {
  assertStoredChartCalculationIntegrity,
  buildChartAiDraftCommandRequestHash,
  chartAiDraftCommandTtlMs,
  FlowExecutionIntegrityError,
  FlowNodeExecutionError,
  getCalculation,
  listDictionaryEntriesByCodes,
  saveCalculationInterpretation,
  type CalculationStore,
  type ChartAiDraftCommandResult,
  type ChartAiDraftCommandStore,
  type DictionaryStore,
  type FlowNatalChartAiDraftRequester
} from "@elevenhouse/domain";
import { sha256CanonicalJson, type CanonicalJson } from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import { chartCalculationJobs, flowExecutionSignalWaits } from "../../schema";

type GenerateNatalDraft = (input: {
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly sourceChecksum: string;
  readonly locale: "ru" | "en";
  readonly resultData: NatalChartResult;
  readonly dictionaryCodes: readonly string[];
  readonly dictionaryEntries: readonly {
    code: string;
    categoryCode: string;
    title: string;
    content: string;
    source: "platform" | "modified" | "custom";
  }[];
}) => Promise<{ readonly text: string; readonly modelId: string; readonly promptVersion: string }>;
type NatalChartResult = Extract<ReproducibleChartResult, { readonly method: "natal" }>;

/**
 * Resolves the exact terminal chart signal consumed by this run, then records
 * or replays one deterministic AI interpretation before the Flow waits for a
 * human decision. No chart result, generation result, or usage evidence is
 * inferred from a browser request.
 */
export function createDrizzleFlowNatalChartAiDraftRequester(
  database: ElevenHouseDatabase,
  input: {
    readonly calculationStore: CalculationStore;
    readonly dictionaryStore: DictionaryStore;
    readonly commandStore: ChartAiDraftCommandStore;
    readonly executionProfile: ChartExecutionProfile;
    readonly getDictionaryCodes: (result: NatalChartResult) => readonly string[];
    readonly generate: GenerateNatalDraft;
    readonly now?: () => Date;
  }
): FlowNatalChartAiDraftRequester {
  const now = input.now ?? (() => new Date());
  return {
    prepare: async (request) => {
      const source = await findConsumedNatalChartSource(database, request);
      const calculation = await getCalculation({
        store: input.calculationStore,
        ownerUserId: request.ownerUserId,
        calculationId: source.calculationId
      });
      if (calculation.resultChecksum !== source.resultChecksum) {
        throw integrity("Flow chart source checksum no longer matches the completed chart job");
      }
      const result = assertStoredChartCalculationIntegrity({
        calculation,
        expectedExecutionProfile: input.executionProfile
      });
      if (
        calculation.status === "archived" ||
        calculation.interpretationMode !== "adult_natal" ||
        result.schemaVersion !== "chart-result.v2" ||
        result.method !== "natal"
      ) {
        throw integrity("Flow AI draft requires an active adult natal chart result");
      }

      const commandNow = now();
      const key = `flow-ai-draft:${request.runId}:${request.tokenId}:${request.nodeActivationSequence}`;
      const command = await input.commandStore.acquire({
        actorUserId: request.ownerUserId,
        key,
        requestHash: buildChartAiDraftCommandRequestHash({
          actorUserId: request.ownerUserId,
          calculationId: calculation.id,
          body: { expectedResultChecksum: calculation.resultChecksum }
        }),
        now: commandNow.toISOString(),
        expiresAt: new Date(commandNow.getTime() + chartAiDraftCommandTtlMs).toISOString()
      });

      const interpretationId = await resolveOrCreateInterpretation({
        command,
        commandStore: input.commandStore,
        calculationStore: input.calculationStore,
        dictionaryStore: input.dictionaryStore,
        executionProfile: input.executionProfile,
        getDictionaryCodes: input.getDictionaryCodes,
        generate: input.generate,
        ownerUserId: request.ownerUserId,
        calculationId: calculation.id,
        sourceChecksum: calculation.resultChecksum,
        locale: request.locale,
        now
      });
      const persisted = await getCalculation({
        store: input.calculationStore,
        ownerUserId: request.ownerUserId,
        calculationId: calculation.id
      });
      if (persisted.resultChecksum !== calculation.resultChecksum) {
        throw integrity("Flow AI draft source changed while replaying interpretation");
      }
      const interpretation = persisted.interpretations.find(
        (candidate) => candidate.id === interpretationId && candidate.source === "ai"
      );
      if (!interpretation || interpretation.text.trim().length === 0) {
        throw integrity("Flow AI draft interpretation evidence is unavailable");
      }
      const outputText = interpretation.text.trim();
      return {
        calculationId: persisted.id,
        interpretationId: interpretation.id,
        sourceChecksum: persisted.resultChecksum as `sha256:${string}`,
        contentChecksum: sha256CanonicalJson({ outputText } satisfies CanonicalJson),
        outputText,
        preview: outputText.slice(0, 1_000)
      };
    }
  };
}

async function findConsumedNatalChartSource(
  database: ElevenHouseDatabase,
  request: Parameters<FlowNatalChartAiDraftRequester["prepare"]>[0]
): Promise<{ readonly calculationId: string; readonly resultChecksum: string }> {
  const [source] = await database
    .select({
      calculationId: chartCalculationJobs.resultCalculationId,
      resultChecksum: chartCalculationJobs.resultChecksum,
      method: chartCalculationJobs.method,
      status: chartCalculationJobs.status
    })
    .from(flowExecutionSignalWaits)
    .innerJoin(chartCalculationJobs, eq(chartCalculationJobs.id, flowExecutionSignalWaits.correlationId))
    .where(
      and(
        eq(flowExecutionSignalWaits.ownerUserId, request.ownerUserId),
        eq(flowExecutionSignalWaits.flowRunId, request.runId),
        eq(flowExecutionSignalWaits.nodeId, request.chartRequestNodeId),
        eq(flowExecutionSignalWaits.signalType, "chart.calculation.terminal.v1"),
        eq(flowExecutionSignalWaits.successHandle, "next"),
        eq(flowExecutionSignalWaits.state, "consumed"),
        eq(chartCalculationJobs.ownerUserId, request.ownerUserId)
      )
    )
    .orderBy(desc(flowExecutionSignalWaits.consumedAt), desc(flowExecutionSignalWaits.id))
    .limit(1);
  if (
    !source ||
    source.method !== "natal" ||
    source.status !== "succeeded" ||
    source.calculationId === null ||
    source.resultChecksum === null
  ) {
    throw integrity("Flow AI draft requires a consumed successful natal chart signal");
  }
  return { calculationId: source.calculationId, resultChecksum: source.resultChecksum };
}

async function resolveOrCreateInterpretation(input: {
  readonly command: Awaited<ReturnType<ChartAiDraftCommandStore["acquire"]>>;
  readonly commandStore: ChartAiDraftCommandStore;
  readonly calculationStore: CalculationStore;
  readonly dictionaryStore: DictionaryStore;
  readonly executionProfile: ChartExecutionProfile;
  readonly getDictionaryCodes: (result: NatalChartResult) => readonly string[];
  readonly generate: GenerateNatalDraft;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly sourceChecksum: string;
  readonly locale: "ru" | "en";
  readonly now: () => Date;
}): Promise<string> {
  if (input.command.kind === "completed") return requireSuccessfulCommand(input.command.result);
  if (input.command.kind === "processing") {
    const recovered = await input.commandStore.completeSuccess({
      commandId: input.command.commandId,
      actorUserId: input.ownerUserId,
      calculationId: input.calculationId,
      expectedResultChecksum: input.sourceChecksum,
      now: input.now().toISOString()
    });
    if (recovered) return requireSuccessfulCommand(recovered);
    throw new FlowNodeExecutionError("FLOW_NODE_EXECUTION_RETRYABLE");
  }

  const calculation = await getCalculation({
    store: input.calculationStore,
    ownerUserId: input.ownerUserId,
    calculationId: input.calculationId
  });
  const result = assertStoredChartCalculationIntegrity({
    calculation,
    expectedExecutionProfile: input.executionProfile
  });
  if (result.schemaVersion !== "chart-result.v2" || result.method !== "natal") {
    throw integrity("Flow AI draft source is not a reproducible natal chart");
  }
  const dictionaryCodes = input.getDictionaryCodes(result);
  const dictionary = await listDictionaryEntriesByCodes({
    store: input.dictionaryStore,
    ownerUserId: input.ownerUserId,
    locale: input.locale,
    codes: dictionaryCodes
  });
  const generated = await input.generate({
    ownerUserId: input.ownerUserId,
    calculationId: calculation.id,
    sourceChecksum: calculation.resultChecksum,
    locale: input.locale,
    resultData: result,
    dictionaryCodes,
    dictionaryEntries: dictionary.entries
  });
  const saved = await saveExactlyTwice(() =>
    saveCalculationInterpretation({
      store: input.calculationStore,
      ownerUserId: input.ownerUserId,
      calculationId: calculation.id,
      expectedResultChecksum: calculation.resultChecksum,
      source: "ai",
      text: generated.text,
      modelId: generated.modelId,
      promptVersion: generated.promptVersion,
      interpretationIdGenerator: () => input.command.commandId,
      now: input.now()
    })
  );
  const completion = await input.commandStore.completeSuccess({
    commandId: input.command.commandId,
    actorUserId: input.ownerUserId,
    calculationId: calculation.id,
    expectedResultChecksum: calculation.resultChecksum,
    now: input.now().toISOString()
  });
  if (!completion) throw new FlowNodeExecutionError("FLOW_NODE_EXECUTION_RETRYABLE");
  const interpretationId = requireSuccessfulCommand(completion);
  if (!saved.interpretations.some((candidate) => candidate.id === interpretationId && candidate.source === "ai")) {
    throw integrity("Flow AI draft save and command completion disagree");
  }
  return interpretationId;
}

async function saveExactlyTwice<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch { return operation(); }
}
function requireSuccessfulCommand(result: ChartAiDraftCommandResult): string {
  if (result.kind === "success" && result.interpretationId.trim().length > 0) return result.interpretationId;
  throw new FlowNodeExecutionError("FLOW_NODE_EXECUTION_RETRYABLE");
}
function integrity(message: string): FlowExecutionIntegrityError {
  return new FlowExecutionIntegrityError("FLOW_TOKEN_RUNTIME_STATE_INVALID", message);
}
