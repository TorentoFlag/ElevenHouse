import { ianaTimeZoneSchema, z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const positiveVersionSchema = z.number().int().safe().positive();
const bodySchema = z.string().trim().min(1).max(20_000);
const attachmentIdsSchema = z
  .array(uuidSchema)
  .max(20)
  .refine((value) => new Set(value).size === value.length, "Attachment IDs must be unique");
const isoWeekdaySchema = z.number().int().min(1).max(7);

export const astroDiaryParticipantRoleSchema = z.enum(["client", "astrologer"]);
export type AstroDiaryParticipantRole = z.infer<typeof astroDiaryParticipantRoleSchema>;

export const astroDiaryJournalStateSchema = z.enum(["active", "erasing", "erased"]);
export type AstroDiaryJournalState = z.infer<typeof astroDiaryJournalStateSchema>;

export const astroDiaryJournalSchema = z
  .object({
    id: uuidSchema,
    relationshipId: uuidSchema,
    journalEpochId: uuidSchema,
    astrologerUserId: uuidSchema,
    clientUserId: uuidSchema,
    state: astroDiaryJournalStateSchema,
    version: positiveVersionSchema,
    createdAt: instantSchema
  })
  .strict();
export type AstroDiaryJournal = z.infer<typeof astroDiaryJournalSchema>;

export const astroDiaryCycleStateSchema = z.enum([
  "awaiting_client_entry",
  "awaiting_astrologer_response",
  "awaiting_client_follow_up",
  "awaiting_astrologer_closing_response",
  "closed"
]);
export type AstroDiaryCycleState = z.infer<typeof astroDiaryCycleStateSchema>;

export const astroDiaryCycleCloseReasonSchema = z.enum([
  "completed",
  "client_declined",
  "prompt_withdrawn",
  "client_response_expired",
  "trigger_deleted",
  "journal_deleted",
  "cancelled_by_finance_revocation"
]);
export type AstroDiaryCycleCloseReason = z.infer<typeof astroDiaryCycleCloseReasonSchema>;

export const astroDiaryCycleSchema = z
  .object({
    id: uuidSchema,
    journalId: uuidSchema,
    openingPeriodId: uuidSchema,
    openingAllowanceReservationId: uuidSchema.nullable(),
    awaitingClientPromptItemId: uuidSchema.nullable(),
    clientResponseDueAt: instantSchema.nullable(),
    clientResponseWindowCalendarDays: z.number().int().min(1).max(90).nullable(),
    clientResponseTimezone: ianaTimeZoneSchema.nullable(),
    state: astroDiaryCycleStateSchema,
    version: positiveVersionSchema,
    openedAt: instantSchema,
    closedAt: instantSchema.nullable(),
    closeReason: astroDiaryCycleCloseReasonSchema.nullable()
  })
  .strict()
  .superRefine((value, context) => {
    const closed = value.state === "closed";
    if (closed !== (value.closedAt !== null && value.closeReason !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "Closed cycle evidence must be complete and open cycle evidence must be empty"
      });
    }
    if (value.closedAt !== null && Date.parse(value.closedAt) < Date.parse(value.openedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closedAt"],
        message: "Cycle cannot close before it opens"
      });
    }
    if (value.state === "awaiting_client_entry" && value.openingAllowanceReservationId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["openingAllowanceReservationId"],
        message: "An astrologer-opened cycle must bind its allowance reservation"
      });
    }
    const awaitingClient =
      value.state === "awaiting_client_entry" || value.state === "awaiting_client_follow_up";
    if (awaitingClient !== (value.awaitingClientPromptItemId !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["awaitingClientPromptItemId"],
        message: "An awaiting-client cycle must bind its exact visible prompt"
      });
    }
    const hasCompleteClientWindow =
      value.clientResponseDueAt !== null &&
      value.clientResponseWindowCalendarDays !== null &&
      value.clientResponseTimezone !== null;
    const hasAnyClientWindow =
      value.clientResponseDueAt !== null ||
      value.clientResponseWindowCalendarDays !== null ||
      value.clientResponseTimezone !== null;
    if (
      (awaitingClient && !hasCompleteClientWindow) ||
      (!awaitingClient && value.state !== "closed" && hasAnyClientWindow) ||
      (value.state === "closed" && hasAnyClientWindow && !hasCompleteClientWindow)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientResponseDueAt"],
        message: "Client response window evidence must be complete and state-consistent"
      });
    }
    if (
      value.clientResponseDueAt !== null &&
      Date.parse(value.clientResponseDueAt) <= Date.parse(value.openedAt)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientResponseDueAt"],
        message: "Client response deadline must be after cycle opening"
      });
    }
  });
export type AstroDiaryCycle = z.infer<typeof astroDiaryCycleSchema>;

export const astroDiaryMoodIdSchema = z.enum([
  "inspired",
  "joy",
  "calm",
  "tired",
  "anxious",
  "sad"
]);
export type AstroDiaryMoodId = z.infer<typeof astroDiaryMoodIdSchema>;

