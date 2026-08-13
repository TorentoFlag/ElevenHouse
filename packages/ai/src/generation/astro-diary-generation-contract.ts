import { createHash } from "node:crypto";

import {
  astroDiaryDraftReviewPromptInputSchema,
  astroDiaryDraftReviewPromptOutputSchema
} from "../prompts/astro-diary-draft-review.v1";
import {
  ASTRO_DIARY_PROMPT_CONTEXT_SCHEMA_VERSION,
  ASTRO_DIARY_SOURCE_LEAF_SCHEMA_VERSION,
  ASTRO_DIARY_SOURCE_MANIFEST_SCHEMA_VERSION,
  computeAstroDiarySourceManifestDigest,
  type AstroDiaryPromptContext,
  type AstroDiaryPromptContextWithoutDigest
} from "../prompts/astro-diary-prompt-context";
import { astroDiaryReflectionQuestionDraftPromptInputSchema } from "../prompts/astro-diary-question-draft.v1";
import { astroDiaryReplyDraftPromptInputSchema } from "../prompts/astro-diary-reply-draft.v1";

export const ASTRO_DIARY_REQUESTED_MODEL = "gpt-5.5" as const;

export type AstroDiaryAiSourceEvidence = Readonly<{
  promptContextSchemaVersion: typeof ASTRO_DIARY_PROMPT_CONTEXT_SCHEMA_VERSION;
  sourceLeafSchemaVersion: typeof ASTRO_DIARY_SOURCE_LEAF_SCHEMA_VERSION;
  manifestSchemaVersion: typeof ASTRO_DIARY_SOURCE_MANIFEST_SCHEMA_VERSION;
  journalId: string;
  journalEpochId: string;
  journalVersion: number;
  cycleId: string | null;
  cycleVersion: number | null;
  currentEntryId: string | null;
  currentEntryRevision: number | null;
  currentEntryDigest: string | null;
  contextSnapshotId: string | null;
  contextSnapshotRevision: number | null;
  contextSnapshotDigest: string | null;
  supportingSources: readonly Readonly<{
    kind: AstroDiaryPromptContext["supportingSources"][number]["kind"];
    sourceId: string;
    revision: number;
    digest: string;
  }>[];
  sourceDigest: string;
}>;

type AstroDiaryDraftKind = "reply" | "reflection_question";

type AstroDiaryGenerationRejection =
  | { readonly outcome: "rejected"; readonly code: "AI_INPUT_INVALID" }
  | { readonly outcome: "rejected"; readonly code: "AI_OUTPUT_INVALID" }
  | { readonly outcome: "rejected"; readonly code: "AI_SOURCE_STALE" }
  | { readonly outcome: "rejected"; readonly code: "AI_ATTEMPT_SEQUENCE_INVALID" };

type AstroDiaryModelProvenanceFailure = Readonly<{
  outcome: "known_failed";
  code: "AI_MODEL_PROVENANCE_INVALID";
  redispatch: "forbidden";
}>;

export type AstroDiaryAttemptTerminalFact = Readonly<{
  commandId: string;
  attemptId: string;
  sequence: 1 | 2;
  stage: "generation" | "review_refine";
  draftKind: AstroDiaryDraftKind;
  terminalOutcome: "completed" | "known_failed" | "outcome_unknown";
  requestedModel: typeof ASTRO_DIARY_REQUESTED_MODEL;
  observedModel: string | null;
  sourceDigest: string;
  outputRevision: number | null;
  outputDigest: string | null;
}>;

type AstroDiaryAttemptContract = Readonly<{
  commandId: string;
  attemptId: string;
  sequence: 1 | 2;
  stage: "generation" | "review_refine";
  draftKind: AstroDiaryDraftKind;
  requestedModel: typeof ASTRO_DIARY_REQUESTED_MODEL;
  maxRetries: 0;
  modelFallback: "forbidden";
  store: false;
  structuredOutput: "strict";
  ambiguousOutcomePolicy: "outcome_unknown_no_auto_retry";
  promptId:
    | "astroDiary.replyDraft"
    | "astroDiary.reflectionQuestionDraft"
    | "astroDiary.draftReview";
  promptVersion: 1;
  source: AstroDiaryAiSourceEvidence;
  autoSend: false;
  clientVisible: false;
  draftRevision?: number;
  draftDigest?: string;
}>;

export type AstroDiaryAttemptDecision =
  | { readonly outcome: "ready"; readonly attempt: AstroDiaryAttemptContract }
  | { readonly outcome: "replay"; readonly attempt: AstroDiaryAttemptTerminalFact }
  | AstroDiaryGenerationRejection
  | AstroDiaryModelProvenanceFailure;

