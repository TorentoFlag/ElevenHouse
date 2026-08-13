import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { astroDiaryPromptContextFixture } from "../prompts/astro-diary-prompt.test-fixtures";
import {
  acceptAstroDiaryReviewedDraft,
  isAcceptedAstroDiaryObservedModel,
  prepareAstroDiaryDraftAttempt,
  prepareAstroDiaryReviewAttempt,
  sourceEvidenceFromAstroDiaryContext
} from "./astro-diary-generation-contract";

const commandId = "52000000-0000-4000-8000-000000000001";
const generationAttemptId = "52000000-0000-4000-8000-000000000002";
const reviewAttemptId = "52000000-0000-4000-8000-000000000003";
const source = sourceEvidenceFromAstroDiaryContext(astroDiaryPromptContextFixture);
const generationDraftText = "Точный черновик ответа.";
const generationDraftDigest = textDigest(generationDraftText);
const completedGeneration = {
  commandId,
  attemptId: generationAttemptId,
  sequence: 1 as const,
  stage: "generation" as const,
  draftKind: "reply" as const,
  terminalOutcome: "completed" as const,
  requestedModel: "gpt-5.5" as const,
  observedModel: "gpt-5.5-2026-04-23",
  sourceDigest: source.sourceDigest,
  outputRevision: 1,
  outputDigest: generationDraftDigest
};
const completedReview = {
  commandId,
  attemptId: reviewAttemptId,
  sequence: 2 as const,
  stage: "review_refine" as const,
  draftKind: "reply" as const,
  terminalOutcome: "completed" as const,
  requestedModel: "gpt-5.5" as const,
  observedModel: "gpt-5.5-2026-04-23",
  sourceDigest: source.sourceDigest,
  outputRevision: 1,
  outputDigest: textDigest("Проверенный черновик.")
};

