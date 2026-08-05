import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const positiveRevisionSchema = z.number().int().positive();
const nonNegativeRevisionSchema = z.number().int().min(0);
const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const boundedPathSchema = z.string().trim().min(1).max(500);
const capabilityKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);

export const flowEnrollmentStateValues = ["inactive", "active", "paused"] as const;
export const flowEnrollmentStateSchema = z.enum(flowEnrollmentStateValues);
export type FlowEnrollmentState = z.infer<typeof flowEnrollmentStateSchema>;

export const activateFlowVersionRequestSchema = z
  .object({
    schemaVersion: z.literal("flow-activation-command.v1"),
    versionId: uuidSchema,
    expectedRevision: positiveRevisionSchema,
    expectedEnrollmentRevision: nonNegativeRevisionSchema,
    expectedActiveVersionId: uuidSchema.nullable()
  })
  .strict();
export type ActivateFlowVersionRequest = z.infer<typeof activateFlowVersionRequestSchema>;

export const pauseFlowEnrollmentRequestSchema = z
  .object({
    schemaVersion: z.literal("flow-enrollment-pause-command.v1"),
    expectedEnrollmentRevision: nonNegativeRevisionSchema,
    expectedActiveVersionId: uuidSchema,
    expectedActivationEpochId: uuidSchema
  })
  .strict();
export type PauseFlowEnrollmentRequest = z.infer<typeof pauseFlowEnrollmentRequestSchema>;

export const flowEnrollmentControlSchema = z
  .object({
    schemaVersion: z.literal("flow-enrollment-control.v1"),
    flowId: uuidSchema,
    state: flowEnrollmentStateSchema,
    definitionRevision: positiveRevisionSchema,
    enrollmentRevision: nonNegativeRevisionSchema,
    activeVersionId: uuidSchema.nullable(),
    activeActivationEpochId: uuidSchema.nullable(),
    activeSince: instantSchema.nullable(),
    lastPausedAt: instantSchema.nullable()
  })
  .strict()
  .superRefine((control, context) => {
    const activeFieldsPresent =
      control.activeVersionId !== null &&
      control.activeActivationEpochId !== null &&
      control.activeSince !== null;
    const activeFieldsAbsent =
      control.activeVersionId === null &&
      control.activeActivationEpochId === null &&
      control.activeSince === null;

    if (control.state === "active" && !activeFieldsPresent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "Active enrollment must identify one open activation epoch and version"
      });
    }
    if (control.state !== "active" && !activeFieldsAbsent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "Inactive or paused enrollment cannot expose an active activation epoch"
      });
    }
    if (control.state === "inactive" && control.lastPausedAt !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lastPausedAt"],
        message: "Never-activated enrollment cannot have pause history"
      });
    }
    if (control.state === "inactive" && control.enrollmentRevision !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["enrollmentRevision"],
        message: "Never-activated enrollment must start at revision zero"
      });
    }
    if (control.state !== "inactive" && control.enrollmentRevision === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["enrollmentRevision"],
        message: "Active or paused enrollment requires a committed transition"
      });
    }
    if (control.state === "paused" && control.lastPausedAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lastPausedAt"],
        message: "Paused enrollment must expose its last pause instant"
      });
    }
    if (
      control.state === "active" &&
      control.lastPausedAt !== null &&
      control.activeSince !== null &&
      Date.parse(control.lastPausedAt) >= Date.parse(control.activeSince)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lastPausedAt"],
        message: "A reactivated enrollment must start after its previous pause"
      });
    }
  });
export type FlowEnrollmentControl = z.infer<typeof flowEnrollmentControlSchema>;

export const flowActivationEpochCloseReasonValues = ["pause_enrollment", "version_switch"] as const;
export const flowActivationEpochCloseReasonSchema = z.enum(flowActivationEpochCloseReasonValues);
export type FlowActivationEpochCloseReason = z.infer<typeof flowActivationEpochCloseReasonSchema>;