export type AstroDiaryReviewedDraftDecision =
  | {
      readonly outcome: "editable_draft_ready";
      readonly draft: Readonly<{
        id: string;
        commandId: string;
        version: 1;
        reviewAttemptId: string;
        text: string;
        source: AstroDiaryAiSourceEvidence;
        visibility: "astrologer_private";
        clientVisible: false;
        autoSend: false;
        publication: "requires_astrologer_edit_and_explicit_publish";
      }>;
      readonly timelineMutation: "none";
    }
  | AstroDiaryGenerationRejection
  | AstroDiaryModelProvenanceFailure;

export function sourceEvidenceFromAstroDiaryContext(
  context: AstroDiaryPromptContext
): AstroDiaryAiSourceEvidence {
  const computedDigest = computeAstroDiarySourceManifestDigest(withoutSourceDigest(context));
  if (computedDigest !== context.sourceDigest) {
    throw new Error("AstroDiary source manifest digest is invalid");
  }
  return {
    promptContextSchemaVersion: ASTRO_DIARY_PROMPT_CONTEXT_SCHEMA_VERSION,
    sourceLeafSchemaVersion: ASTRO_DIARY_SOURCE_LEAF_SCHEMA_VERSION,
    manifestSchemaVersion: ASTRO_DIARY_SOURCE_MANIFEST_SCHEMA_VERSION,
    journalId: context.journal.id,
    journalEpochId: context.journal.epochId,
    journalVersion: context.journal.version,
    cycleId: context.cycle?.id ?? null,
    cycleVersion: context.cycle?.version ?? null,
    currentEntryId: context.currentEntry?.itemId ?? null,
    currentEntryRevision: context.currentEntry?.revision ?? null,
    currentEntryDigest: context.currentEntry?.digest ?? null,
    contextSnapshotId: context.contextSnapshot?.snapshotId ?? null,
    contextSnapshotRevision: context.contextSnapshot?.revision ?? null,
    contextSnapshotDigest: context.contextSnapshot?.digest ?? null,
    supportingSources: context.supportingSources.map((source) => ({
      kind: source.kind,
      sourceId: source.sourceId,
      revision: source.revision,
      digest: source.digest
    })),
    sourceDigest: computedDigest
  };
}

