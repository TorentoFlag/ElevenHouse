import { nonEmptyStringSchema, z } from "@elevenhouse/validation";

export const dictionaryLocaleSchema = z.string().trim().pipe(z.enum(["ru", "en"]));
export const dictionaryEntrySourceSchema = z.enum(["platform", "modified", "custom"]);
export const dictionaryEntrySourceFilterSchema = z.union([
  z.literal("all"),
  dictionaryEntrySourceSchema
]);

const uuidSchema = z.string().uuid();
const optionalNonEmptyStringSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();
const paginationNumberSchema = z.coerce.number().int().min(0);

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
    title: nonEmptyStringSchema,
    content: nonEmptyStringSchema
  })
  .strict();
export type CreateDictionaryCustomEntryRequest = z.infer<
  typeof createDictionaryCustomEntryRequestSchema
>;

export const updateDictionaryPlatformEntryOverrideRequestSchema = z
  .object({
    title: nonEmptyStringSchema,
    content: nonEmptyStringSchema
  })
  .strict();
export type UpdateDictionaryPlatformEntryOverrideRequest = z.infer<
  typeof updateDictionaryPlatformEntryOverrideRequestSchema
>;
