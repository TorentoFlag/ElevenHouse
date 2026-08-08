/* eslint-disable no-control-regex -- Operator reasons intentionally reject ASCII control characters. */
import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const positiveIntegerSchema = z.number().int().positive();
const requirementKeySchema = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);
const reasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Reason must not contain control characters");

const canonicalTextList = <T extends z.ZodType<string>>(item: T, maximum: number) =>
  z.array(item).max(maximum).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "List entries must be unique" });
    }
    if (values.some((value, index) => index > 0 && values[index - 1]! >= value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "List entries must be sorted" });
    }
  });

const canonicalUuidList = canonicalTextList(uuidSchema, 100).superRefine((values, context) => {
  if (new Set(values.map((value) => value.toLowerCase())).size !== values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "UUID entries must be unique" });
  }
});

const killSwitchSchema = z
  .object({
    global: z.boolean(),
    ownerSubjectIds: canonicalUuidList,
    capabilityKeys: canonicalTextList(requirementKeySchema, 256)
  })
  .strict();

const policyCoreSchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-rollout-policy.v2"),
    mode: z.enum(["definition_only", "canary", "enabled"]),
    canaryOwnerSubjectIds: canonicalUuidList,
    allowedRequirementKeys: canonicalTextList(requirementKeySchema, 256),
    killSwitches: z
      .object({
        enrollment: killSwitchSchema,
        claim: killSwitchSchema,
        externalDispatch: killSwitchSchema
      })
      .strict(),
    readinessLeaseTtlMs: z.number().int().min(5_000).max(60_000),
    tokenLeaseDurationMs: z.number().int().min(5_000).max(300_000)
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.mode === "canary" && policy.canaryOwnerSubjectIds.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["canaryOwnerSubjectIds"], message: "Canary mode requires at least one owner" });
    }
    if (policy.mode !== "canary" && policy.canaryOwnerSubjectIds.length !== 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["canaryOwnerSubjectIds"], message: "Only canary mode may contain owners" });
    }
    if (policy.mode !== "definition_only" && policy.allowedRequirementKeys.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedRequirementKeys"], message: "Executable modes require worker requirements" });
    }
  });

export const flowRuntimeRolloutPolicySchema = policyCoreSchema.extend({
  revision: positiveIntegerSchema
}).strict();
export type FlowRuntimeRolloutPolicy = z.infer<typeof flowRuntimeRolloutPolicySchema>;

export const replaceAdminFlowRuntimeControlRequestSchema = z
  .object({
    expectedRevision: positiveIntegerSchema,
    policy: policyCoreSchema,
    reason: reasonSchema
  })
  .strict();
export type ReplaceAdminFlowRuntimeControlRequest = z.infer<
  typeof replaceAdminFlowRuntimeControlRequestSchema
>;

export const adminFlowRuntimeControlResponseSchema = z
  .object({ policy: flowRuntimeRolloutPolicySchema })
  .strict();
export type AdminFlowRuntimeControlResponse = z.infer<typeof adminFlowRuntimeControlResponseSchema>;

export const replaceAdminFlowRuntimeControlResponseSchema = adminFlowRuntimeControlResponseSchema
  .extend({
    command: z
      .object({ kind: z.enum(["created", "replayed"]), completedAt: z.string().datetime({ offset: true }) })
      .strict()
  })
  .strict();
export type ReplaceAdminFlowRuntimeControlResponse = z.infer<
  typeof replaceAdminFlowRuntimeControlResponseSchema>;
