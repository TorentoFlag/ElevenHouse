import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { mediaAssets } from "../media/media-assets.schema";
import { calculationRecords } from "./calculation-records.schema";
import { calculationVersions } from "./calculation-versions.schema";
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
    versionId: uuid("version_id").notNull(),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    artifactType: text("artifact_type").notNull(),
    status: text("status").notNull().default("generating"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "calculation_artifacts_type_check",
      sql`${table.artifactType} in ${sql.raw(formatCalculationSqlValues(calculationArtifactTypeValues))}`
    ),
    check(
      "calculation_artifacts_status_check",
      sql`${table.status} in ${sql.raw(formatCalculationSqlValues(calculationArtifactStatusValues))}`
    ),
    foreignKey({
      columns: [table.versionId, table.calculationId],
      foreignColumns: [calculationVersions.id, calculationVersions.calculationId],
      name: "calculation_artifacts_version_calculation_fk"
    }).onDelete("cascade"),
    index("calculation_artifacts_record_idx").on(table.calculationId),
    index("calculation_artifacts_version_idx").on(table.versionId),
    index("calculation_artifacts_media_idx").on(table.mediaAssetId)
  ]
);
