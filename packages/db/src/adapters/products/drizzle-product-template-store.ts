import { and, asc, eq } from "drizzle-orm";
import type {
  ProductTemplate,
  ProductTemplateLocale,
  ProductTemplatePayload,
  ProductTemplateStore,
  ProductTemplateStatus,
  ProductType
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { productTemplates } from "../../schema";

type ProductTemplateRow = typeof productTemplates.$inferSelect;

export function createDrizzleProductTemplateStore(
  database: ElevenHouseDatabase
): ProductTemplateStore {
  return {
    listActiveByLocale: async (input) => {
      const rows = await database
        .select()
        .from(productTemplates)
        .where(
          and(eq(productTemplates.locale, input.locale), eq(productTemplates.status, "active"))
        )
        .orderBy(asc(productTemplates.sortOrder), asc(productTemplates.code));

      return rows.map(toProductTemplate);
    },
    findActiveByCodeAndLocale: async (input) => {
      const [row] = await database
        .select()
        .from(productTemplates)
        .where(
          and(
            eq(productTemplates.code, input.code),
            eq(productTemplates.locale, input.locale),
            eq(productTemplates.status, "active")
          )
        )
        .limit(1);

      return row ? toProductTemplate(row) : null;
    }
  };
}

function toProductTemplate(row: ProductTemplateRow): ProductTemplate {
  return {
    id: row.id,
    code: row.code,
    locale: row.locale as ProductTemplateLocale,
    type: row.type as ProductType,
    status: row.status as ProductTemplateStatus,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    sortOrder: row.sortOrder,
    payload: row.payload as ProductTemplatePayload,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
