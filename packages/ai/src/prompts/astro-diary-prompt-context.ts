import { createHash } from "node:crypto";
import { nonEmptyStringSchema, z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
export const ASTRO_DIARY_PROMPT_CONTEXT_SCHEMA_VERSION = "astro-diary-prompt-context.v1" as const;
export const ASTRO_DIARY_SOURCE_MANIFEST_SCHEMA_VERSION = "astro-diary-source-manifest.v1" as const;
export const ASTRO_DIARY_SOURCE_LEAF_SCHEMA_VERSION = "astro-diary-source-leaf.v1" as const;
export const astroDiaryAiChecksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const astroDiaryAiLocaleSchema = z.enum(["ru", "en"]);

type AstroDiarySourceLeafInput =
  | Readonly<{
      kind: "current_entry";
      sourceId: string;
      revision: number;
      text: string;
    }>
  | Readonly<{
      kind: "context_snapshot";
      sourceId: string;
      revision: number;
      scope: "global_only" | "personal";
      text: string;
    }>
  | Readonly<{
      kind:
        | "ready_attachment_text"
        | "published_timeline_item"
        | "same_journal_retrieval"
        | "style_profile"
        | "style_exemplar";
      sourceId: string;
      revision: number;
      text: string;
    }>;

const versionedTextSourceShape = {
  sourceId: uuidSchema,
  revision: z.number().int().positive(),
  digest: astroDiaryAiChecksumSchema,
  text: nonEmptyStringSchema.max(20_000)
} as const;

export const astroDiaryPromptSupportingSourceSchema = z
  .object({
    kind: z.enum([
      "ready_attachment_text",
      "published_timeline_item",
      "same_journal_retrieval",
      "style_profile",
      "style_exemplar"
    ]),
    ...versionedTextSourceShape
  })
  .strict();

export const astroDiaryPromptContextSchema = z
  .object({
    locale: astroDiaryAiLocaleSchema,
    journal: z
      .object({
        id: uuidSchema,
        epochId: uuidSchema,
        version: z.number().int().positive()
      })
      .strict(),
    cycle: z
      .object({
        id: uuidSchema,
        version: z.number().int().positive()
      })
      .strict()
      .nullable(),
    currentEntry: z
      .object({
        itemId: uuidSchema,
        revision: z.number().int().positive(),
        digest: astroDiaryAiChecksumSchema,
        text: nonEmptyStringSchema.max(20_000)
      })
      .strict()
      .nullable(),
    contextSnapshot: z
      .object({
        snapshotId: uuidSchema,
        revision: z.number().int().positive(),
        digest: astroDiaryAiChecksumSchema,
        scope: z.enum(["global_only", "personal"]),
        text: nonEmptyStringSchema.max(20_000)
      })
      .strict()
      .nullable(),
    supportingSources: z.array(astroDiaryPromptSupportingSourceSchema).max(80),
    sourceDigest: astroDiaryAiChecksumSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.currentEntry !== null && value.cycle === null) {
      context.addIssue({
        code: "custom",
        path: ["currentEntry"],
        message: "A current entry must be bound to a current cycle"
      });
    }

    const sourceIds = [
      ...(value.currentEntry ? [value.currentEntry.itemId] : []),
      ...(value.contextSnapshot ? [value.contextSnapshot.snapshotId] : []),
      ...value.supportingSources.map((source) => source.sourceId)
    ];
    if (new Set(sourceIds).size !== sourceIds.length) {
      context.addIssue({
        code: "custom",
        path: ["supportingSources"],
        message: "AstroDiary AI source identities must be unique"
      });
    }

    const invalidLeaves = invalidAstroDiarySourceLeaves(value);
    for (const invalidLeaf of invalidLeaves) {
      context.addIssue({
        code: "custom",
        path: invalidLeaf.path,
        message: "AstroDiary source leaf digest is invalid"
      });
    }

    if (
      invalidLeaves.length === 0 &&
      computeAstroDiarySourceManifestDigest(withoutSourceDigest(value)) !== value.sourceDigest
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceDigest"],
        message: "AstroDiary source manifest digest is invalid"
      });
    }
  });

export type AstroDiaryPromptContext = z.infer<typeof astroDiaryPromptContextSchema>;
export type AstroDiaryPromptContextWithoutDigest = Omit<AstroDiaryPromptContext, "sourceDigest">;
export type AstroDiaryAiLocale = z.infer<typeof astroDiaryAiLocaleSchema>;

