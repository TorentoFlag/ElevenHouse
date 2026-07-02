import { normalizeRequiredString } from "../shared";
import { ProductNotFoundError, ProductValidationError } from "./product-errors";
import type { ProductListResult, ProductStore } from "./product-store";
import type {
  Product,
  ProductCreateInput,
  ProductEditableFields,
  ProductIncludedItemInput,
  ProductModifierInput,
  ProductStatusFilter,
  ProductUpdatePatch
} from "./product-types";

export function listProducts(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly status: ProductStatusFilter;
  readonly limit: number;
  readonly offset: number;
}): Promise<ProductListResult> {
  return input.store.listByOwner({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Product owner user id is required"),
    status: input.status,
    limit: input.limit,
    offset: input.offset
  });
}

export async function getProduct(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
}): Promise<Product> {
  const product = await input.store.findByOwnerAndId({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Product owner user id is required"),
    productId: normalizeRequiredString(input.productId, "Product id is required")
  });
  if (!product) {
    throw new ProductNotFoundError();
  }
  return product;
}

export async function createProduct(input: {
  readonly store: ProductStore;
  readonly input: ProductCreateInput;
  readonly now: Date;
}): Promise<Product> {
  validateEditableProduct(input.input);

  return input.store.create({
    ...input.input,
    ownerUserId: normalizeRequiredString(
      input.input.ownerUserId,
      "Product owner user id is required"
    ),
    status: "draft",
    title: normalizeRequiredString(input.input.title, "Product title is required"),
    now: input.now.toISOString()
  });
}

export async function updateProduct(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly patch: ProductUpdatePatch;
  readonly now: Date;
}): Promise<Product> {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Product owner user id is required");
  const productId = normalizeRequiredString(input.productId, "Product id is required");
  const current = await input.store.findByOwnerAndId({
    ownerUserId,
    productId
  });
  if (!current) {
    throw new ProductNotFoundError();
  }
  const patch = normalizeProductPatch(input.patch);
  validateEditableProduct({ ...current, ...patch });

  const product = await input.store.update({
    ownerUserId,
    productId,
    patch,
    now: input.now.toISOString()
  });
  if (!product) {
    throw new ProductNotFoundError();
  }
  return product;
}

export function publishProduct(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly now: Date;
}): Promise<Product> {
  return updateProductStatus({ ...input, status: "active" });
}

export function moveProductToDraft(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly now: Date;
}): Promise<Product> {
  return updateProductStatus({ ...input, status: "draft" });
}

export function archiveProduct(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly now: Date;
}): Promise<Product> {
  return updateProductStatus({ ...input, status: "archived" });
}

export async function duplicateProduct(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly now: Date;
}): Promise<Product> {
  const source = await getProduct(input);
  const duplicate = {
    ownerUserId: source.ownerUserId,
    type: source.type,
    title: `${source.title} (копия)`,
    subtitle: source.subtitle,
    priceMinor: source.priceMinor,
    currency: source.currency,
    coverMediaId: source.coverMediaId,
    introVideoUrl: source.introVideoUrl,
    executionMode: source.executionMode,
    paymentModel: source.paymentModel,
    durationMinutes: source.durationMinutes,
    durationLabel: source.durationLabel,
    slaLabel: source.slaLabel,
    packageSessionCount: source.packageSessionCount,
    packageDiscountPercent: source.packageDiscountPercent,
    subscriptionPeriod: source.subscriptionPeriod,
    trialDays: source.trialDays,
    participantMode: source.participantMode,
    groupSize: source.groupSize,
    deliveryFormats: source.deliveryFormats,
    requiredClientData: source.requiredClientData,
    methods: source.methods,
    accessGrants: source.accessGrants,
    includedItems: stripIncludedItemIds(source.includedItems),
    modifiers: stripModifierIds(source.modifiers)
  };
  validateEditableProduct(duplicate);

  return input.store.duplicate({
    sourceProductId: source.id,
    ...duplicate,
    status: "draft",
    now: input.now.toISOString()
  });
}

async function updateProductStatus(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly status: "active" | "draft" | "archived";
  readonly now: Date;
}): Promise<Product> {
  const product = await input.store.update({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Product owner user id is required"),
    productId: normalizeRequiredString(input.productId, "Product id is required"),
    patch: { status: input.status },
    now: input.now.toISOString()
  });
  if (!product) {
    throw new ProductNotFoundError();
  }
  return product;
}

function normalizeProductPatch(patch: ProductUpdatePatch): ProductUpdatePatch {
  return omitUndefined({
    ...patch,
    title:
      patch.title === undefined
        ? undefined
        : normalizeRequiredString(patch.title, "Product title is required")
  });
}

function validateEditableProduct(product: ProductEditableFields): void {
  if (product.deliveryFormats.length === 0) {
    throw new ProductValidationError("Product requires at least one delivery format");
  }
  assertUnique(product.deliveryFormats, "Product delivery formats must be unique");
  assertUnique(product.requiredClientData, "Product required client data must be unique");
  assertUnique(product.methods, "Product methods must be unique");
  assertUnique(product.accessGrants, "Product access grants must be unique");

  if (product.paymentModel === "pack" && product.packageSessionCount === null) {
    throw new ProductValidationError("Package products require packageSessionCount");
  }
  if (product.paymentModel === "sub" && product.subscriptionPeriod === null) {
    throw new ProductValidationError("Subscription products require subscriptionPeriod");
  }
  if (product.participantMode === "group" && product.groupSize === null) {
    throw new ProductValidationError("Group products require groupSize");
  }
  if (product.paymentModel === "free" && product.priceMinor !== 0) {
    throw new ProductValidationError("Free products must have zero price");
  }
  for (const modifier of product.modifiers) {
    if (modifier.kind === "free" && modifier.priceMinor !== 0) {
      throw new ProductValidationError("Free modifiers must have zero price");
    }
  }
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new ProductValidationError(message);
  }
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}

function stripIncludedItemIds(
  items: readonly { readonly text: string; readonly icon: string; readonly order: number }[]
): ProductIncludedItemInput[] {
  return items.map((item) => ({
    text: item.text,
    icon: item.icon,
    order: item.order
  }));
}

function stripModifierIds(
  modifiers: readonly {
    readonly label: string;
    readonly priceMinor: number;
    readonly kind: ProductModifierInput["kind"];
    readonly isEnabled: boolean;
    readonly createsArtifact: boolean;
    readonly order: number;
  }[]
): ProductModifierInput[] {
  return modifiers.map((modifier) => ({
    label: modifier.label,
    priceMinor: modifier.priceMinor,
    kind: modifier.kind,
    isEnabled: modifier.isEnabled,
    createsArtifact: modifier.createsArtifact,
    order: modifier.order
  }));
}
