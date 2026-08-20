import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { clientAstrologerRelationships } from "../clients";
import { orders } from "../finance";
import { users } from "../identity/accounts.schema";
import { products } from "../products/products.schema";
import { bookings } from "../scheduling/bookings.schema";
import {
  formatReviewsSqlValues,
  reviewDisputeStatusValues,
  reviewModerationCaseMessageAuthorRoleValues,
  reviewModerationCaseMessageVisibilityValues,
  reviewModerationCaseStatusValues,
  reviewModerationReasonCodeValues,
  reviewModerationStatusValues,
  reviewPublicIdentityModeValues,
  reviewRatingAggregateScopeValues,
  reviewVisibilityStatusValues,
  reviewWindowPolicyValues,
  reviewableInstanceKindValues,
  reviewableInstanceStatusValues
} from "./reviews-values";

const textSnapshotCheck = (column: unknown) =>
  sql`length(trim(${column})) between 1 and 240 and ${column} = trim(${column}) and ${column} !~ '[[:cntrl:]]'`;

const reviewTextCheck = (column: unknown) =>
  sql`length(trim(${column})) between 1 and 4000 and ${column} = trim(${column}) and ${column} !~ '[[:cntrl:]]'`;

export const reviewableInstances = pgTable(
  "reviewable_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    relationshipId: uuid("relationship_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("not_yet_received"),
    windowPolicy: text("window_policy").notNull(),
    sourceResourceKey: varchar("source_resource_key", { length: 180 }).notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "restrict" }),
    titleSnapshot: text("title_snapshot").notNull(),
    contextLabelSnapshot: text("context_label_snapshot").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    reviewWindowClosesAt: timestamp("review_window_closes_at", { withTimezone: true }).notNull(),
    blockedReasonCode: varchar("blocked_reason_code", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("reviewable_instances_relationship_identity_unique").on(
      table.relationshipId,
      table.clientUserId,
      table.astrologerUserId
    ),
    uniqueIndex("reviewable_instances_source_unique").on(
      table.astrologerUserId,
      table.clientUserId,
      table.kind,
      table.sourceResourceKey
    ),
    foreignKey({
      columns: [table.relationshipId, table.clientUserId, table.astrologerUserId],
      foreignColumns: [
        clientAstrologerRelationships.id,
        clientAstrologerRelationships.clientUserId,
        clientAstrologerRelationships.astrologerUserId
      ],
      name: "reviewable_instances_relationship_fk"
    }).onDelete("restrict"),
    check(
      "reviewable_instances_kind_check",
      sql`${table.kind} in ${sql.raw(formatReviewsSqlValues(reviewableInstanceKindValues))}`
    ),
    check(
      "reviewable_instances_status_check",
      sql`${table.status} in ${sql.raw(formatReviewsSqlValues(reviewableInstanceStatusValues))}`
    ),
    check(
      "reviewable_instances_window_policy_check",
      sql`${table.windowPolicy} in ${sql.raw(formatReviewsSqlValues(reviewWindowPolicyValues))}`
    ),
    check(
      "reviewable_instances_window_range_check",
      sql`${table.receivedAt} < ${table.reviewWindowClosesAt}`
    ),
    check("reviewable_instances_title_check", textSnapshotCheck(table.titleSnapshot)),
    check("reviewable_instances_context_label_check", textSnapshotCheck(table.contextLabelSnapshot)),
    check(
      "reviewable_instances_source_resource_key_check",
      sql`length(trim(${table.sourceResourceKey})) between 1 and 180 and ${table.sourceResourceKey} = trim(${table.sourceResourceKey})`
    ),
    check(
      "reviewable_instances_block_reason_check",
      sql`(${table.status} = 'blocked' and ${table.blockedReasonCode} is not null) or (${table.status} <> 'blocked' and ${table.blockedReasonCode} is null)`
    ),
    index("reviewable_instances_client_status_window_idx").on(
      table.clientUserId,
      table.status,
      table.reviewWindowClosesAt
    ),
    index("reviewable_instances_astrologer_kind_received_idx").on(
      table.astrologerUserId,
      table.kind,
      table.receivedAt
    )
  ]
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewableInstanceId: uuid("reviewable_instance_id")
      .notNull()
      .references(() => reviewableInstances.id, { onDelete: "restrict" }),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publicIdentityMode: text("public_identity_mode").notNull(),
    visibilityStatus: text("visibility_status").notNull().default("not_public"),
    disputeStatus: text("dispute_status").notNull().default("none"),
    activePublicVersionId: uuid("active_public_version_id"),
    pendingVersionId: uuid("pending_version_id"),
    activePublicReplyVersionId: uuid("active_public_reply_version_id"),
    pendingReplyVersionId: uuid("pending_reply_version_id"),
    firstPublishedAt: timestamp("first_published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("reviews_reviewable_instance_unique").on(table.reviewableInstanceId),
    check(
      "reviews_public_identity_mode_check",
      sql`${table.publicIdentityMode} in ${sql.raw(
        formatReviewsSqlValues(reviewPublicIdentityModeValues)
      )}`
    ),
    check(
      "reviews_visibility_status_check",
      sql`${table.visibilityStatus} in ${sql.raw(formatReviewsSqlValues(reviewVisibilityStatusValues))}`
    ),
    check(
      "reviews_dispute_status_check",
      sql`${table.disputeStatus} in ${sql.raw(formatReviewsSqlValues(reviewDisputeStatusValues))}`
    ),
    check(
      "reviews_visible_version_check",
      sql`(${table.visibilityStatus} = 'visible' and ${table.activePublicVersionId} is not null and ${table.firstPublishedAt} is not null) or ${table.visibilityStatus} <> 'visible'`
    ),
    check(
      "reviews_dispute_hide_check",
      sql`(${table.disputeStatus} in ('open', 'under_review', 'waiting_client', 'waiting_astrologer') and ${table.visibilityStatus} = 'temporarily_hidden_by_dispute') or ${table.disputeStatus} in ('none', 'resolved_closed')`
    ),
    index("reviews_astrologer_visibility_published_idx").on(
      table.astrologerUserId,
      table.visibilityStatus,
      table.firstPublishedAt
    ),
    index("reviews_client_created_idx").on(table.clientUserId, table.createdAt)
  ]
);

