import { describe, expect, it } from "vitest";
import {
  ASTRO_DIARY_PROMPT_CONTEXT_SCHEMA_VERSION,
  ASTRO_DIARY_SOURCE_LEAF_SCHEMA_VERSION,
  ASTRO_DIARY_SOURCE_MANIFEST_SCHEMA_VERSION
} from "./astro-diary-prompt-context";

import {
  astroDiaryPromptContextFixture,
  bindAstroDiaryPromptContextFixture
} from "./astro-diary-prompt.test-fixtures";
import {
  astroDiaryDraftReviewPromptInputSchema,
  astroDiaryDraftReviewPromptOutputSchema,
  astroDiaryDraftReviewPromptV1
} from "./astro-diary-draft-review.v1";
import { aiContractDigest } from "./prompt-characterization.test-helpers";

describe("AstroDiary bounded draft review prompt", () => {
  it("reviews one source-bound draft without publishing it", () => {
    const input = {
      draftKind: "reply" as const,
      draftRevision: 1,
      draftDigest: `sha256:${"3".repeat(64)}`,
      draftText: "Спасибо, что поделились. Что вы чувствуете?",
      context: astroDiaryPromptContextFixture
    };

    expect(astroDiaryDraftReviewPromptInputSchema.parse(input)).toEqual(input);
    expect(astroDiaryDraftReviewPromptV1).toMatchObject({
      id: "astroDiary.draftReview",
      version: 1,
      modelProfile: "qualityDraft",
      requestedModel: "gpt-5.5",
      providerMaxRetries: 0
    });

    const ru = astroDiaryDraftReviewPromptV1.render(input);
    const en = astroDiaryDraftReviewPromptV1.render({
      ...input,
      context: bindAstroDiaryPromptContextFixture({ ...input.context, locale: "en" })
    });
    expect(ru.messages[0]?.content).toContain("одну проверку");
    expect(ru.messages[0]?.content).toContain("не публикуй");
    expect(en.messages[0]?.content).toContain("one review pass");
    expect(en.messages[0]?.content).toContain("do not publish");
    expect(astroDiaryDraftReviewPromptV1.structuredOutputJsonSchema).toEqual({
      type: "object",
      properties: {
        draft: {
          anyOf: [
            {
              type: "object",
              properties: {
                draftKind: { type: "string", enum: ["reply"] },
                draftText: { type: "string", minLength: 1, maxLength: 4_000 }
              },
              required: ["draftKind", "draftText"],
              additionalProperties: false
            },
            {
              type: "object",
              properties: {
                draftKind: { type: "string", enum: ["reflection_question"] },
                draftText: {
                  type: "string",
                  minLength: 1,
                  maxLength: 600,
                  pattern: "^[^?]*\\?$"
                }
              },
              required: ["draftKind", "draftText"],
              additionalProperties: false
            }
          ]
        }
      },
      required: ["draft"],
      additionalProperties: false
    });
    expect(
      aiContractDigest({
        id: astroDiaryDraftReviewPromptV1.id,
        version: astroDiaryDraftReviewPromptV1.version,
        requestedModel: astroDiaryDraftReviewPromptV1.requestedModel,
        providerMaxRetries: astroDiaryDraftReviewPromptV1.providerMaxRetries,
        promptContextSchemaVersion: ASTRO_DIARY_PROMPT_CONTEXT_SCHEMA_VERSION,
        sourceLeafSchemaVersion: ASTRO_DIARY_SOURCE_LEAF_SCHEMA_VERSION,
        sourceManifestSchemaVersion: ASTRO_DIARY_SOURCE_MANIFEST_SCHEMA_VERSION,
        requestJsonSchema: astroDiaryDraftReviewPromptV1.structuredOutputJsonSchema,
        ruMessages: ru.messages,
        enMessages: astroDiaryDraftReviewPromptV1.render({
          ...input,
          draftText: "Thank you for sharing. What do you notice?",
          context: bindAstroDiaryPromptContextFixture({ ...input.context, locale: "en" })
        }).messages
      })
    ).toBe("sha256:0c554ae060d93f33c19aabd765cd6a78f2761ff104c3213c072a5a5da3b293ec");
    expect(
      astroDiaryDraftReviewPromptOutputSchema.parse({
        draft: {
          draftKind: "reply",
          draftText: "Более точный ответ."
        }
      })
    ).toEqual({
      draft: { draftKind: "reply", draftText: "Более точный ответ." }
    });
  });

  it("rejects a review draft without exact revision and digest evidence", () => {
    expect(() =>
      astroDiaryDraftReviewPromptInputSchema.parse({
        draftKind: "reflection_question",
        draftRevision: 0,
        draftDigest: "not-a-digest",
        draftText: "Что изменилось?",
        context: astroDiaryPromptContextFixture
      })
    ).toThrow();
  });

  it("preserves the reflection-question output contract through review", () => {
    expect(
      astroDiaryDraftReviewPromptOutputSchema.parse({
        draft: {
          draftKind: "reflection_question",
          draftText: "Что помогло вам обозначить эту границу?"
        }
      })
    ).toEqual({
      draft: {
        draftKind: "reflection_question",
        draftText: "Что помогло вам обозначить эту границу?"
      }
    });

    for (const draftText of [
      `${"Что изменилось для вас в этот момент ".repeat(20)}?`,
      "Что изменилось? А что вы чувствуете?",
      "Готовы ли вы снова обозначить эту границу?",
      "What changed and how did that feel?",
      "Do you want to set the boundary again?"
    ]) {
      expect(
        astroDiaryDraftReviewPromptOutputSchema.safeParse({
          draft: { draftKind: "reflection_question", draftText }
        }).success
      ).toBe(false);
    }

    expect(
      astroDiaryDraftReviewPromptOutputSchema.safeParse({
        draft: {
          draftKind: "reply",
          draftText: "Ответ астролога. ".repeat(40)
        }
      }).success
    ).toBe(true);
  });

  it("rejects an invalid reflection-question before the review provider call", () => {
    expect(
      astroDiaryDraftReviewPromptInputSchema.safeParse({
        draftKind: "reflection_question",
        draftRevision: 1,
        draftDigest: `sha256:${"3".repeat(64)}`,
        draftText: "Что изменилось? А что вы чувствуете?",
        context: astroDiaryPromptContextFixture
      }).success
    ).toBe(false);
  });
});