export const astroDiaryContextStatusSchema = z.enum([
  "pending",
  "global_only",
  "personal",
  "failed",
  "source_stale"
]);
export type AstroDiaryContextStatus = z.infer<typeof astroDiaryContextStatusSchema>;

export const astroDiaryVisibleTimelineKindSchema = z.enum([
  "client_entry",
  "astrologer_reply",
  "reflection_prompt",
  "correction"
]);
export type AstroDiaryVisibleTimelineKind = z.infer<typeof astroDiaryVisibleTimelineKindSchema>;

const timelineIdentityShape = {
  id: uuidSchema,
  journalId: uuidSchema,
  cycleId: uuidSchema,
  authorUserId: uuidSchema,
  revision: positiveVersionSchema,
  occurredAt: instantSchema,
  cursor: positiveVersionSchema
} as const;

const visibleTimelineShape = {
  ...timelineIdentityShape,
  body: bodySchema,
  attachmentIds: attachmentIdsSchema,
  editedAt: instantSchema.nullable()
} as const;

export const astroDiaryTimelineItemSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...visibleTimelineShape,
        kind: z.literal("client_entry"),
        authorRole: z.literal("client"),
        moodId: astroDiaryMoodIdSchema.nullable(),
        contextStatus: astroDiaryContextStatusSchema,
        correctsItemId: z.null()
      })
      .strict(),
    z
      .object({
        ...visibleTimelineShape,
        kind: z.literal("astrologer_reply"),
        authorRole: z.literal("astrologer"),
        moodId: z.null(),
        contextStatus: z.null(),
        correctsItemId: z.null()
      })
      .strict(),
    z
      .object({
        ...visibleTimelineShape,
        kind: z.literal("reflection_prompt"),
        authorRole: z.literal("astrologer"),
        moodId: z.null(),
        contextStatus: z.null(),
        correctsItemId: z.null()
      })
      .strict(),
    z
      .object({
        ...visibleTimelineShape,
        kind: z.literal("correction"),
        authorRole: astroDiaryParticipantRoleSchema,
        moodId: z.null(),
        contextStatus: z.null(),
        correctsItemId: uuidSchema
      })
      .strict(),
    z
      .object({
        ...timelineIdentityShape,
        kind: z.literal("tombstone"),
        originalKind: astroDiaryVisibleTimelineKindSchema,
        authorRole: astroDiaryParticipantRoleSchema,
        reason: z.enum(["hidden_by_author", "content_erased"])
      })
      .strict()
  ])
  .superRefine((value, context) => {
    if (value.kind === "correction" && value.correctsItemId === value.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctsItemId"],
        message: "A correction cannot reference itself"
      });
    }
  });
export type AstroDiaryTimelineItem = z.infer<typeof astroDiaryTimelineItemSchema>;

const draftIdentityShape = {
  id: uuidSchema,
  journalId: uuidSchema,
  cycleId: uuidSchema.nullable(),
  authorUserId: uuidSchema,
  version: positiveVersionSchema,
  body: z.string().max(20_000),
  attachmentIds: attachmentIdsSchema,
  updatedAt: instantSchema
} as const;

export const astroDiaryDraftSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...draftIdentityShape,
      kind: z.literal("client_entry"),
      authorRole: z.literal("client"),
      moodId: astroDiaryMoodIdSchema.nullable(),
      correctsItemId: z.null()
    })
    .strict(),
  z
    .object({
      ...draftIdentityShape,
      kind: z.literal("astrologer_reply"),
      authorRole: z.literal("astrologer"),
      moodId: z.null(),
      correctsItemId: z.null()
    })
    .strict(),
  z
    .object({
      ...draftIdentityShape,
      kind: z.literal("reflection_prompt"),
      authorRole: z.literal("astrologer"),
      moodId: z.null(),
      correctsItemId: z.null()
    })
    .strict(),
  z
    .object({
      ...draftIdentityShape,
      kind: z.literal("correction"),
      authorRole: astroDiaryParticipantRoleSchema,
      moodId: z.null(),
      correctsItemId: uuidSchema
    })
    .strict()
]);
export type AstroDiaryDraft = z.infer<typeof astroDiaryDraftSchema>;

export const astroDiaryResponseObligationStateSchema = z.enum([
  "open",
  "satisfied",
  "overdue",
  "cancelled_by_finance_revocation",
  "closed_without_response"
]);
export type AstroDiaryResponseObligationState = z.infer<
  typeof astroDiaryResponseObligationStateSchema
>;

