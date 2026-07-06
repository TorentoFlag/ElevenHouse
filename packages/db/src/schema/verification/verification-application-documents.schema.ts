import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { mediaAssets } from "../media/media-assets.schema";
import { verificationApplications } from "./verification-applications.schema";
import { formatVerificationSqlValues, verificationDocumentKindValues } from "./verification-values";

export const verificationApplicationDocuments = pgTable(
  "verification_application_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => verificationApplications.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "verification_application_documents_kind_check",
      sql`${table.kind} in ${sql.raw(formatVerificationSqlValues(verificationDocumentKindValues))}`
    ),
    index("verification_application_documents_application_idx").on(table.applicationId),
    index("verification_application_documents_media_idx").on(table.mediaId),
    uniqueIndex("verification_application_documents_application_media_unique").on(
      table.applicationId,
      table.mediaId
    )
  ]
);
