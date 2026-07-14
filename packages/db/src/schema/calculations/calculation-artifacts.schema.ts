import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { mediaAssets } from "../media/media-assets.schema";
import { calculationRecords } from "./calculation-records.schema";
import {
  calculationArtifactStatusValues,
  calculationArtifactTypeValues,
  formatCalculationSqlValues
} from "./calculation-values";

export const calculationArtifacts = pgTable(
  "calculation_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calculationId: uuid("calculation_id")
      .notNull()
      .references(() => calculationRecords.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    artifactType: text("artifact_type").notNull(),
    status: text("status").notNull().default("generating"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("calculation_artifacts_id_calculation_unique").on(table.id, table.calculationId),
    check(
      "calculation_artifacts_type_check",
      sql`${table.artifactType} in ${sql.raw(formatCalculationSqlValues(calculationArtifactTypeValues))}`
    ),
    check(
      "calculation_artifacts_status_check",
      sql`${table.status} in ${sql.raw(formatCalculationSqlValues(calculationArtifactStatusValues))}`
    ),
    index("calculation_artifacts_record_idx").on(table.calculationId),
    index("calculation_artifacts_media_idx").on(table.mediaAssetId)
  ]
);