export const flowActivationEpochSchema = z
  .object({
    schemaVersion: z.literal("flow-activation-epoch.v1"),
    id: uuidSchema,
    flowId: uuidSchema,
    flowVersionId: uuidSchema,
    sequence: positiveRevisionSchema,
    effectiveFrom: instantSchema,
    effectiveTo: instantSchema.nullable(),
    manifestDigest: sha256DigestSchema,
    rolloutPolicyRevision: positiveRevisionSchema,
    activatedByActorSubjectId: uuidSchema,
    activateCommandId: uuidSchema,
    closeReason: flowActivationEpochCloseReasonSchema.nullable(),
    closedByActorSubjectId: uuidSchema.nullable(),
    closeCommandId: uuidSchema.nullable()
  })
  .strict()
  .superRefine((epoch, context) => {
    const closeFields = [epoch.closeReason, epoch.closedByActorSubjectId, epoch.closeCommandId];
    const allCloseFieldsAbsent = closeFields.every((value) => value === null);
    const allCloseFieldsPresent = closeFields.every((value) => value !== null);

    if (epoch.effectiveTo === null && !allCloseFieldsAbsent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "An open activation epoch cannot have close provenance"
      });
    }
    if (epoch.effectiveTo !== null && !allCloseFieldsPresent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "A closed activation epoch requires complete close provenance"
      });
    }
    if (epoch.closeCommandId !== null && epoch.closeCommandId === epoch.activateCommandId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closeCommandId"],
        message: "Activation and close provenance must identify different commands"
      });
    }
    if (
      epoch.effectiveTo !== null &&
      Date.parse(epoch.effectiveTo) <= Date.parse(epoch.effectiveFrom)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "Activation epoch intervals must have positive duration"
      });
    }
  });
export type FlowActivationEpoch = z.infer<typeof flowActivationEpochSchema>;

export const flowEnrollmentDetailResponseSchema = z
  .object({
    schemaVersion: z.literal("flow-enrollment-detail.v1"),
    enrollment: flowEnrollmentControlSchema,
    activeActivationEpoch: flowActivationEpochSchema.nullable()
  })
  .strict()
  .superRefine((response, context) => {
    const enrollment = response.enrollment;
    const epoch = response.activeActivationEpoch;
    if (enrollment.state !== "active") {
      if (epoch !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["activeActivationEpoch"],
          message: "Inactive or paused enrollment cannot expose an open activation epoch"
        });
      }
      return;
    }
    if (
      epoch === null ||
      epoch.effectiveTo !== null ||
      epoch.flowId !== enrollment.flowId ||
      epoch.id !== enrollment.activeActivationEpochId ||
      epoch.flowVersionId !== enrollment.activeVersionId ||
      epoch.effectiveFrom !== enrollment.activeSince
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activeActivationEpoch"],
        message: "Active enrollment must expose its exact authoritative open epoch"
      });
    }
  });
export type FlowEnrollmentDetailResponse = z.infer<typeof flowEnrollmentDetailResponseSchema>;

export const flowEnrollmentActivationBlockerCodeValues = [
  "FLOW_DEFINITION_ARCHIVED",
  "FLOW_ACTIVATION_ALREADY_ACTIVE",
  "FLOW_LEGACY_ACTIVE_REQUIRES_PAUSE",
  "FLOW_RUNTIME_ROLLOUT_DISABLED",
  "FLOW_RUNTIME_OWNER_NOT_IN_CANARY",
  "FLOW_RUNTIME_KILL_SWITCH_ENGAGED",
  "FLOW_ACTIVATION_REVIEW_STALE",
  "FLOW_GRAPH_MANIFEST_INVALID",
  "FLOW_VERSION_SCHEMA_UNSUPPORTED",
  "FLOW_TRIGGER_MATCHER_NOT_READY",
  "FLOW_EXECUTION_WORKER_NOT_READY",
  "FLOW_NODE_EXECUTOR_NOT_READY",
  "FLOW_REQUIRED_CAPABILITY_NOT_READY",
  "FLOW_PRODUCT_UNAVAILABLE",
  "FLOW_ENTITLEMENT_UNAVAILABLE",
  "FLOW_AUTOMATION_QUOTA_EXCEEDED",
  "FLOW_AUTOMATION_QUOTA_NOT_READY",
  "FLOW_LOCALE_CONTENT_MISSING"
] as const;
export const flowEnrollmentActivationBlockerCodeSchema = z.enum(
  flowEnrollmentActivationBlockerCodeValues
);
export type FlowEnrollmentActivationBlockerCode = z.infer<
  typeof flowEnrollmentActivationBlockerCodeSchema