export function prepareAstroDiaryDraftAttempt(
  input: Readonly<{
    commandId: string;
    attemptId: string;
    expectedSource: AstroDiaryAiSourceEvidence;
    currentSource: AstroDiaryAiSourceEvidence;
    attempts: readonly AstroDiaryAttemptTerminalFact[];
  }> &
    (
      | {
          readonly kind: "reply";
          readonly promptInput: unknown;
        }
      | {
          readonly kind: "reflection_question";
          readonly promptInput: unknown;
        }
    )
): AstroDiaryAttemptDecision {
  if (input.attempts.length > 0) {
    const existing = input.attempts[0];
    if (
      input.attempts.length === 1 &&
      existing?.commandId === input.commandId &&
      existing.attemptId === input.attemptId &&
      existing.sequence === 1 &&
      existing.stage === "generation" &&
      existing.draftKind === input.kind
    ) {
      if (
        existing.terminalOutcome === "completed" &&
        (existing.observedModel === null ||
          !isAcceptedAstroDiaryObservedModel(existing.observedModel))
      ) {
        return modelProvenanceFailure();
      }
      return { outcome: "replay", attempt: existing };
    }
    return { outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" };
  }

  const parsed =
    input.kind === "reply"
      ? astroDiaryReplyDraftPromptInputSchema.safeParse(input.promptInput)
      : astroDiaryReflectionQuestionDraftPromptInputSchema.safeParse(input.promptInput);
  if (!parsed.success) return { outcome: "rejected", code: "AI_INPUT_INVALID" };

  const promptSource = trySourceEvidence(parsed.data.context);
  if (
    promptSource === null ||
    !sameSourceEvidence(input.expectedSource, input.currentSource) ||
    !sameSourceEvidence(input.expectedSource, promptSource)
  ) {
    return { outcome: "rejected", code: "AI_SOURCE_STALE" };
  }

  return {
    outcome: "ready",
    attempt: {
      commandId: input.commandId,
      attemptId: input.attemptId,
      sequence: 1,
      stage: "generation",
      draftKind: input.kind,
      requestedModel: ASTRO_DIARY_REQUESTED_MODEL,
      maxRetries: 0,
      modelFallback: "forbidden",
      store: false,
      structuredOutput: "strict",
      ambiguousOutcomePolicy: "outcome_unknown_no_auto_retry",
      promptId:
        input.kind === "reply" ? "astroDiary.replyDraft" : "astroDiary.reflectionQuestionDraft",
      promptVersion: 1,
      source: input.expectedSource,
      autoSend: false,
      clientVisible: false
    }
  };
}

export function prepareAstroDiaryReviewAttempt(input: {
  readonly commandId: string;
  readonly attemptId: string;
  readonly kind: AstroDiaryDraftKind;
  readonly context: AstroDiaryPromptContext;
  readonly draftRevision: number;
  readonly draftDigest: string;
  readonly draftText: string;
  readonly expectedSource: AstroDiaryAiSourceEvidence;
  readonly currentSource: AstroDiaryAiSourceEvidence;
  readonly attempts: readonly AstroDiaryAttemptTerminalFact[];
}): AstroDiaryAttemptDecision {
  if (input.attempts.length === 2) {
    const generation = input.attempts[0];
    const existingReview = input.attempts[1];
    if (
      generation?.commandId !== input.commandId ||
      generation.sequence !== 1 ||
      generation.stage !== "generation" ||
      generation.draftKind !== input.kind ||
      generation.terminalOutcome !== "completed" ||
      generation.observedModel === null ||
      generation.sourceDigest !== existingReview?.sourceDigest
    ) {
      return { outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" };
    }
    if (!isAcceptedAstroDiaryObservedModel(generation.observedModel)) {
      return modelProvenanceFailure();
    }
    if (
      (existingReview.terminalOutcome === "completed" && existingReview.observedModel === null) ||
      (existingReview.observedModel !== null &&
        !isAcceptedAstroDiaryObservedModel(existingReview.observedModel))
    ) {
      return modelProvenanceFailure();
    }
    if (
      existingReview?.commandId === input.commandId &&
      existingReview.attemptId === input.attemptId &&
      existingReview.sequence === 2 &&
      existingReview.stage === "review_refine" &&
      existingReview.draftKind === input.kind
    ) {
      return { outcome: "replay", attempt: existingReview };
    }
    return { outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" };
  }
  if (input.attempts.length !== 1) {
    return { outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" };
  }

  const generation = input.attempts[0];
  if (
    generation?.commandId !== input.commandId ||
    generation.sequence !== 1 ||
    generation.stage !== "generation" ||
    generation.draftKind !== input.kind ||
    generation.terminalOutcome !== "completed"
  ) {
    return { outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" };
  }
  if (
    generation.observedModel === null ||
    !isAcceptedAstroDiaryObservedModel(generation.observedModel)
  ) {
    return modelProvenanceFailure();
  }
  if (
    generation.sourceDigest !== input.expectedSource.sourceDigest ||
    generation.outputRevision !== input.draftRevision ||
    generation.outputDigest !== input.draftDigest ||
    computeAstroDiaryTextDigest(input.draftText) !== input.draftDigest
  ) {
    return { outcome: "rejected", code: "AI_SOURCE_STALE" };
  }

  const parsed = astroDiaryDraftReviewPromptInputSchema.safeParse({
    draftKind: input.kind,
    draftRevision: input.draftRevision,
    draftDigest: input.draftDigest,
    draftText: input.draftText,
    context: input.context
  });
  if (!parsed.success) return { outcome: "rejected", code: "AI_INPUT_INVALID" };

  const promptSource = trySourceEvidence(parsed.data.context);
  if (
    promptSource === null ||
    !sameSourceEvidence(input.expectedSource, input.currentSource) ||
    !sameSourceEvidence(input.expectedSource, promptSource)
  ) {
    return { outcome: "rejected", code: "AI_SOURCE_STALE" };
  }

  return {
    outcome: "ready",
    attempt: {
      commandId: input.commandId,
      attemptId: input.attemptId,
      sequence: 2,
      stage: "review_refine",
      draftKind: input.kind,
      requestedModel: ASTRO_DIARY_REQUESTED_MODEL,
      maxRetries: 0,
      modelFallback: "forbidden",
      store: false,
      structuredOutput: "strict",
      ambiguousOutcomePolicy: "outcome_unknown_no_auto_retry",
      promptId: "astroDiary.draftReview",
      promptVersion: 1,
      source: input.expectedSource,
      autoSend: false,
      clientVisible: false,
      draftRevision: parsed.data.draftRevision,
      draftDigest: parsed.data.draftDigest
    }
  };
}

export function acceptAstroDiaryReviewedDraft(input: {
  readonly commandId: string;
  readonly draftId: string;
  readonly reviewAttemptId: string;
  readonly kind: AstroDiaryDraftKind;
  readonly reviewedText: string;
  readonly expectedSource: AstroDiaryAiSourceEvidence;
  readonly currentSource: AstroDiaryAiSourceEvidence;
  readonly attempts: readonly AstroDiaryAttemptTerminalFact[];
}): AstroDiaryReviewedDraftDecision {
  if (!sameSourceEvidence(input.expectedSource, input.currentSource)) {
    return { outcome: "rejected", code: "AI_SOURCE_STALE" };
  }
  if (input.attempts.length !== 2) {
    return { outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" };
  }
  const generation = input.attempts[0];
  const review = input.attempts[1];
  if (
    generation?.commandId !== input.commandId ||
    generation.sequence !== 1 ||
    generation.stage !== "generation" ||
    generation.draftKind !== input.kind ||
    generation.terminalOutcome !== "completed" ||
    generation.sourceDigest !== input.expectedSource.sourceDigest ||
    generation.outputRevision === null ||
    generation.outputDigest === null ||
    review?.commandId !== input.commandId ||
    review.attemptId !== input.reviewAttemptId ||
    review.sequence !== 2 ||
    review.stage !== "review_refine" ||
    review.draftKind !== input.kind ||
    review.terminalOutcome !== "completed"
  ) {
    return { outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" };
  }
  if (
    generation.observedModel === null ||
    !isAcceptedAstroDiaryObservedModel(generation.observedModel) ||
    review.observedModel === null ||
    !isAcceptedAstroDiaryObservedModel(review.observedModel)
  ) {
    return modelProvenanceFailure();
  }
  const output = astroDiaryDraftReviewPromptOutputSchema.safeParse({
    draft: {
      draftKind: input.kind,
      draftText: input.reviewedText
    }
  });
  if (!output.success) return { outcome: "rejected", code: "AI_OUTPUT_INVALID" };
  const reviewedDraft = output.data.draft;
  if (
    review.sourceDigest !== input.expectedSource.sourceDigest ||
    review.outputRevision !== 1 ||
    review.outputDigest !== computeAstroDiaryTextDigest(reviewedDraft.draftText)
  ) {
    return { outcome: "rejected", code: "AI_SOURCE_STALE" };
  }

  return {
    outcome: "editable_draft_ready",
    draft: {
      id: input.draftId,
      commandId: input.commandId,
      version: 1,
      reviewAttemptId: input.reviewAttemptId,
      text: reviewedDraft.draftText,
      source: input.expectedSource,
      visibility: "astrologer_private",
      clientVisible: false,
      autoSend: false,
      publication: "requires_astrologer_edit_and_explicit_publish"
    },
    timelineMutation: "none"
  };
}

export function computeAstroDiaryTextDigest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function isAcceptedAstroDiaryObservedModel(model: string): boolean {
  if (model === ASTRO_DIARY_REQUESTED_MODEL) return true;
  const snapshot = /^gpt-5\.5-(\d{4})-(\d{2})-(\d{2})$/u.exec(model);
  if (!snapshot) return false;
  const year = Number(snapshot[1]);
  const month = Number(snapshot[2]);
  const day = Number(snapshot[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function modelProvenanceFailure(): AstroDiaryModelProvenanceFailure {
  return {
    outcome: "known_failed",
    code: "AI_MODEL_PROVENANCE_INVALID",
    redispatch: "forbidden"
  };
}

function trySourceEvidence(context: AstroDiaryPromptContext): AstroDiaryAiSourceEvidence | null {
  try {
    return sourceEvidenceFromAstroDiaryContext(context);
  } catch {
    return null;
  }
}

function withoutSourceDigest(
  context: AstroDiaryPromptContext
): AstroDiaryPromptContextWithoutDigest {
  return {
    locale: context.locale,
    journal: context.journal,
    cycle: context.cycle,
    currentEntry: context.currentEntry,
    contextSnapshot: context.contextSnapshot,
    supportingSources: context.supportingSources
  };
}

function sameSourceEvidence(
  expected: AstroDiaryAiSourceEvidence,
  current: AstroDiaryAiSourceEvidence
): boolean {
  return (
    expected.promptContextSchemaVersion === current.promptContextSchemaVersion &&
    expected.sourceLeafSchemaVersion === current.sourceLeafSchemaVersion &&
    expected.manifestSchemaVersion === current.manifestSchemaVersion &&
    expected.journalId === current.journalId &&
    expected.journalEpochId === current.journalEpochId &&
    expected.journalVersion === current.journalVersion &&
    expected.cycleId === current.cycleId &&
    expected.cycleVersion === current.cycleVersion &&
    expected.currentEntryId === current.currentEntryId &&
    expected.currentEntryRevision === current.currentEntryRevision &&
    expected.currentEntryDigest === current.currentEntryDigest &&
    expected.contextSnapshotId === current.contextSnapshotId &&
    expected.contextSnapshotRevision === current.contextSnapshotRevision &&
    expected.contextSnapshotDigest === current.contextSnapshotDigest &&
    expected.sourceDigest === current.sourceDigest &&
    expected.supportingSources.length === current.supportingSources.length &&
    expected.supportingSources.every((source, index) => {
      const currentSource = current.supportingSources[index];
      return (
        currentSource !== undefined &&
        source.kind === currentSource.kind &&
        source.sourceId === currentSource.sourceId &&
        source.revision === currentSource.revision &&
        source.digest === currentSource.digest
      );
    })
  );
}