export const astroDiaryResponseObligationSchema = z
  .object({
    id: uuidSchema,
    journalId: uuidSchema,
    cycleId: uuidSchema,
    triggerItemId: uuidSchema,
    state: astroDiaryResponseObligationStateSchema,
    version: positiveVersionSchema,
    openedAt: instantSchema,
    dueAt: instantSchema,
    responseSlaWorkingDays: z.number().int().min(1).max(30),
    workingWeekdays: z
      .array(isoWeekdaySchema)
      .min(1)
      .max(7)
      .refine((value) => new Set(value).size === value.length, "Working weekdays must be unique"),
    serviceTimezone: ianaTimeZoneSchema,
    resolvedDueLocal: z.string().datetime({ local: true }),
    resolvedDueOffset: z.string().regex(/^[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/),
    satisfiedByItemId: uuidSchema.nullable(),
    closedAt: instantSchema.nullable()
  })
  .strict()
  .superRefine((value, context) => {
    const satisfied = value.state === "satisfied";
    const terminalWithoutResponse =
      value.state === "cancelled_by_finance_revocation" ||
      value.state === "closed_without_response";
    if (satisfied !== (value.satisfiedByItemId !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["satisfiedByItemId"],
        message: "Satisfied obligation must bind the response item"
      });
    }
    if ((satisfied || terminalWithoutResponse) !== (value.closedAt !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closedAt"],
        message: "Only terminal obligations carry closedAt"
      });
    }
    if (Date.parse(value.dueAt) <= Date.parse(value.openedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueAt"],
        message: "Response due time must follow obligation creation"
      });
    }
    if (value.closedAt !== null && Date.parse(value.closedAt) < Date.parse(value.openedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closedAt"],
        message: "Obligation cannot close before it opens"
      });
    }
    const dueEvidence = resolvedInstantEvidence(value.dueAt, value.serviceTimezone);
    if (
      Date.parse(`${value.resolvedDueLocal}${value.resolvedDueOffset}`) !==
        Date.parse(value.dueAt) ||
      dueEvidence.local !== value.resolvedDueLocal ||
      dueEvidence.offset !== value.resolvedDueOffset
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resolvedDueLocal"],
        message: "Resolved due evidence must match dueAt in the service timezone"
      });
    }
  });
export type AstroDiaryResponseObligation = z.infer<typeof astroDiaryResponseObligationSchema>;

function resolvedInstantEvidence(
  instant: string,
  timeZone: string
): Readonly<{ local: string; offset: string }> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset"
  }).formatToParts(new Date(instant));
  const byType = new Map(parts.map(({ type, value }) => [type, value]));
  const offset = byType.get("timeZoneName")?.replace(/^GMT/, "") ?? "";
  const rawFraction = /\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/.exec(instant)?.[1];
  const fraction = rawFraction?.replace(/0+$/, "");
  return {
    local: `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}T${byType.get("hour")}:${byType.get("minute")}:${byType.get("second")}${fraction ? `.${fraction}` : ""}`,
    offset: offset === "" ? "+00:00" : offset
  };
}

export const astroDiaryCommandSchema = z
  .object({
    expectedVersion: positiveVersionSchema,
    idempotencyKey: z.string().trim().min(1).max(160)
  })
  .strict();
export type AstroDiaryCommand = z.infer<typeof astroDiaryCommandSchema>;

export const astroDiaryEventTypeSchema = z.enum([
  "astro_diary.cycle_opened.v1",
  "astro_diary.cycle_closed.v1",
  "astro_diary.timeline_item_published.v1",
  "astro_diary.timeline_item_edited.v1",
  "astro_diary.timeline_item_hidden.v1",
  "astro_diary.timeline_item_erased.v1",
  "astro_diary.response_obligation_created.v1",
  "astro_diary.response_obligation_satisfied.v1",
  "astro_diary.response_obligation_overdue.v1",
  "astro_diary.context_generation_requested.v1",
  "astro_diary.context_completed.v1",
  "astro_diary.context_failed.v1",
  "astro_diary.derivative_generation_requested.v1",
  "astro_diary.ai_generation_requested.v1",
  "astro_diary.ai_updated.v1",
  "astro_diary.export_requested.v1",
  "astro_diary.export_ready.v1",
  "astro_diary.export_failed.v1",
  "astro_diary.export_invalidated.v1",
  "astro_diary.erasure_requested.v1",
  "astro_diary.erasure_completed.v1",
  "astro_diary.journal_activated.v1"
]);
export type AstroDiaryEventType = z.infer<typeof astroDiaryEventTypeSchema>;

const journalEventDataSchema = z
  .object({ journalId: uuidSchema, journalEpochId: uuidSchema })
  .strict();
const cycleEventDataSchema = journalEventDataSchema.extend({ cycleId: uuidSchema }).strict();
const itemEventDataSchema = cycleEventDataSchema.extend({ itemId: uuidSchema }).strict();
const eventEnvelope = <Type extends AstroDiaryEventType, Data extends z.ZodType>(
  eventType: Type,
  data: Data
) =>
  z
    .object({
      eventId: uuidSchema,
      eventType: z.literal(eventType),
      schemaVersion: z.literal(1),
      occurredAt: instantSchema,
      data
    })
    .strict();