>;

export const flowActivationBlockerSchema = z
  .object({
    code: flowEnrollmentActivationBlockerCodeSchema,
    path: boundedPathSchema,
    capabilityKey: capabilityKeySchema.nullable()
  })
  .strict();
export type FlowActivationBlocker = z.infer<typeof flowActivationBlockerSchema>;

export const flowActivationReviewQuerySchema = z
  .object({
    versionId: uuidSchema
  })
  .strict();
export type FlowActivationReviewQuery = z.infer<typeof flowActivationReviewQuerySchema>;
export type FlowActivationReviewQueryInput = z.input<typeof flowActivationReviewQuerySchema>;

export const flowActivationReviewResponseSchema = z
  .object({
    schemaVersion: z.literal("flow-activation-review.v1"),
    flowId: uuidSchema,
    versionId: uuidSchema,
    definitionRevision: positiveRevisionSchema,
    enrollmentRevision: nonNegativeRevisionSchema,
    expectedActiveVersionId: uuidSchema.nullable(),
    runtimeMode: z.enum(["definition_only", "canary", "enabled"]),
    rolloutPolicyRevision: positiveRevisionSchema,
    evaluatedAt: instantSchema,
    decision: z.enum(["ready", "blocked"]),
    blockers: z.array(flowActivationBlockerSchema).max(100)
  })
  .strict()
  .superRefine((review, context) => {
    if (
      review.decision === "ready" &&
      (review.blockers.length > 0 || review.runtimeMode === "definition_only")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decision"],
        message: "Ready activation requires an executable rollout mode and no blockers"
      });
    }
    if (review.decision === "blocked" && review.blockers.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blockers"],
        message: "Blocked activation requires at least one explicit blocker"
      });
    }
  });
export type FlowActivationReviewResponse = z.infer<typeof flowActivationReviewResponseSchema>;

export const activateFlowVersionResponseSchema = z
  .object({
    schemaVersion: z.literal("flow-activation-result.v1"),
    enrollment: flowEnrollmentControlSchema,
    activationEpoch: flowActivationEpochSchema
  })
  .strict()
  .superRefine((response, context) => {
    const epoch = response.activationEpoch;
    const enrollment = response.enrollment;
    if (
      enrollment.state !== "active" ||
      enrollment.flowId !== epoch.flowId ||
      enrollment.activeVersionId !== epoch.flowVersionId ||
      enrollment.activeActivationEpochId !== epoch.id ||
      enrollment.activeSince !== epoch.effectiveFrom ||
      epoch.effectiveTo !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activationEpoch"],
        message: "Activation response must expose the exact open authoritative epoch"
      });
    }
  });
export type ActivateFlowVersionResponse = z.infer<typeof activateFlowVersionResponseSchema>;

