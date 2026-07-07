import type { ProductFormDraft } from "./productDraft";
import { getProductTypeDefinition } from "./productTypeDefinitions";

export function normalizeProductDraftForType(draft: ProductFormDraft): ProductFormDraft {
  const definition = getProductTypeDefinition(draft.type);

  if (definition.mode === "full") {
    return draft;
  }

  const paymentModel = definition.fixedPaymentModel ?? draft.paymentModel;
  const executionMode = definition.fixedExecutionMode ?? draft.executionMode;

  return {
    ...draft,
    paymentModel,
    executionMode,
    priceMinor: paymentModel === "free" ? 0 : draft.priceMinor,
    packageSessionCount: paymentModel === "pack" ? (draft.packageSessionCount ?? 1) : null,
    packageDiscountPercent:
      paymentModel === "pack" ? (draft.packageDiscountPercent ?? 0) : null,
    subscriptionPeriod: paymentModel === "sub" ? (draft.subscriptionPeriod ?? "month") : null,
    trialDays: paymentModel === "sub" ? (draft.trialDays ?? 0) : null,
    groupSize: draft.participantMode === "group" ? (draft.groupSize ?? 2) : null,
    accessGrants:
      draft.type === "course" && !draft.accessGrants.includes("course")
        ? [...draft.accessGrants, "course"]
        : draft.accessGrants
  };
}