export const astroDiaryEventSchema = z.discriminatedUnion("eventType", [
  eventEnvelope(
    "astro_diary.cycle_opened.v1",
    cycleEventDataSchema.extend({ periodId: uuidSchema }).strict()
  ),
  eventEnvelope("astro_diary.timeline_item_published.v1", itemEventDataSchema),
  eventEnvelope("astro_diary.timeline_item_edited.v1", itemEventDataSchema),
  eventEnvelope("astro_diary.timeline_item_hidden.v1", itemEventDataSchema),
  eventEnvelope("astro_diary.timeline_item_erased.v1", itemEventDataSchema),
  eventEnvelope("astro_diary.cycle_closed.v1", cycleEventDataSchema),
  eventEnvelope(
    "astro_diary.response_obligation_created.v1",
    cycleEventDataSchema.extend({ obligationId: uuidSchema }).strict()
  ),
  eventEnvelope(
    "astro_diary.response_obligation_satisfied.v1",
    cycleEventDataSchema.extend({ obligationId: uuidSchema, responseItemId: uuidSchema }).strict()
  ),
  eventEnvelope(
    "astro_diary.response_obligation_overdue.v1",
    cycleEventDataSchema.extend({ obligationId: uuidSchema }).strict()
  ),
  eventEnvelope("astro_diary.context_generation_requested.v1", itemEventDataSchema),
  eventEnvelope(
    "astro_diary.context_completed.v1",
    itemEventDataSchema.extend({ contextId: uuidSchema }).strict()
  ),
  eventEnvelope(
    "astro_diary.context_failed.v1",
    itemEventDataSchema.extend({ contextId: uuidSchema }).strict()
  ),
  eventEnvelope("astro_diary.derivative_generation_requested.v1", itemEventDataSchema),
  eventEnvelope(
    "astro_diary.ai_generation_requested.v1",
    cycleEventDataSchema.extend({ commandId: uuidSchema }).strict()
  ),
  eventEnvelope(
    "astro_diary.ai_updated.v1",
    cycleEventDataSchema.extend({ commandId: uuidSchema }).strict()
  ),
  eventEnvelope(
    "astro_diary.export_requested.v1",
    journalEventDataSchema.extend({ commandId: uuidSchema }).strict()
  ),
  eventEnvelope(
    "astro_diary.export_ready.v1",
    journalEventDataSchema.extend({ commandId: uuidSchema }).strict()
  ),
  eventEnvelope(
    "astro_diary.export_failed.v1",
    journalEventDataSchema.extend({ commandId: uuidSchema }).strict()
  ),
  eventEnvelope(
    "astro_diary.export_invalidated.v1",
    journalEventDataSchema.extend({ commandId: uuidSchema }).strict()
  ),
  eventEnvelope(
    "astro_diary.erasure_requested.v1",
    journalEventDataSchema.extend({ commandId: uuidSchema }).strict()
  ),
  eventEnvelope(
    "astro_diary.erasure_completed.v1",
    journalEventDataSchema.extend({ commandId: uuidSchema }).strict()
  ),
  eventEnvelope("astro_diary.journal_activated.v1", journalEventDataSchema)
]);
export type AstroDiaryEvent = z.infer<typeof astroDiaryEventSchema>;

const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const astroDiaryContextBaseShape = {
  id: uuidSchema,
  journalId: uuidSchema,
  itemId: uuidSchema,
  sourceItemRevision: positiveVersionSchema,
  sourceItemDigest: sha256DigestSchema,
  eventAt: instantSchema,
  eventTimezone: ianaTimeZoneSchema,
  version: positiveVersionSchema
} as const;
const emptyContextEvidenceShape = {
  engineRevision: z.null(),
  globalContextRef: z.null(),
  birthProfileId: z.null(),
  birthProfileRevision: z.null(),
  personalChartRef: z.null(),
  contextDigest: z.null(),
  calculatedAt: z.null()
} as const;
const calculatedContextEvidenceShape = {
  engineRevision: z.string().trim().min(1).max(200),
  globalContextRef: uuidSchema,
  contextDigest: sha256DigestSchema,
  calculatedAt: instantSchema,
  failureCode: z.null()
} as const;

export const astroDiaryContextSnapshotSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...astroDiaryContextBaseShape,
      status: z.literal("pending"),
      ...emptyContextEvidenceShape,
      failureCode: z.null()
    })
    .strict(),
  z
    .object({
      ...astroDiaryContextBaseShape,
      status: z.literal("global_only"),
      ...calculatedContextEvidenceShape,
      birthProfileId: z.null(),
      birthProfileRevision: z.null(),
      personalChartRef: z.null()
    })
    .strict(),
  z
    .object({
      ...astroDiaryContextBaseShape,
      status: z.literal("personal"),
      ...calculatedContextEvidenceShape,
      birthProfileId: uuidSchema,
      birthProfileRevision: positiveVersionSchema,
      personalChartRef: uuidSchema
    })
    .strict(),
  z
    .object({
      ...astroDiaryContextBaseShape,
      status: z.literal("failed"),
      ...emptyContextEvidenceShape,
      failureCode: z.string().trim().min(1).max(160),
      calculatedAt: instantSchema
    })
    .strict(),
  z
    .object({
      ...astroDiaryContextBaseShape,
      status: z.literal("source_stale"),
      ...emptyContextEvidenceShape,
      failureCode: z.literal("source_stale"),
      calculatedAt: instantSchema
    })
    .strict()
]);
export type AstroDiaryContextSnapshot = z.infer<typeof astroDiaryContextSnapshotSchema>;