export function computeAstroDiarySourceManifestDigest(
  context: AstroDiaryPromptContextWithoutDigest
): `sha256:${string}` {
  assertAstroDiarySourceLeafDigests(context);
  const manifest = {
    schemaVersion: ASTRO_DIARY_SOURCE_MANIFEST_SCHEMA_VERSION,
    promptContextSchemaVersion: ASTRO_DIARY_PROMPT_CONTEXT_SCHEMA_VERSION,
    sourceLeafSchemaVersion: ASTRO_DIARY_SOURCE_LEAF_SCHEMA_VERSION,
    locale: context.locale,
    journal: context.journal,
    cycle: context.cycle,
    currentEntry: context.currentEntry
      ? {
          itemId: context.currentEntry.itemId,
          revision: context.currentEntry.revision,
          digest: context.currentEntry.digest
        }
      : null,
    contextSnapshot: context.contextSnapshot
      ? {
          snapshotId: context.contextSnapshot.snapshotId,
          revision: context.contextSnapshot.revision,
          digest: context.contextSnapshot.digest,
          scope: context.contextSnapshot.scope
        }
      : null,
    supportingSources: context.supportingSources.map((source, index) => ({
      sequence: index + 1,
      kind: source.kind,
      sourceId: source.sourceId,
      revision: source.revision,
      digest: source.digest
    }))
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex")}`;
}

export function computeAstroDiarySourceLeafDigest(
  leaf: AstroDiarySourceLeafInput
): `sha256:${string}` {
  const canonicalLeaf = {
    schemaVersion: ASTRO_DIARY_SOURCE_LEAF_SCHEMA_VERSION,
    kind: leaf.kind,
    sourceId: leaf.sourceId,
    revision: leaf.revision,
    ...(leaf.kind === "context_snapshot" ? { scope: leaf.scope } : {}),
    text: leaf.text
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalLeaf), "utf8").digest("hex")}`;
}

export function renderAstroDiaryPromptData(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) throw new TypeError("AstroDiary prompt data must be serializable");
  return [
    "<astro_diary_context>",
    json.replace(/[<>&]/g, (character) => {
      if (character === "<") return "\\u003c";
      if (character === ">") return "\\u003e";
      return "\\u0026";
    }),
    "</astro_diary_context>"
  ].join("\n");
}

export function hasAstroDiaryReflectionGrounding(context: AstroDiaryPromptContext): boolean {
  return (
    context.currentEntry !== null ||
    context.contextSnapshot !== null ||
    context.supportingSources.some(
      (source) => source.kind !== "style_profile" && source.kind !== "style_exemplar"
    )
  );
}

function assertAstroDiarySourceLeafDigests(context: AstroDiaryPromptContextWithoutDigest): void {
  if (invalidAstroDiarySourceLeaves(context).length > 0) {
    throw new Error("AstroDiary source leaf digest is invalid");
  }
}

function invalidAstroDiarySourceLeaves(
  context: AstroDiaryPromptContextWithoutDigest
): readonly Readonly<{ path: (string | number)[] }>[] {
  const invalid: Array<Readonly<{ path: (string | number)[] }>> = [];
  if (
    context.currentEntry &&
    context.currentEntry.digest !==
      computeAstroDiarySourceLeafDigest({
        kind: "current_entry",
        sourceId: context.currentEntry.itemId,
        revision: context.currentEntry.revision,
        text: context.currentEntry.text
      })
  ) {
    invalid.push({ path: ["currentEntry", "digest"] });
  }
  if (
    context.contextSnapshot &&
    context.contextSnapshot.digest !==
      computeAstroDiarySourceLeafDigest({
        kind: "context_snapshot",
        sourceId: context.contextSnapshot.snapshotId,
        revision: context.contextSnapshot.revision,
        scope: context.contextSnapshot.scope,
        text: context.contextSnapshot.text
      })
  ) {
    invalid.push({ path: ["contextSnapshot", "digest"] });
  }
  context.supportingSources.forEach((source, index) => {
    if (
      source.digest !==
      computeAstroDiarySourceLeafDigest({
        kind: source.kind,
        sourceId: source.sourceId,
        revision: source.revision,
        text: source.text
      })
    ) {
      invalid.push({ path: ["supportingSources", index, "digest"] });
    }
  });
  return invalid;
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
