import {
  computeAstroDiarySourceLeafDigest,
  computeAstroDiarySourceManifestDigest,
  type AstroDiaryPromptContext,
  type AstroDiaryPromptContextWithoutDigest
} from "./astro-diary-prompt-context";

const currentEntry = {
  itemId: "51000000-0000-4000-8000-000000000004",
  revision: 2,
  text: "Сегодня я впервые спокойно обозначила свою границу."
} as const;
const contextSnapshot = {
  snapshotId: "51000000-0000-4000-8000-000000000005",
  revision: 3,
  scope: "personal" as const,
  text: "Луна в Тельце может быть предложена как мягкая линза для темы устойчивости."
};
const supportingSourcesWithoutDigests = [
  {
    kind: "ready_attachment_text" as const,
    sourceId: "51000000-0000-4000-8000-000000000006",
    revision: 1,
    text: "Фрагмент готовой расшифровки голосового сообщения."
  },
  {
    kind: "published_timeline_item" as const,
    sourceId: "51000000-0000-4000-8000-000000000007",
    revision: 2,
    text: "В прошлой записи клиент отмечал желание говорить прямее."
  },
  {
    kind: "same_journal_retrieval" as const,
    sourceId: "51000000-0000-4000-8000-000000000008",
    revision: 1,
    text: "Релевантный фрагмент того же дневника."
  },
  {
    kind: "style_profile" as const,
    sourceId: "51000000-0000-4000-8000-000000000009",
    revision: 5,
    text: "Тёплый, прямой тон; обращение на вы; короткие абзацы."
  },
  {
    kind: "style_exemplar" as const,
    sourceId: "51000000-0000-4000-8000-000000000010",
    revision: 1,
    text: "Спасибо, что так точно описали этот момент."
  }
] as const;

const astroDiaryPromptContextFixtureWithoutDigest = {
  locale: "ru",
  journal: {
    id: "51000000-0000-4000-8000-000000000001",
    epochId: "51000000-0000-4000-8000-000000000002",
    version: 7
  },
  cycle: {
    id: "51000000-0000-4000-8000-000000000003",
    version: 4
  },
  currentEntry: {
    ...currentEntry,
    digest: computeAstroDiarySourceLeafDigest({
      kind: "current_entry",
      sourceId: currentEntry.itemId,
      revision: currentEntry.revision,
      text: currentEntry.text
    })
  },
  contextSnapshot: {
    ...contextSnapshot,
    digest: computeAstroDiarySourceLeafDigest({
      kind: "context_snapshot",
      sourceId: contextSnapshot.snapshotId,
      revision: contextSnapshot.revision,
      scope: contextSnapshot.scope,
      text: contextSnapshot.text
    })
  },
  supportingSources: supportingSourcesWithoutDigests.map((source) => ({
    ...source,
    digest: computeAstroDiarySourceLeafDigest(source)
  }))
} satisfies AstroDiaryPromptContextWithoutDigest;

export const astroDiaryPromptContextFixture = {
  ...astroDiaryPromptContextFixtureWithoutDigest,
  sourceDigest: computeAstroDiarySourceManifestDigest(astroDiaryPromptContextFixtureWithoutDigest)
} satisfies AstroDiaryPromptContext;

export function bindAstroDiaryPromptContextFixture(
  context: AstroDiaryPromptContextWithoutDigest
): AstroDiaryPromptContext {
  const bound = {
    ...context,
    currentEntry: context.currentEntry
      ? {
          ...context.currentEntry,
          digest: computeAstroDiarySourceLeafDigest({
            kind: "current_entry",
            sourceId: context.currentEntry.itemId,
            revision: context.currentEntry.revision,
            text: context.currentEntry.text
          })
        }
      : null,
    contextSnapshot: context.contextSnapshot
      ? {
          ...context.contextSnapshot,
          digest: computeAstroDiarySourceLeafDigest({
            kind: "context_snapshot",
            sourceId: context.contextSnapshot.snapshotId,
            revision: context.contextSnapshot.revision,
            scope: context.contextSnapshot.scope,
            text: context.contextSnapshot.text
          })
        }
      : null,
    supportingSources: context.supportingSources.map((source) => ({
      ...source,
      digest: computeAstroDiarySourceLeafDigest(source)
    }))
  } satisfies AstroDiaryPromptContextWithoutDigest;
  return { ...bound, sourceDigest: computeAstroDiarySourceManifestDigest(bound) };
}

export const astroDiaryReflectionQuestionGoldenFixtures = [
  {
    locale: "ru" as const,
    question: "Что помогло вам остаться в контакте с собой, когда вы обозначили границу?"
  },
  {
    locale: "en" as const,
    question: "What helped you stay connected to yourself as you named that boundary?"
  }
] as const;