const nonnegativeCursorSchema = z.number().int().safe().nonnegative();
const queryIntegerSchema = (minimum: number, maximum: number) =>
  z
    .union([
      z.number().int().safe().min(minimum).max(maximum),
      z
        .string()
        .regex(/^(?:0|[1-9]\d*)$/)
        .transform((value) => Number(value))
    ])
    .pipe(z.number().int().safe().min(minimum).max(maximum));
const idempotencyOutcomeSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("applied"),
      eventIds: z
        .array(uuidSchema)
        .max(20)
        .refine((value) => new Set(value).size === value.length, "Event IDs must be unique")
    })
    .strict(),
  z
    .object({
      outcome: z.literal("replayed"),
      eventIds: z
        .array(uuidSchema)
        .max(20)
        .refine((value) => new Set(value).size === value.length, "Event IDs must be unique")
    })
    .strict()
]);

export const astroDiaryCommandResponseSchema = idempotencyOutcomeSchema;
export type AstroDiaryCommandResponse = z.infer<typeof astroDiaryCommandResponseSchema>;

const activeDiaryAccessSchema = z
  .object({
    mode: z.literal("active"),
    subscriptionId: uuidSchema,
    subscriptionState: z.enum(["active", "cancel_at_period_end"]),
    currentPeriod: z
      .object({
        id: uuidSchema,
        sequence: positiveVersionSchema,
        startsAt: instantSchema,
        endsAt: instantSchema
      })
      .strict(),
    allowance: z
      .object({
        periodId: uuidSchema,
        total: z.number().int().nonnegative(),
        available: z.number().int().nonnegative(),
        reserved: z.number().int().nonnegative(),
        consumed: z.number().int().nonnegative(),
        released: z.number().int().nonnegative()
      })
      .strict()
      .refine(
        ({ total, available, reserved, consumed, released }) =>
          available + reserved + consumed + released === total,
        "Allowance buckets must sum to total"
      )
  })
  .strict()
  .superRefine((value, context) => {
    if (value.allowance.periodId !== value.currentPeriod.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowance", "periodId"],
        message: "Current allowance must belong to the current paid period"
      });
    }
    if (Date.parse(value.currentPeriod.startsAt) >= Date.parse(value.currentPeriod.endsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentPeriod", "endsAt"],
        message: "Current paid period must be non-empty"
      });
    }
  });

const readOnlyDiaryAccessSchema = z
  .object({
    mode: z.literal("read_only"),
    subscriptionId: uuidSchema,
    subscriptionState: z.enum(["ended", "revoked"]),
    currentPeriod: z.null(),
    allowance: z.null()
  })
  .strict();

export const astroDiaryJournalSummaryResponseSchema = z
  .object({
    journal: astroDiaryJournalSchema,
    currentCycle: astroDiaryCycleSchema.nullable(),
    currentObligation: astroDiaryResponseObligationSchema.nullable(),
    access: z.discriminatedUnion("mode", [activeDiaryAccessSchema, readOnlyDiaryAccessSchema]),
    unreadCount: z.number().int().nonnegative(),
    visibleMaxCursor: nonnegativeCursorSchema
  })
  .strict();
export type AstroDiaryJournalSummaryResponse = z.infer<
  typeof astroDiaryJournalSummaryResponseSchema
>;

export const astroDiaryTimelineQuerySchema = z
  .object({
    afterCursor: queryIntegerSchema(0, Number.MAX_SAFE_INTEGER).optional().default(0),
    limit: queryIntegerSchema(1, 100).optional().default(50)
  })
  .strict();
export type AstroDiaryTimelineQueryInput = z.input<typeof astroDiaryTimelineQuerySchema>;
export type AstroDiaryTimelineQuery = z.infer<typeof astroDiaryTimelineQuerySchema>;

export const astroDiaryTimelinePageSchema = z
  .object({
    items: z.array(astroDiaryTimelineItemSchema).max(100),
    nextCursor: nonnegativeCursorSchema.nullable(),
    visibleMaxCursor: nonnegativeCursorSchema,
    hasMore: z.boolean()
  })
  .strict()
  .superRefine((value, context) => {
    const cursors = value.items.map(({ cursor }) => cursor);
    if (cursors.some((cursor, index) => index > 0 && cursor <= cursors[index - 1]!)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Timeline page must be strictly ordered by cursor"
      });
    }
    const lastCursor = cursors.at(-1) ?? null;
    if (
      value.nextCursor !== lastCursor ||
      (lastCursor !== null && lastCursor > value.visibleMaxCursor) ||
      (value.hasMore && lastCursor === null) ||
      value.hasMore !== (lastCursor !== null && lastCursor < value.visibleMaxCursor)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextCursor"],
        message: "Timeline cursor metadata must match the returned page"
      });
    }
  });
