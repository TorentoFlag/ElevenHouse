import { describe, expect, it } from "vitest";
import {
  ASTRO_DIARY_PROMPT_CONTEXT_SCHEMA_VERSION,
  ASTRO_DIARY_SOURCE_LEAF_SCHEMA_VERSION,
  ASTRO_DIARY_SOURCE_MANIFEST_SCHEMA_VERSION
} from "./astro-diary-prompt-context";

import {
  astroDiaryPromptContextFixture,
  astroDiaryReflectionQuestionGoldenFixtures,
  bindAstroDiaryPromptContextFixture
} from "./astro-diary-prompt.test-fixtures";
import {
  astroDiaryReflectionQuestionDraftPromptInputSchema,
  astroDiaryReflectionQuestionDraftPromptOutputSchema,
  astroDiaryReflectionQuestionDraftPromptV1
} from "./astro-diary-question-draft.v1";
import { aiContractDigest } from "./prompt-characterization.test-helpers";

describe("AstroDiary reflection-question prompt", () => {
  it("supports a current cycle or a grounded new-cycle question", () => {
    expect(
      astroDiaryReflectionQuestionDraftPromptInputSchema.parse({
        target: "current_cycle",
        context: astroDiaryPromptContextFixture
      })
    ).toMatchObject({ target: "current_cycle" });

    const newCycleContext = bindAstroDiaryPromptContextFixture({
      ...astroDiaryPromptContextFixture,
      cycle: null,
      currentEntry: null
    });
    expect(
      astroDiaryReflectionQuestionDraftPromptInputSchema.parse({
        target: "new_cycle",
        context: newCycleContext
      })
    ).toMatchObject({ target: "new_cycle", context: { cycle: null, currentEntry: null } });
    expect(() =>
      astroDiaryReflectionQuestionDraftPromptInputSchema.parse({
        target: "current_cycle",
        context: newCycleContext
      })
    ).toThrow();
  });

  it("asks for one concrete open question in natural Russian or English", () => {
    const ru = astroDiaryReflectionQuestionDraftPromptV1.render({
      target: "current_cycle",
      context: astroDiaryPromptContextFixture
    });
    const en = astroDiaryReflectionQuestionDraftPromptV1.render({
      target: "current_cycle",
      context: bindAstroDiaryPromptContextFixture({
        ...astroDiaryPromptContextFixture,
        locale: "en"
      })
    });

    expect(astroDiaryReflectionQuestionDraftPromptV1).toMatchObject({
      id: "astroDiary.reflectionQuestionDraft",
      version: 1,
      locales: ["ru", "en"],
      modelProfile: "qualityDraft",
      requestedModel: "gpt-5.5",
      providerMaxRetries: 0
    });
    expect(ru.messages[0]?.content).toContain("ровно один конкретный открытый вопрос");
    expect(ru.messages[0]?.content).toContain("линзу для рефлексии");
    expect(en.messages[0]?.content).toContain("exactly one concrete open question");
    expect(en.messages[0]?.content).toContain("lens for reflection");
    expect(
      aiContractDigest({
        id: astroDiaryReflectionQuestionDraftPromptV1.id,
        version: astroDiaryReflectionQuestionDraftPromptV1.version,
        requestedModel: astroDiaryReflectionQuestionDraftPromptV1.requestedModel,
        providerMaxRetries: astroDiaryReflectionQuestionDraftPromptV1.providerMaxRetries,
        promptContextSchemaVersion: ASTRO_DIARY_PROMPT_CONTEXT_SCHEMA_VERSION,
        sourceLeafSchemaVersion: ASTRO_DIARY_SOURCE_LEAF_SCHEMA_VERSION,
        sourceManifestSchemaVersion: ASTRO_DIARY_SOURCE_MANIFEST_SCHEMA_VERSION,
        requestJsonSchema: astroDiaryReflectionQuestionDraftPromptV1.structuredOutputJsonSchema,
        ruMessages: ru.messages,
        enMessages: en.messages
      })
    ).toBe("sha256:d20875bc9df1b0dc9edaa3ef47c7b0492ee31b7dfef4ec5c043ebb5c53717be6");

    expect(
      astroDiaryReflectionQuestionDraftPromptOutputSchema.parse({
        question: "Что помогло вам остаться в контакте с собой, когда вы обозначили границу?"
      })
    ).toEqual({
      question: "Что помогло вам остаться в контакте с собой, когда вы обозначили границу?"
    });
    expect(() =>
      astroDiaryReflectionQuestionDraftPromptOutputSchema.parse({
        question: "Что изменилось? А что вы чувствуете?",
        clientVisible: true
      })
    ).toThrow();
  });

  it("accepts the frozen RU/EN golden questions and rejects stacked or closed questions", () => {
    for (const fixture of astroDiaryReflectionQuestionGoldenFixtures) {
      expect(
        astroDiaryReflectionQuestionDraftPromptOutputSchema.parse({
          question: fixture.question
        })
      ).toEqual({ question: fixture.question });
    }

    for (const question of [
      "Что изменилось? А что вы чувствуете?",
      "Что изменилось и что вы почувствовали?",
      "Готовы ли вы снова обозначить эту границу?",
      "What changed and how did that feel?",
      "Do you want to set the boundary again?"
    ]) {
      expect(
        astroDiaryReflectionQuestionDraftPromptOutputSchema.safeParse({ question }).success
      ).toBe(false);
    }
  });
});