export const reviewVersions = pgTable(
  "review_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    rating: integer("rating").notNull(),
    text: text("text").notNull(),
    publicIdentityMode: text("public_identity_mode").notNull(),
    moderationStatus: text("moderation_status").notNull().default("pending"),
    moderationReasonCode: text("moderation_reason_code"),
    moderationNote: text("moderation_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "restrict"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("review_versions_review_number_unique").on(table.reviewId, table.versionNumber),
    check("review_versions_version_number_check", sql`${table.versionNumber} >= 1`),
    check("review_versions_rating_check", sql`${table.rating} between 1 and 5`),
    check("review_versions_text_check", reviewTextCheck(table.text)),
    check(
      "review_versions_public_identity_mode_check",
      sql`${table.publicIdentityMode} in ${sql.raw(
        formatReviewsSqlValues(reviewPublicIdentityModeValues)
      )}`
    ),
    check(
      "review_versions_moderation_status_check",
      sql`${table.moderationStatus} in ${sql.raw(
        formatReviewsSqlValues(reviewModerationStatusValues)
      )}`
    ),
    check(
      "review_versions_moderation_reason_check",
      sql`${table.moderationReasonCode} is null or ${table.moderationReasonCode} in ${sql.raw(
        formatReviewsSqlValues(reviewModerationReasonCodeValues)
      )}`
    ),
    check(
      "review_versions_decision_shape_check",
      sql`(${table.moderationStatus} = 'pending' and ${table.decidedAt} is null and ${table.decidedByUserId} is null and ${table.moderationReasonCode} is null) or (${table.moderationStatus} = 'approved' and ${table.decidedAt} is not null and ${table.decidedByUserId} is not null and ${table.moderationReasonCode} is null) or (${table.moderationStatus} = 'rejected' and ${table.decidedAt} is not null and ${table.decidedByUserId} is not null and ${table.moderationReasonCode} is not null)`
    ),
    check(
      "review_versions_moderation_note_check",
      sql`${table.moderationNote} is null or (length(trim(${table.moderationNote})) <= 2000 and ${table.moderationNote} !~ '[[:cntrl:]]')`
    ),
    index("review_versions_review_status_submitted_idx").on(
      table.reviewId,
      table.moderationStatus,
      table.submittedAt
    )
  ]
);

export const reviewReplyVersions = pgTable(
  "review_reply_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    text: text("text").notNull(),
    moderationStatus: text("moderation_status").notNull().default("pending"),
    moderationReasonCode: text("moderation_reason_code"),
    moderationNote: text("moderation_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "restrict"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("review_reply_versions_review_number_unique").on(table.reviewId, table.versionNumber),
    check("review_reply_versions_version_number_check", sql`${table.versionNumber} >= 1`),
    check("review_reply_versions_text_check", reviewTextCheck(table.text)),
    check(
      "review_reply_versions_moderation_status_check",
      sql`${table.moderationStatus} in ${sql.raw(
        formatReviewsSqlValues(reviewModerationStatusValues)
      )}`
    ),
    check(
      "review_reply_versions_moderation_reason_check",
      sql`${table.moderationReasonCode} is null or ${table.moderationReasonCode} in ${sql.raw(
        formatReviewsSqlValues(reviewModerationReasonCodeValues)
      )}`
    ),
    check(
      "review_reply_versions_decision_shape_check",
      sql`(${table.moderationStatus} = 'pending' and ${table.decidedAt} is null and ${table.decidedByUserId} is null and ${table.moderationReasonCode} is null) or (${table.moderationStatus} = 'approved' and ${table.decidedAt} is not null and ${table.decidedByUserId} is not null and ${table.moderationReasonCode} is null) or (${table.moderationStatus} = 'rejected' and ${table.decidedAt} is not null and ${table.decidedByUserId} is not null and ${table.moderationReasonCode} is not null)`
    ),
    index("review_reply_versions_review_status_submitted_idx").on(
      table.reviewId,
      table.moderationStatus,
      table.submittedAt
    )
  ]
);