export type AstroDiaryTimelinePage = z.infer<typeof astroDiaryTimelinePageSchema>;

const draftCreateIdentityShape = {
  expectedJournalVersion: positiveVersionSchema,
  cycleId: uuidSchema.nullable(),
  body: z.string().max(20_000),
  attachmentIds: attachmentIdsSchema
} as const;

export const astroDiaryClientDraftCreateRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...draftCreateIdentityShape,
      kind: z.literal("client_entry"),
      moodId: astroDiaryMoodIdSchema.nullable(),
      correctsItemId: z.null()
    })
    .strict(),
  z
    .object({
      ...draftCreateIdentityShape,
      kind: z.literal("correction"),
      moodId: z.null(),
      correctsItemId: uuidSchema
    })
    .strict()
]);
export type AstroDiaryClientDraftCreateRequest = z.infer<
  typeof astroDiaryClientDraftCreateRequestSchema
>;

export const astroDiaryAstrologerDraftCreateRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...draftCreateIdentityShape,
      kind: z.literal("astrologer_reply"),
      moodId: z.null(),
      correctsItemId: z.null()
    })
    .strict(),
  z
    .object({
      ...draftCreateIdentityShape,
      kind: z.literal("reflection_prompt"),
      moodId: z.null(),
      correctsItemId: z.null()
    })
    .strict(),
  z
    .object({
      ...draftCreateIdentityShape,
      kind: z.literal("correction"),
      moodId: z.null(),
      correctsItemId: uuidSchema
    })
    .strict()
]);
export type AstroDiaryAstrologerDraftCreateRequest = z.infer<
  typeof astroDiaryAstrologerDraftCreateRequestSchema
>;

const draftUpdateShape = {
  expectedJournalVersion: positiveVersionSchema,
  draftId: uuidSchema,
  expectedDraftVersion: positiveVersionSchema,
  body: z.string().max(20_000),
  attachmentIds: attachmentIdsSchema
} as const;

export const astroDiaryClientDraftUpdateRequestSchema = z
  .object({ ...draftUpdateShape, moodId: astroDiaryMoodIdSchema.nullable() })
  .strict();
export type AstroDiaryClientDraftUpdateRequest = z.infer<
  typeof astroDiaryClientDraftUpdateRequestSchema
>;

export const astroDiaryAstrologerDraftUpdateRequestSchema = z
  .object({ ...draftUpdateShape, moodId: z.null() })
  .strict();
export type AstroDiaryAstrologerDraftUpdateRequest = z.infer<
  typeof astroDiaryAstrologerDraftUpdateRequestSchema
>;

export const astroDiaryDraftMutationResponseSchema = z
  .object({
    outcome: z.enum(["applied", "replayed"]),
    draftId: uuidSchema,
    version: positiveVersionSchema
  })
  .strict();
export type AstroDiaryDraftMutationResponse = z.infer<typeof astroDiaryDraftMutationResponseSchema>;

export const astroDiaryPublishDraftRequestSchema = z
  .object({
    expectedJournalVersion: positiveVersionSchema,
    draftId: uuidSchema,
    expectedDraftVersion: positiveVersionSchema
  })
  .strict();
export type AstroDiaryPublishDraftRequest = z.infer<typeof astroDiaryPublishDraftRequestSchema>;

export const astroDiaryPromptDecisionRequestSchema = z
  .object({
    expectedJournalVersion: positiveVersionSchema,
    cycleId: uuidSchema,
    expectedCycleVersion: positiveVersionSchema,
    promptItemId: uuidSchema,
    expectedPromptRevision: positiveVersionSchema
  })
  .strict();
export type AstroDiaryPromptDecisionRequest = z.infer<typeof astroDiaryPromptDecisionRequestSchema>;

export const astroDiaryItemEditRequestSchema = z
  .object({
    expectedJournalVersion: positiveVersionSchema,
    expectedItemRevision: positiveVersionSchema,
    body: bodySchema,
    attachmentIds: attachmentIdsSchema
  })
  .strict();
export type AstroDiaryItemEditRequest = z.infer<typeof astroDiaryItemEditRequestSchema>;

export const astroDiaryItemMutationRequestSchema = z
  .object({
    expectedJournalVersion: positiveVersionSchema,
    expectedItemRevision: positiveVersionSchema
  })
  .strict();
export type AstroDiaryItemMutationRequest = z.infer<typeof astroDiaryItemMutationRequestSchema>;

export const astroDiaryDraftDeleteRequestSchema = z
  .object({
    expectedJournalVersion: positiveVersionSchema,
    expectedDraftVersion: positiveVersionSchema
  })
  .strict();
export type AstroDiaryDraftDeleteRequest = z.infer<typeof astroDiaryDraftDeleteRequestSchema>;

export const astroDiaryItemErasureRequestSchema = z
  .object({
    expectedJournalVersion: positiveVersionSchema,
    expectedItemRevision: positiveVersionSchema,
    confirmation: z.literal("erase_item")
  })
  .strict();