export const pauseFlowEnrollmentResponseSchema = z
  .object({
    schemaVersion: z.literal("flow-enrollment-pause-result.v1"),
    enrollment: flowEnrollmentControlSchema,
    closedEpoch: flowActivationEpochSchema
  })
  .strict()
  .superRefine((response, context) => {
    const epoch = response.closedEpoch;
    const enrollment = response.enrollment;
    if (
      enrollment.state !== "paused" ||
      enrollment.flowId !== epoch.flowId ||
      enrollment.lastPausedAt !== epoch.effectiveTo ||
      epoch.effectiveTo === null ||
      epoch.closeReason !== "pause_enrollment"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closedEpoch"],
        message: "Pause response must expose the exact epoch closed by the command"
      });
    }
  });
export type PauseFlowEnrollmentResponse = z.infer<typeof pauseFlowEnrollmentResponseSchema>;

export const flowEnrollmentCommandRejectionSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("FLOW_DEFINITION_NOT_FOUND") }).strict(),
  z.object({ code: z.literal("FLOW_ACTIVATION_VERSION_NOT_FOUND") }).strict(),
  z.object({ code: z.literal("FLOW_IDEMPOTENCY_KEY_INVALID") }).strict(),
  z.object({ code: z.literal("FLOW_IDEMPOTENCY_KEY_REUSED") }).strict(),
  z.object({ code: z.literal("FLOW_IDEMPOTENCY_KEY_EXPIRED") }).strict(),
  z
    .object({
      code: z.literal("FLOW_DEFINITION_REVISION_CONFLICT"),
      expectedRevision: positiveRevisionSchema,
      currentRevision: positiveRevisionSchema
    })
    .strict(),
  z
    .object({
      code: z.literal("FLOW_ENROLLMENT_REVISION_CONFLICT"),
      expectedRevision: nonNegativeRevisionSchema,
      currentRevision: nonNegativeRevisionSchema
    })
    .strict(),
  z
    .object({
      code: z.literal("FLOW_ACTIVE_VERSION_CONFLICT"),
      expectedActiveVersionId: uuidSchema.nullable(),
      currentActiveVersionId: uuidSchema.nullable()
    })
    .strict(),
  z
    .object({
      code: z.literal("FLOW_ACTIVE_EPOCH_CONFLICT"),
      expectedActivationEpochId: uuidSchema,
      currentActivationEpochId: uuidSchema.nullable()
    })
    .strict(),
  z.object({ code: z.literal("FLOW_DEFINITION_ARCHIVED") }).strict(),
  z.object({ code: z.literal("FLOW_LEGACY_ACTIVE_REQUIRES_PAUSE") }).strict(),
  z.object({ code: z.literal("FLOW_ACTIVATION_VERSION_UNSUPPORTED") }).strict(),
  z.object({ code: z.literal("FLOW_ACTIVATION_ALREADY_ACTIVE") }).strict(),
  z.object({ code: z.literal("FLOW_ENROLLMENT_NOT_ACTIVE") }).strict(),
  z
    .object({
      code: z.literal("FLOW_ACTIVATION_BLOCKED"),
      blockers: z.array(flowActivationBlockerSchema).min(1).max(100)
    })
    .strict()
]);
export type FlowEnrollmentCommandRejection = z.infer<typeof flowEnrollmentCommandRejectionSchema>;

export const flowEnrollmentCommandRejectionResponseSchema = z
  .object({
    statusCode: z.union([z.literal(400), z.literal(404), z.literal(409)]),
    body: flowEnrollmentCommandRejectionSchema
  })
  .strict()
  .superRefine((response, context) => {
    const expectedStatus =
      response.body.code === "FLOW_IDEMPOTENCY_KEY_INVALID"
        ? 400
        : response.body.code === "FLOW_DEFINITION_NOT_FOUND" ||
            response.body.code === "FLOW_ACTIVATION_VERSION_NOT_FOUND"
          ? 404
          : 409;
    if (response.statusCode !== expectedStatus) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["statusCode"],
        message: "Flow enrollment rejection code and response status must agree"
      });
    }
  });
export type FlowEnrollmentCommandRejectionResponse = z.infer<
  typeof flowEnrollmentCommandRejectionResponseSchema
>;
