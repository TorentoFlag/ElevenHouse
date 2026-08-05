import { GUARDS_METADATA } from "@nestjs/common/constants";
import {
  platformCapabilityManifest,
  type PlatformCapabilityOperationSurface
} from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import { FlowActivationReviewController } from "../flows/flow-activation-review.controller";
import { FlowApprovalsController } from "../flows/flow-approvals.controller";
import { FlowEnrollmentController } from "../flows/flow-enrollment.controller";
import { FlowRunsController } from "../flows/flow-runs.controller";
import { FlowWorkItemsController } from "../flows/flow-work-items.controller";
import { FlowTemplatesController, FlowsController } from "../flows/flows.controller";
import { ChartsController } from "../charts/charts.controller";
import { DictionaryAiController } from "../dictionary-ai/dictionary-ai.controller";
import { HumanDesignController } from "../human-design/human-design.controller";
import { MatrixReportController } from "../matrix/matrix-report.controller";
import { NumerologyController } from "../numerology/numerology.controller";
import { ProductsController } from "../products/products.controller";
import { PlatformTariffCapabilityGuard } from "./platform-tariff-capability.guard";
import {
  platformTariffCapabilityMetadataKey,
  type PlatformTariffCapabilityPolicy
} from "./platform-tariff-capability.policy";

type ControllerClass = abstract new (...args: never[]) => object;

const guardedHandlers = [
  [ProductsController, "listProducts", "products.list"],
  [ProductsController, "getSummary", "products.summary"],
  [ProductsController, "listProductTemplates", "products.templates"],
  [ProductsController, "getProduct", "products.read"],
  [ProductsController, "createProductFromTemplate", "products.template-draft.create"],
  [ProductsController, "createProduct", "products.create"],
  [ProductsController, "updateProduct", "products.update"],
  [ProductsController, "publishProduct", "products.publish"],
  [ProductsController, "moveProductToDraft", "products.move-to-draft"],
  [ProductsController, "archiveProduct", "products.archive"],
  [ProductsController, "duplicateProduct", "products.duplicate"],
  [FlowTemplatesController, "listFlowTemplates", "funnels.templates.read"],
  [FlowsController, "listFlows", "funnels.list"],
  [FlowsController, "getFlow", "funnels.read"],
  [FlowsController, "createFlow", "funnels.create"],
  [FlowsController, "validateFlowDefinition", "funnels.validate"],
  [FlowsController, "updateFlowDraft", "funnels.draft.update"],
  [FlowsController, "publishFlow", "funnels.publish"],
  [FlowsController, "createNextFlowDraft", "funnels.next-draft.create"],
  [FlowEnrollmentController, "activateFlowVersion", "funnels.activate"]
] as const satisfies readonly (readonly [ControllerClass, string, string])[];

const historicalAndSafetyHandlers = [
  [FlowEnrollmentController, "getFlowEnrollment"],
  [FlowEnrollmentController, "pauseFlowEnrollment"],
  [FlowActivationReviewController, "review"],
  [FlowsController, "listFlowRuns"],
  [FlowRunsController, "getFlowRun"],
  [FlowRunsController, "cancelFlowRun"],
  [FlowApprovalsController, "listFlowApprovals"],
  [FlowApprovalsController, "decideFlowApproval"],
  [FlowWorkItemsController, "list"],
  [FlowWorkItemsController, "start"],
  [FlowWorkItemsController, "snooze"],
  [FlowWorkItemsController, "complete"]
] as const satisfies readonly (readonly [ControllerClass, string])[];

const aiGenerationHandlers = [
  [ChartsController, "createAiDraft", "ai.chart.draft", ["ai", "natal"]],
  [MatrixReportController, "generateAiDraft", "ai.matrix.draft", ["ai", "matrix"]],
  [NumerologyController, "createAiDraft", "ai.numerology.draft", ["ai", "numerology"]],
  [HumanDesignController, "createAiDraft", "ai.hd.draft", ["ai", "hd"]],
  [DictionaryAiController, "createAiDraft", "ai.refs.draft", ["ai", "refs"]]
] as const satisfies readonly (readonly [
  ControllerClass,
  string,
  string,
  readonly [string, string]
])[];

describe("platform tariff capability policies", () => {
  it("attests every registered direct operation from exact handler metadata", () => {
    const surfaceIds = guardedHandlers.map(([, , surfaceId]) => surfaceId);
    expect(new Set(surfaceIds).size).toBe(surfaceIds.length);

    for (const [controller, methodName, surfaceId] of guardedHandlers) {
      const policy = handlerPolicy(controller, methodName);
      const operation = findManifestOperation(surfaceId);
      const capability = surfaceId.startsWith("products.") ? "products" : "funnels";
      expect(policy).toEqual({ surfaceId, capability, operation: operation.semanticKind });
      expect(operation.requirement).toEqual({ kind: "all_of", capabilities: [capability] });
    }
  });

  it("installs the resolver guard on every controller with direct policies", () => {
    const controllers = new Set(guardedHandlers.map(([controller]) => controller));
    for (const controller of controllers) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as readonly unknown[];
      expect(guards).toContain(PlatformTariffCapabilityGuard);
    }
  });

  it("requires both AI and its resource-owning capability for every provider-backed generation", () => {
    for (const [controller, methodName, surfaceId, capabilities] of aiGenerationHandlers) {
      expect(handlerPolicy(controller, methodName)).toEqual({
        surfaceId,
        capabilities,
        operation: "generation"
      });
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as readonly unknown[];
      expect(guards).toContain(PlatformTariffCapabilityGuard);
    }
  });

  it("does not apply a direct tariff policy to historical reads or safety commands", () => {
    for (const [controller, methodName] of historicalAndSafetyHandlers) {
      expect(handlerPolicy(controller, methodName)).toBeUndefined();
    }
  });
});

function handlerPolicy(
  controller: ControllerClass,
  methodName: string
): PlatformTariffCapabilityPolicy | undefined {
  const handler = (controller.prototype as Record<string, unknown>)[methodName];
  if (typeof handler !== "function") throw new Error(`Unknown controller handler: ${methodName}`);
  return Reflect.getMetadata(platformTariffCapabilityMetadataKey, handler) as
    | PlatformTariffCapabilityPolicy
    | undefined;
}

function findManifestOperation(surfaceId: string): PlatformCapabilityOperationSurface {
  const operation = ["products", "funnels"]
    .flatMap((capability) => {
      const entry = platformCapabilityManifest[capability as "products" | "funnels"];
      return [...entry.readOperations, ...entry.mutationOperations];
    })
    .find((candidate) => candidate.id === surfaceId);
  if (!operation) throw new Error(`Unknown manifest operation: ${surfaceId}`);
  return operation;
}
