import { nonEmptyStringSchema, z } from "@elevenhouse/validation";

export const dictionaryLocaleSchema = z.string().trim().pipe(z.enum(["ru", "en"]));
export type DictionaryLocale = z.infer<typeof dictionaryLocaleSchema>;
export const dictionaryEntrySourceSchema = z.enum(["platform", "modified", "custom"]);
export type DictionaryEntrySource = z.infer<typeof dictionaryEntrySourceSchema>;
export const dictionaryEntrySourceFilterSchema = z.union([
  z.literal("all"),
  dictionaryEntrySourceSchema
]);
export type DictionaryEntrySourceFilter = z.infer<typeof dictionaryEntrySourceFilterSchema>;

const uuidSchema = z.string().uuid();
export const dictionarySearchMaxLength = 200;
export const dictionaryTitleMaxLength = 200;
export const dictionaryContentMaxLength = 10_000;
export const dictionaryEntriesByCodesMaxCount = 100;
const optionalNonEmptyStringSchema = z
  .string()
  .trim()
  .max(dictionarySearchMaxLength)
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();
const dictionaryTitleRequestSchema = nonEmptyStringSchema.max(dictionaryTitleMaxLength);
const dictionaryContentRequestSchema = nonEmptyStringSchema.max(dictionaryContentMaxLength);
const paginationNumberSchema = z.coerce.number().int().min(0);

export const dictionaryPlatformEntryIdParamSchema = z
  .object({
    platformEntryId: uuidSchema
  })
  .strict();
export type DictionaryPlatformEntryIdParam = z.infer<
  typeof dictionaryPlatformEntryIdParamSchema
>;

export const dictionaryAstrologerEntryIdParamSchema = z
  .object({
    entryId: uuidSchema
  })
  .strict();
export type DictionaryAstrologerEntryIdParam = z.infer<
  typeof dictionaryAstrologerEntryIdParamSchema
>;

export const listDictionaryCategoriesQuerySchema = z
  .object({
    locale: dictionaryLocaleSchema
  })
  .strict();
export type ListDictionaryCategoriesQuery = z.infer<
  typeof listDictionaryCategoriesQuerySchema
>;

export const dictionaryEntriesQuerySchema = z
  .object({
    locale: dictionaryLocaleSchema,
    categoryId: uuidSchema.optional(),
    source: dictionaryEntrySourceFilterSchema.default("all"),
    search: optionalNonEmptyStringSchema,
    limit: paginationNumberSchema.min(1).max(500).default(50),
    offset: paginationNumberSchema.default(0)
  })
  .strict();
export type DictionaryEntriesQuery = z.infer<typeof dictionaryEntriesQuerySchema>;

const dictionaryEntryCodeSchema = nonEmptyStringSchema.max(200);
const dictionaryEntryCodesQueryValueSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      typeof entry === "string" ? entry.split(",") : []
    );
  }

  if (typeof value === "string") {
    return value.split(",");
  }

  return value;
}, z.array(dictionaryEntryCodeSchema).min(1).max(dictionaryEntriesByCodesMaxCount));

export const dictionaryEntriesByCodesQuerySchema = z
  .object({
    locale: dictionaryLocaleSchema,
    codes: dictionaryEntryCodesQueryValueSchema.transform((codes) =>
      Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)))
    )
  })
  .strict()
  .refine((query) => query.codes.length > 0, {
    message: "Dictionary entry codes are required",
    path: ["codes"]
  });
export type DictionaryEntriesByCodesQuery = z.infer<
  typeof dictionaryEntriesByCodesQuerySchema
>;

export const dictionarySourceCountsSchema = z.object({
  all: z.number().int().min(0),
  platform: z.number().int().min(0),
  modified: z.number().int().min(0),
  custom: z.number().int().min(0)
});
export type DictionarySourceCounts = z.infer<typeof dictionarySourceCountsSchema>;

export const dictionaryCategoryResponseSchema = z.object({
  id: uuidSchema,
  code: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  order: z.number().int(),
  count: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type DictionaryCategoryResponse = z.infer<typeof dictionaryCategoryResponseSchema>;

export const dictionaryCategoriesResponseSchema = z.object({
  categories: z.array(dictionaryCategoryResponseSchema),
  total: z.number().int().min(0)
});
export type DictionaryCategoriesResponse = z.infer<
  typeof dictionaryCategoriesResponseSchema
>;

export const dictionaryEffectiveEntryResponseSchema = z.object({
  id: uuidSchema,
  categoryId: uuidSchema,
  categoryCode: nonEmptyStringSchema,
  code: nonEmptyStringSchema,
  locale: dictionaryLocaleSchema,
  source: dictionaryEntrySourceSchema,
  title: nonEmptyStringSchema,
  content: nonEmptyStringSchema,
  platformEntryId: uuidSchema.optional(),
  astrologerEntryId: uuidSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type DictionaryEffectiveEntryResponse = z.infer<
  typeof dictionaryEffectiveEntryResponseSchema
>;

export const dictionaryEntriesResponseSchema = z.object({
  entries: z.array(dictionaryEffectiveEntryResponseSchema),
  total: z.number().int().min(0),
  counts: z.object({
    sources: dictionarySourceCountsSchema
  })
});
export type DictionaryEntriesResponse = z.infer<typeof dictionaryEntriesResponseSchema>;

export const dictionaryAstrologerEntryResponseSchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  platformEntryId: uuidSchema.optional(),
  categoryId: uuidSchema,
  code: nonEmptyStringSchema,
  locale: dictionaryLocaleSchema,
  entryType: z.enum(["override", "custom"]),
  title: nonEmptyStringSchema,
  content: nonEmptyStringSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type DictionaryAstrologerEntryResponse = z.infer<
  typeof dictionaryAstrologerEntryResponseSchema
>;

export const createDictionaryCustomEntryRequestSchema = z
  .object({
    categoryId: uuidSchema,
    locale: dictionaryLocaleSchema,
    code: dictionaryEntryCodeSchema.optional(),
    title: dictionaryTitleRequestSchema,
    content: dictionaryContentRequestSchema
  })
  .strict();
export type CreateDictionaryCustomEntryRequest = z.infer<
  typeof createDictionaryCustomEntryRequestSchema
>;

export const updateDictionaryCustomEntryRequestSchema = z
  .object({
    categoryId: uuidSchema,
    title: dictionaryTitleRequestSchema,
    content: dictionaryContentRequestSchema
  })
  .strict();
export type UpdateDictionaryCustomEntryRequest = z.infer<
  typeof updateDictionaryCustomEntryRequestSchema
>;

export const updateDictionaryPlatformEntryOverrideRequestSchema = z
  .object({
    title: dictionaryTitleRequestSchema,
    content: dictionaryContentRequestSchema
  })
  .strict();
export type UpdateDictionaryPlatformEntryOverrideRequest = z.infer<
  typeof updateDictionaryPlatformEntryOverrideRequestSchema
>;