export type AstroDiaryItemErasureRequest = z.infer<typeof astroDiaryItemErasureRequestSchema>;

export const astroDiaryJournalErasureRequestSchema = z
  .object({
    expectedJournalVersion: positiveVersionSchema,
    confirmation: z.literal("erase_entire_journal")
  })
  .strict();
export type AstroDiaryJournalErasureRequest = z.infer<typeof astroDiaryJournalErasureRequestSchema>;

const atomicReplyCommonShape = {
  expectedJournalVersion: positiveVersionSchema,
  cycleId: uuidSchema,
  expectedCycleVersion: positiveVersionSchema,
  obligationId: uuidSchema,
  expectedObligationVersion: positiveVersionSchema,
  replyDraftId: uuidSchema,
  expectedReplyDraftVersion: positiveVersionSchema
} as const;

export const astroDiaryAtomicReplyRequestSchema = z.discriminatedUnion("mode", [
  z.object({ ...atomicReplyCommonShape, mode: z.literal("close") }).strict(),
  z
    .object({
      ...atomicReplyCommonShape,
      mode: z.literal("follow_up"),
      promptDraftId: uuidSchema,
      expectedPromptDraftVersion: positiveVersionSchema
    })
    .strict()
]);
export type AstroDiaryAtomicReplyRequest = z.infer<typeof astroDiaryAtomicReplyRequestSchema>;

const completeMoodDistributionSchema = z
  .object({
    inspired: z.number().int().nonnegative(),
    joy: z.number().int().nonnegative(),
    calm: z.number().int().nonnegative(),
    tired: z.number().int().nonnegative(),
    anxious: z.number().int().nonnegative(),
    sad: z.number().int().nonnegative()
  })
  .strict();

export const astroDiaryMoodTrendResponseSchema = z
  .object({
    enoughData: z.boolean(),
    sampleSize: z.number().int().nonnegative(),
    distribution: completeMoodDistributionSchema,
    scoreChange: z.number().int().min(-4).max(4).nullable()
  })
  .strict()
  .superRefine((value, context) => {
    const count = Object.values(value.distribution).reduce((sum, amount) => sum + amount, 0);
    if (count !== value.sampleSize || value.enoughData !== value.sampleSize >= 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sampleSize"],
        message: "Mood trend evidence must match its samples"
      });
    }
  });
export type AstroDiaryMoodTrendResponse = z.infer<typeof astroDiaryMoodTrendResponseSchema>;

export const astroDiaryMoodTrendQuerySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("period"), periodId: uuidSchema }).strict(),
  z
    .object({
      scope: z.literal("range"),
      from: instantSchema,
      to: instantSchema
    })
    .strict()
    .refine(({ from, to }) => Date.parse(from) < Date.parse(to), {
      path: ["to"],
      message: "Mood trend range must be non-empty"
    })
]);
export type AstroDiaryMoodTrendQuery = z.infer<typeof astroDiaryMoodTrendQuerySchema>;

const astroDiaryZodiacSignSchema = z.enum([
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces"
]);
const astroDiaryContextDisplaySchema = z
  .object({
    sourceContextDigest: sha256DigestSchema,
    lunar: z
      .object({
        phaseId: z.enum([
          "new_moon",
          "waxing_crescent",
          "first_quarter",
          "waxing_gibbous",
          "full_moon",
          "waning_gibbous",
          "last_quarter",
          "waning_crescent"
        ]),
        moonSign: astroDiaryZodiacSignSchema
      })
      .strict(),
    relevantTransits: z
      .array(
        z
          .object({
            transitPoint: z.string().trim().min(1).max(80),
            natalPoint: z.string().trim().min(1).max(80).nullable(),
            aspect: z.string().trim().min(1).max(80).nullable(),
            sign: astroDiaryZodiacSignSchema,
            applying: z.boolean().nullable()
          })
          .strict()
      )
      .max(20),
    personal: z
      .object({
        birthProfileRevision: positiveVersionSchema,
        highlights: z
          .array(
            z
              .object({
                transitPoint: z.string().trim().min(1).max(80),
                natalPoint: z.string().trim().min(1).max(80),
                aspect: z.string().trim().min(1).max(80),
                applying: z.boolean().nullable()
              })
              .strict()
          )
          .max(20)
      })
      .strict()
      .nullable()
  })
  .strict();

export const astroDiaryContextResponseSchema = z
  .object({
    context: astroDiaryContextSnapshotSchema.nullable(),
    display: astroDiaryContextDisplaySchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    const calculated =
      value.context?.status === "global_only" || value.context?.status === "personal";
    if (calculated !== (value.display !== undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["display"],
        message: "Visible astrology context is required only for calculated snapshots"
      });
      return;
    }
    if (
      value.context &&
      value.display &&
      (value.display.sourceContextDigest !== value.context.contextDigest ||
        (value.context.status === "personal") !== (value.display.personal !== null) ||
        (value.context.status === "personal" &&
          value.display.personal?.birthProfileRevision !== value.context.birthProfileRevision))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["display"],
        message: "Visible astrology context must bind the immutable calculated snapshot"
      });
    }
  });
