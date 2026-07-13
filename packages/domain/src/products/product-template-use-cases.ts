import { normalizeRequiredString } from "../shared";
import { ProductTemplateNotFoundError, ProductTemplateValidationError } from "./product-errors";
import { createProduct } from "./product-use-cases";
import type { ProductTemplate, ProductTemplateLocale } from "./product-template-types";
import type { ProductTemplateStore } from "./product-template-store";
import type { Product, ProductCreateInput } from "./product-types";
import type { ProductStore } from "./product-store";

export function listProductTemplates(input: {
  readonly store: ProductTemplateStore;
  readonly locale: ProductTemplateLocale;
}): Promise<readonly ProductTemplate[]> {
  return input.store.listActiveByLocale({ locale: input.locale });
}

export async function createProductFromTemplate(input: {
  readonly productStore: ProductStore;
  readonly templateStore: ProductTemplateStore;
  readonly ownerUserId: string;
  readonly templateCode: string;
  readonly locale: ProductTemplateLocale;
  readonly now: Date;
}): Promise<Product> {
  const template = await input.templateStore.findActiveByCodeAndLocale({
    code: normalizeRequiredString(input.templateCode, "Product template code is required"),
    locale: input.locale
  });

  if (!template) {
    throw new ProductTemplateNotFoundError();
  }

  if (template.payload.type !== template.type) {
    throw new ProductTemplateValidationError("Product template payload type mismatch");
  }

  if (template.payload.coverMediaId) {
    throw new ProductTemplateValidationError(
      "Product template payload cannot reference account-owned media"
    );
  }

  return createProduct({
    store: input.productStore,
    input: {
      ...normalizeTemplatePayload(template.payload),
      ownerUserId: normalizeRequiredString(input.ownerUserId, "Product owner user id is required")
    },
    now: input.now
  });
}

function normalizeTemplatePayload(
  payload: ProductTemplate["payload"]
): Omit<ProductCreateInput, "ownerUserId"> {
  return {
    type: payload.type,
    title: payload.title,
    subtitle: payload.subtitle ?? null,
    priceMinor: payload.priceMinor,
    currency: payload.currency,
    coverMediaId: null,
    introVideoUrl: payload.introVideoUrl ?? null,
    executionMode: payload.executionMode,
    paymentModel: payload.paymentModel,
    durationMinutes: payload.durationMinutes ?? null,
    durationLabel: payload.durationLabel ?? null,
    slaLabel: payload.slaLabel ?? null,
    packageSessionCount: payload.packageSessionCount ?? null,
    packageDiscountPercent: payload.packageDiscountPercent ?? null,
    subscriptionPeriod: payload.subscriptionPeriod ?? null,
    trialDays: payload.trialDays ?? null,
    participantMode: payload.participantMode,
    groupSize: payload.groupSize ?? null,
    deliveryFormats: payload.deliveryFormats,
    requiredClientData: payload.requiredClientData,
    methods: payload.methods,
    accessGrants: payload.accessGrants,
    includedItems: payload.includedItems,
    modifiers: payload.modifiers
  };
}