export const reviewModerationCases = pgTable(
  "review_moderation_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("open"),
    reasonCode: text("reason_code").notNull(),
    openedByUserId: uuid("opened_by_user_id").references(() => users.id, {
      onDelete: "restrict"
    }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "restrict"
    })
  },
  (table) => [
    check(
      "review_moderation_cases_status_check",
      sql`${table.status} in ${sql.raw(formatReviewsSqlValues(reviewModerationCaseStatusValues))}`
    ),
    check(
      "review_moderation_cases_reason_check",
      sql`${table.reasonCode} in ${sql.raw(formatReviewsSqlValues(reviewModerationReasonCodeValues))}`
    ),
    check(
      "review_moderation_cases_close_shape_check",
      sql`(${table.status} = 'closed' and ${table.closedAt} is not null and ${table.closedByUserId} is not null) or (${table.status} <> 'closed' and ${table.closedAt} is null and ${table.closedByUserId} is null)`
    ),
    index("review_moderation_cases_status_opened_idx").on(table.status, table.openedAt),
    index("review_moderation_cases_review_idx").on(table.reviewId)
  ]
);

export const reviewModerationCaseMessages = pgTable(
  "review_moderation_case_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => reviewModerationCases.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "restrict" }),
    authorRole: text("author_role").notNull(),
    visibility: text("visibility").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "review_moderation_case_messages_author_role_check",
      sql`${table.authorRole} in ${sql.raw(
        formatReviewsSqlValues(reviewModerationCaseMessageAuthorRoleValues)
      )}`
    ),
    check(
      "review_moderation_case_messages_visibility_check",
      sql`${table.visibility} in ${sql.raw(
        formatReviewsSqlValues(reviewModerationCaseMessageVisibilityValues)
      )}`
    ),
    check(
      "review_moderation_case_messages_visibility_author_check",
      sql`(${table.authorRole} = 'moderator') or (${table.authorRole} = 'client' and ${table.visibility} in ('all_case_participants', 'client_and_moderators')) or (${table.authorRole} = 'astrologer' and ${table.visibility} in ('all_case_participants', 'astrologer_and_moderators')) or (${table.authorRole} = 'system' and ${table.visibility} in ('all_case_participants', 'moderators_only'))`
    ),
    check("review_moderation_case_messages_body_check", reviewTextCheck(table.body)),
    index("review_moderation_case_messages_case_created_idx").on(table.caseId, table.createdAt)
  ]
);

export const reviewRatingAggregates = pgTable(
  "review_rating_aggregates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    visibleReviewCount: integer("visible_review_count").notNull().default(0),
    approvedReviewCount: integer("approved_review_count").notNull().default(0),
    ratingSum: integer("rating_sum").notNull().default(0),
    lastPublishedAt: timestamp("last_published_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("review_rating_aggregates_astrologer_unique")
      .on(table.astrologerUserId)
      .where(sql`${table.scope} = 'astrologer' and ${table.productId} is null`),
    uniqueIndex("review_rating_aggregates_product_unique")
      .on(table.astrologerUserId, table.productId)
      .where(sql`${table.scope} = 'product' and ${table.productId} is not null`),
    check(
      "review_rating_aggregates_scope_check",
      sql`${table.scope} in ${sql.raw(formatReviewsSqlValues(reviewRatingAggregateScopeValues))}`
    ),
    check(
      "review_rating_aggregates_scope_shape_check",
      sql`(${table.scope} = 'astrologer' and ${table.productId} is null) or (${table.scope} = 'product' and ${table.productId} is not null)`
    ),
    check(
      "review_rating_aggregates_counts_check",
      sql`${table.visibleReviewCount} >= 0 and ${table.approvedReviewCount} >= ${table.visibleReviewCount} and ${table.ratingSum} >= 0 and ${table.ratingSum} <= ${table.approvedReviewCount} * 5`
    )
  ]
);