export type AstroDiaryContextResponse = z.infer<typeof astroDiaryContextResponseSchema>;

export const astroDiaryMarkReadRequestSchema = z
  .object({
    expectedJournalVersion: positiveVersionSchema,
    expectedCursorVersion: positiveVersionSchema.nullable()
  })
  .strict();
export type AstroDiaryMarkReadRequest = z.infer<typeof astroDiaryMarkReadRequestSchema>;

export const astroDiaryRealtimeEventTypeSchema = z.enum([
  "journal.updated",
  "cycle.updated",
  "timeline.item.published",
  "timeline.item.updated",
  "timeline.item.erased",
  "obligation.updated",
  "context.updated",
  "ai.updated",
  "allowance.updated",
  "export.updated",
  "erasure.updated"
]);
export type AstroDiaryRealtimeEventType = z.infer<typeof astroDiaryRealtimeEventTypeSchema>;

export const astroDiaryLastEventIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .max(19)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n, "Event cursor is out of range");
export type AstroDiaryLastEventId = z.infer<typeof astroDiaryLastEventIdSchema>;

const realtimeEnvelope = <Type extends AstroDiaryRealtimeEventType, Data extends z.ZodType>(
  type: Type,
  data: Data
) =>
  z
    .object({
      eventId: astroDiaryLastEventIdSchema,
      type: z.literal(type),
      occurredAt: instantSchema,
      data
    })
    .strict();
const realtimeJournalDataSchema = z.object({ journalId: uuidSchema }).strict();
const realtimeCycleDataSchema = realtimeJournalDataSchema.extend({ cycleId: uuidSchema }).strict();
const realtimeItemDataSchema = realtimeCycleDataSchema.extend({ itemId: uuidSchema }).strict();

export const astroDiaryRealtimeEventSchema = z.discriminatedUnion("type", [
  realtimeEnvelope("journal.updated", realtimeJournalDataSchema),
  realtimeEnvelope("cycle.updated", realtimeCycleDataSchema),
  realtimeEnvelope("timeline.item.published", realtimeItemDataSchema),
  realtimeEnvelope("timeline.item.updated", realtimeItemDataSchema),
  realtimeEnvelope("timeline.item.erased", realtimeItemDataSchema),
  realtimeEnvelope(
    "obligation.updated",
    realtimeCycleDataSchema.extend({ obligationId: uuidSchema }).strict()
  ),
  realtimeEnvelope(
    "context.updated",
    realtimeItemDataSchema.extend({ contextId: uuidSchema }).strict()
  ),
  realtimeEnvelope(
    "ai.updated",
    realtimeCycleDataSchema.extend({ commandId: uuidSchema }).strict()
  ),
  realtimeEnvelope("allowance.updated", realtimeJournalDataSchema),
  realtimeEnvelope(
    "export.updated",
    realtimeJournalDataSchema.extend({ commandId: uuidSchema }).strict()
  ),
  realtimeEnvelope(
    "erasure.updated",
    realtimeJournalDataSchema.extend({ commandId: uuidSchema }).strict()
  )
]);
export type AstroDiaryRealtimeEvent = z.infer<typeof astroDiaryRealtimeEventSchema>;

export const astroDiaryExportRequestSchema = z
  .object({
    expectedJournalVersion: positiveVersionSchema,
    locale: z.enum(["ru", "en"])
  })
  .strict();
export type AstroDiaryExportRequest = z.infer<typeof astroDiaryExportRequestSchema>;

const astroDiaryExportCommandSchema = z
  .object({
    id: uuidSchema,
    journalId: uuidSchema,
    sourceJournalVersion: positiveVersionSchema,
    sourceDigest: sha256DigestSchema,
    locale: z.enum(["ru", "en"]),
    status: z.enum(["queued", "processing", "ready", "failed", "invalidated"]),
    artifactMediaId: uuidSchema.nullable(),
    failureCode: z.string().trim().min(1).max(160).nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema
  })
  .strict()
  .superRefine((value, context) => {
    const ready = value.status === "ready";
    const failed = value.status === "failed";
    if (ready !== (value.artifactMediaId !== null) || failed !== (value.failureCode !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Export terminal evidence must match its status"
      });
    }
    if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["updatedAt"],
        message: "Export command cannot update before creation"
      });
    }
  });

export const astroDiaryExportResponseSchema = z
  .object({ command: astroDiaryExportCommandSchema })
  .strict();
export type AstroDiaryExportResponse = z.infer<typeof astroDiaryExportResponseSchema>;

export const astroDiaryExportDownloadResponseSchema = z
  .object({
    url: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === "https:", "HTTPS required"),
    expiresAt: instantSchema
  })
  .strict();
export type AstroDiaryExportDownloadResponse = z.infer<
  typeof astroDiaryExportDownloadResponseSchema
>;