describe("AstroDiary generation contract", () => {
  it("plans literal gpt-5.5 generation then one review attempt without auto-send", () => {
    const generation = prepareAstroDiaryDraftAttempt({
      commandId,
      attemptId: generationAttemptId,
      kind: "reply",
      promptInput: { context: astroDiaryPromptContextFixture },
      expectedSource: source,
      currentSource: source,
      attempts: []
    });
    expect(generation).toEqual({
      outcome: "ready",
      attempt: {
        commandId,
        attemptId: generationAttemptId,
        sequence: 1,
        stage: "generation",
        draftKind: "reply",
        requestedModel: "gpt-5.5",
        maxRetries: 0,
        modelFallback: "forbidden",
        store: false,
        structuredOutput: "strict",
        ambiguousOutcomePolicy: "outcome_unknown_no_auto_retry",
        promptId: "astroDiary.replyDraft",
        promptVersion: 1,
        source,
        autoSend: false,
        clientVisible: false
      }
    });

    const review = prepareAstroDiaryReviewAttempt({
      commandId,
      attemptId: reviewAttemptId,
      kind: "reply",
      context: astroDiaryPromptContextFixture,
      draftRevision: 1,
      draftDigest: generationDraftDigest,
      draftText: generationDraftText,
      expectedSource: source,
      currentSource: source,
      attempts: [completedGeneration]
    });
    expect(review).toMatchObject({
      outcome: "ready",
      attempt: {
        sequence: 2,
        stage: "review_refine",
        requestedModel: "gpt-5.5",
        maxRetries: 0,
        modelFallback: "forbidden",
        store: false,
        structuredOutput: "strict",
        ambiguousOutcomePolicy: "outcome_unknown_no_auto_retry",
        promptId: "astroDiary.draftReview",
        promptVersion: 1,
        autoSend: false,
        clientVisible: false,
        draftRevision: 1,
        draftDigest: generationDraftDigest
      }
    });
  });

  it("rejects either provider attempt and final acceptance when locked source evidence changed", () => {
    const staleSource = { ...source, journalVersion: source.journalVersion + 1 };
    expect(
      prepareAstroDiaryDraftAttempt({
        commandId,
        attemptId: generationAttemptId,
        kind: "reflection_question",
        promptInput: {
          target: "current_cycle",
          context: astroDiaryPromptContextFixture
        },
        expectedSource: source,
        currentSource: staleSource,
        attempts: []
      })
    ).toEqual({ outcome: "rejected", code: "AI_SOURCE_STALE" });
    expect(
      prepareAstroDiaryReviewAttempt({
        commandId,
        attemptId: reviewAttemptId,
        kind: "reply",
        context: astroDiaryPromptContextFixture,
        draftRevision: 1,
        draftDigest: generationDraftDigest,
        draftText: "Черновик",
        expectedSource: source,
        currentSource: staleSource,
        attempts: [completedGeneration]
      })
    ).toEqual({ outcome: "rejected", code: "AI_SOURCE_STALE" });
    expect(
      acceptAstroDiaryReviewedDraft({
        commandId,
        draftId: "52000000-0000-4000-8000-000000000004",
        reviewAttemptId,
        kind: "reply",
        reviewedText: "Проверенный черновик.",
        expectedSource: source,
        currentSource: staleSource,
        attempts: [completedGeneration, completedReview]
      })
    ).toEqual({ outcome: "rejected", code: "AI_SOURCE_STALE" });
  });

  it("returns a private editable draft that requires an astrologer's explicit publish command", () => {
    expect(
      acceptAstroDiaryReviewedDraft({
        commandId,
        draftId: "52000000-0000-4000-8000-000000000004",
        reviewAttemptId,
        kind: "reply",
        reviewedText: "Проверенный черновик.",
        expectedSource: source,
        currentSource: source,
        attempts: [completedGeneration, completedReview]
      })
    ).toEqual({
      outcome: "editable_draft_ready",
      draft: {
        id: "52000000-0000-4000-8000-000000000004",
        commandId,
        version: 1,
        reviewAttemptId,
        text: "Проверенный черновик.",
        source,
        visibility: "astrologer_private",
        clientVisible: false,
        autoSend: false,
        publication: "requires_astrologer_edit_and_explicit_publish"
      },
      timelineMutation: "none"
    });
  });

  it("accepts only the requested GPT-5.5 alias or dated snapshot as provider provenance", () => {
    expect(isAcceptedAstroDiaryObservedModel("gpt-5.5")).toBe(true);
    expect(isAcceptedAstroDiaryObservedModel("gpt-5.5-2026-04-23")).toBe(true);
    expect(isAcceptedAstroDiaryObservedModel("gpt-5.5-pro")).toBe(false);
    expect(isAcceptedAstroDiaryObservedModel("gpt-5.6")).toBe(false);
    expect(isAcceptedAstroDiaryObservedModel("gpt-5.5-2026-02-30")).toBe(false);
    expect(isAcceptedAstroDiaryObservedModel("gpt-5.5-2026-13-01")).toBe(false);
  });

  it("requires a completed generation before review and binds the draft text digest", () => {
    const baseReview = {
      commandId,
      attemptId: reviewAttemptId,
      kind: "reply" as const,
      context: astroDiaryPromptContextFixture,
      draftRevision: 1,
      draftDigest: generationDraftDigest,
      draftText: generationDraftText,
      expectedSource: source,
      currentSource: source
    };

    expect(prepareAstroDiaryReviewAttempt({ ...baseReview, attempts: [] })).toEqual({
      outcome: "rejected",
      code: "AI_ATTEMPT_SEQUENCE_INVALID"
    });
    expect(
      prepareAstroDiaryReviewAttempt({
        ...baseReview,
        draftText: `${generationDraftText} Изменено.`,
        attempts: [completedGeneration]
      })
    ).toEqual({ outcome: "rejected", code: "AI_SOURCE_STALE" });
    expect(
      prepareAstroDiaryReviewAttempt({
        ...baseReview,
        attempts: [{ ...completedGeneration, terminalOutcome: "known_failed" }, completedReview]
      })
    ).toEqual({ outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" });
  });

  it("requires the completed generation slot when accepting the reviewed draft", () => {
    expect(
      acceptAstroDiaryReviewedDraft({
        commandId,
        draftId: "52000000-0000-4000-8000-000000000004",
        reviewAttemptId,
        kind: "reply",
        reviewedText: "Проверенный черновик.",
        expectedSource: source,
        currentSource: source,
        attempts: [{ ...completedGeneration, terminalOutcome: "known_failed" }, completedReview]
      })
    ).toEqual({ outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" });
  });

  it("replays the same terminal slot and rejects a different third attempt", () => {
    expect(
      prepareAstroDiaryDraftAttempt({
        commandId,
        attemptId: generationAttemptId,
        kind: "reply",
        promptInput: { context: astroDiaryPromptContextFixture },
        expectedSource: source,
        currentSource: source,
        attempts: [completedGeneration]
      })
    ).toEqual({ outcome: "replay", attempt: completedGeneration });

    const baseReview = {
      commandId,
      kind: "reply" as const,
      context: astroDiaryPromptContextFixture,
      draftRevision: 1,
      draftDigest: generationDraftDigest,
      draftText: generationDraftText,
      expectedSource: source,
      currentSource: source,
      attempts: [completedGeneration, completedReview]
    };
    expect(prepareAstroDiaryReviewAttempt({ ...baseReview, attemptId: reviewAttemptId })).toEqual({
      outcome: "replay",
      attempt: completedReview
    });
    expect(
      prepareAstroDiaryReviewAttempt({
        ...baseReview,
        attemptId: "52000000-0000-4000-8000-000000000099"
      })
    ).toEqual({ outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" });
  });

  it.each([null, "gpt-5.5-pro", "gpt-5.6", "gpt-5.5-2026-02-30"])(
    "rejects completed generation replay with invalid model provenance %s",
    (observedModel) => {
      expect(
        prepareAstroDiaryDraftAttempt({
          commandId,
          attemptId: generationAttemptId,
          kind: "reply",
          promptInput: { context: astroDiaryPromptContextFixture },
          expectedSource: source,
          currentSource: source,
          attempts: [{ ...completedGeneration, observedModel }]
        })
      ).toEqual({
        outcome: "known_failed",
        code: "AI_MODEL_PROVENANCE_INVALID",
        redispatch: "forbidden"
      });
    }
  );

  it("never redispatches or advances an outcome_unknown generation slot", () => {
    const unknownGeneration = {
      ...completedGeneration,
      terminalOutcome: "outcome_unknown" as const,
      observedModel: null,
      outputRevision: null,
      outputDigest: null
    };
    const generationInput = {
      commandId,
      kind: "reply" as const,
      promptInput: { context: astroDiaryPromptContextFixture },
      expectedSource: source,
      currentSource: source,
      attempts: [unknownGeneration]
    };

    expect(
      prepareAstroDiaryDraftAttempt({
        ...generationInput,
        attemptId: generationAttemptId
      })
    ).toEqual({ outcome: "replay", attempt: unknownGeneration });
    expect(
      prepareAstroDiaryDraftAttempt({
        ...generationInput,
        attemptId: "52000000-0000-4000-8000-000000000099"
      })
    ).toEqual({ outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" });
    expect(
      prepareAstroDiaryReviewAttempt({
        commandId,
        attemptId: reviewAttemptId,
        kind: "reply",
        context: astroDiaryPromptContextFixture,
        draftRevision: 1,
        draftDigest: generationDraftDigest,
        draftText: generationDraftText,
        expectedSource: source,
        currentSource: source,
        attempts: [unknownGeneration]
      })
    ).toEqual({ outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" });
  });

  it("rejects an unbound source manifest digest and invalid review model provenance", () => {
    expect(() =>
      sourceEvidenceFromAstroDiaryContext({
        ...astroDiaryPromptContextFixture,
        sourceDigest: `sha256:${"0".repeat(64)}`
      })
    ).toThrow("AstroDiary source manifest digest is invalid");

    expect(
      acceptAstroDiaryReviewedDraft({
        commandId,
        draftId: "52000000-0000-4000-8000-000000000004",
        reviewAttemptId,
        kind: "reply",
        reviewedText: "Проверенный черновик.",
        expectedSource: source,
        currentSource: source,
        attempts: [completedGeneration, { ...completedReview, observedModel: "gpt-5.5-pro" }]
      })
    ).toEqual({
      outcome: "known_failed",
      code: "AI_MODEL_PROVENANCE_INVALID",
      redispatch: "forbidden"
    });

    expect(
      prepareAstroDiaryReviewAttempt({
        commandId,
        attemptId: reviewAttemptId,
        kind: "reply",
        context: astroDiaryPromptContextFixture,
        draftRevision: 1,
        draftDigest: generationDraftDigest,
        draftText: generationDraftText,
        expectedSource: source,
        currentSource: source,
        attempts: [
          {
            ...completedGeneration,
            observedModel: "gpt-5.5-2026-02-30"
          }
        ]
      })
    ).toEqual({
      outcome: "known_failed",
      code: "AI_MODEL_PROVENANCE_INVALID",
      redispatch: "forbidden"
    });
  });

  it.each([
    [
      "current entry",
      {
        ...astroDiaryPromptContextFixture,
        currentEntry: {
          ...astroDiaryPromptContextFixture.currentEntry,
          text: `${astroDiaryPromptContextFixture.currentEntry?.text} altered`
        }
      }
    ],
    [
      "context snapshot",
      {
        ...astroDiaryPromptContextFixture,
        contextSnapshot: {
          ...astroDiaryPromptContextFixture.contextSnapshot,
          text: `${astroDiaryPromptContextFixture.contextSnapshot?.text} altered`
        }
      }
    ],
    [
      "supporting source",
      {
        ...astroDiaryPromptContextFixture,
        supportingSources: astroDiaryPromptContextFixture.supportingSources.map((item, index) =>
          index === 0 ? { ...item, text: `${item.text} altered` } : item
        )
      }
    ],
    [
      "supporting source metadata",
      {
        ...astroDiaryPromptContextFixture,
        supportingSources: astroDiaryPromptContextFixture.supportingSources.map((item, index) =>
          index === 0 ? { ...item, revision: item.revision + 1 } : item
        )
      }
    ]
  ])(
    "rejects an unbound %s leaf text even when the caller reuses its digest",
    (_label, context) => {
      expect(() => sourceEvidenceFromAstroDiaryContext(context)).toThrow(
        "AstroDiary source leaf digest is invalid"
      );
    }
  );

  it.each([null, "gpt-5.5-pro", "gpt-5.6", "gpt-5.5-2026-02-30"])(
    "rejects invalid terminal review model provenance %s instead of replaying it",
    (observedModel) => {
      expect(
        prepareAstroDiaryReviewAttempt({
          commandId,
          attemptId: reviewAttemptId,
          kind: "reply",
          context: astroDiaryPromptContextFixture,
          draftRevision: 1,
          draftDigest: generationDraftDigest,
          draftText: generationDraftText,
          expectedSource: source,
          currentSource: source,
          attempts: [completedGeneration, { ...completedReview, observedModel }]
        })
      ).toEqual({
        outcome: "known_failed",
        code: "AI_MODEL_PROVENANCE_INVALID",
        redispatch: "forbidden"
      });
    }
  );

  it("rejects a widened reflection-question review result during acceptance", () => {
    const reviewedText = `${"Что изменилось для вас в этот момент ".repeat(20)}?`;
    expect(
      acceptAstroDiaryReviewedDraft({
        commandId,
        draftId: "52000000-0000-4000-8000-000000000004",
        reviewAttemptId,
        kind: "reflection_question",
        reviewedText,
        expectedSource: source,
        currentSource: source,
        attempts: [
          { ...completedGeneration, draftKind: "reflection_question" },
          {
            ...completedReview,
            draftKind: "reflection_question",
            outputDigest: textDigest(reviewedText)
          }
        ]
      })
    ).toEqual({ outcome: "rejected", code: "AI_OUTPUT_INVALID" });
  });

  it("binds acceptance to the draft kind recorded by both attempt slots", () => {
    expect(
      acceptAstroDiaryReviewedDraft({
        commandId,
        draftId: "52000000-0000-4000-8000-000000000004",
        reviewAttemptId,
        kind: "reply",
        reviewedText: "Проверенный черновик.",
        expectedSource: source,
        currentSource: source,
        attempts: [
          { ...completedGeneration, draftKind: "reflection_question" },
          { ...completedReview, draftKind: "reflection_question" }
        ]
      })
    ).toEqual({ outcome: "rejected", code: "AI_ATTEMPT_SEQUENCE_INVALID" });
  });
});

function textDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
