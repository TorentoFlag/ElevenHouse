import { and, count, desc, eq, inArray } from "drizzle-orm";
import type {
  Product,
  ProductAccessGrant,
  ProductCreateInput,
  ProductDeliveryFormat,
  ProductIncludedItem,
  ProductIncludedItemInput,
  ProductMethod,
  ProductModifier,
  ProductModifierInput,
  ProductRequiredClientData,
  ProductListResult,
  ProductStore,
  ProductStoreCreateInput,
  ProductStoreUpdatePatch
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  productAccessGrants,
  productDeliveryFormats,
  productIncludedItems,
  productMethods,
  productModifiers,
  productRequiredClientData,
  products
} from "../../schema";
import { insertReturningOne } from "../../shared";

type ProductRow = typeof products.$inferSelect;
type ProductInsertRow = typeof products.$inferInsert;
type ProductUpdateRow = Partial<ProductInsertRow>;
type ProductIncludedItemRow = typeof productIncludedItems.$inferSelect;
type ProductModifierRow = typeof productModifiers.$inferSelect;
type ProductTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ProductDatabase = ElevenHouseDatabase | ProductTransaction;

export function createDrizzleProductStore(database: ElevenHouseDatabase): ProductStore {
  return {
    listByOwner: async (query) => {
      const where =
        query.status === "all"
          ? eq(products.ownerUserId, query.ownerUserId)
          : and(eq(products.ownerUserId, query.ownerUserId), eq(products.status, query.status));
      const rows = await database
        .select()
        .from(products)
        .where(where)
        .orderBy(desc(products.createdAt))
        .limit(query.limit)
        .offset(query.offset);
      const [totalRow] = await database.select({ value: count() }).from(products).where(where);
      const counts = await countByStatus(database, query.ownerUserId);

      return {
        products: await hydrateProducts(database, rows),
        total: Number(totalRow?.value ?? 0),
        counts
      };
    },
    findByOwnerAndId: async (input) => {
      const [row] = await database
        .select()
        .from(products)
        .where(and(eq(products.ownerUserId, input.ownerUserId), eq(products.id, input.productId)))
        .limit(1);
      if (!row) return null;

      const [product] = await hydrateProducts(database, [row]);
      return product ?? null;
    },
    create: (input) => database.transaction((transaction) => insertProduct(transaction, input)),
    update: (input) =>
      database.transaction(async (transaction) => {
        const [row] = await transaction
          .update(products)
          .set(toProductUpdateRow(input.patch, input.now))
          .where(and(eq(products.ownerUserId, input.ownerUserId), eq(products.id, input.productId)))
          .returning();
        if (!row) return null;

        if (hasChildPatch(input.patch)) {
          await replaceChildren(transaction, row.id, input.patch);
        }

        const [product] = await hydrateProducts(transaction, [row]);
        return product ?? null;
      }),
    duplicate: (input) => database.transaction((transaction) => insertProduct(transaction, input))
  };
}

async function insertProduct(
  database: ProductDatabase,
  input: ProductStoreCreateInput
): Promise<Product> {
  const row = await insertReturningOne(
    () => database.insert(products).values(toProductInsertRow(input)).returning(),
    "products"
  );
  await insertChildren(database, row.id, input);

  const [product] = await hydrateProducts(database, [row]);
  if (!product) {
    throw new Error("Expected inserted product to hydrate");
  }
  return product;
}

async function replaceChildren(
  database: ProductDatabase,
  productId: string,
  patch: ProductStoreUpdatePatch
): Promise<void> {
  if (patch.deliveryFormats !== undefined) {
    await database
      .delete(productDeliveryFormats)
      .where(eq(productDeliveryFormats.productId, productId));
    await insertDeliveryFormats(database, productId, patch.deliveryFormats);
  }
  if (patch.requiredClientData !== undefined) {
    await database
      .delete(productRequiredClientData)
      .where(eq(productRequiredClientData.productId, productId));
    await insertRequiredClientData(database, productId, patch.requiredClientData);
  }
  if (patch.methods !== undefined) {
    await database.delete(productMethods).where(eq(productMethods.productId, productId));
    await insertMethods(database, productId, patch.methods);
  }
  if (patch.accessGrants !== undefined) {
    await database.delete(productAccessGrants).where(eq(productAccessGrants.productId, productId));
    await insertAccessGrants(database, productId, patch.accessGrants);
  }
  if (patch.includedItems !== undefined) {
    await database.delete(productIncludedItems).where(eq(productIncludedItems.productId, productId));
    await insertIncludedItems(database, productId, patch.includedItems);
  }
  if (patch.modifiers !== undefined) {
    await database.delete(productModifiers).where(eq(productModifiers.productId, productId));
    await insertModifiers(database, productId, patch.modifiers);
  }
}

async function insertChildren(
  database: ProductDatabase,
  productId: string,
  input: ProductCreateInput
): Promise<void> {
  await insertDeliveryFormats(database, productId, input.deliveryFormats);
  await insertRequiredClientData(database, productId, input.requiredClientData);
  await insertMethods(database, productId, input.methods);
  await insertAccessGrants(database, productId, input.accessGrants);
  await insertIncludedItems(database, productId, input.includedItems);
  await insertModifiers(database, productId, input.modifiers);
}

async function insertDeliveryFormats(
  database: ProductDatabase,
  productId: string,
  values: readonly ProductDeliveryFormat[]
): Promise<void> {
  if (values.length === 0) return;
  await database.insert(productDeliveryFormats).values(
    values.map((value, index) => ({
      productId,
      value,
      order: index
    }))
  );
}

async function insertRequiredClientData(
  database: ProductDatabase,
  productId: string,
  values: readonly ProductRequiredClientData[]
): Promise<void> {
  if (values.length === 0) return;
  await database.insert(productRequiredClientData).values(
    values.map((value, index) => ({
      productId,
      value,
      order: index
    }))
  );
}

async function insertMethods(
  database: ProductDatabase,
  productId: string,
  values: readonly ProductMethod[]
): Promise<void> {
  if (values.length === 0) return;
  await database.insert(productMethods).values(
    values.map((value, index) => ({
      productId,
      value,
      order: index
    }))
  );
}

async function insertAccessGrants(
  database: ProductDatabase,
  productId: string,
  values: readonly ProductAccessGrant[]
): Promise<void> {
  if (values.length === 0) return;
  await database.insert(productAccessGrants).values(
    values.map((value, index) => ({
      productId,
      value,
      order: index
    }))
  );
}

async function insertIncludedItems(
  database: ProductDatabase,
  productId: string,
  values: readonly ProductIncludedItemInput[]
): Promise<void> {
  if (values.length === 0) return;
  await database.insert(productIncludedItems).values(
    values.map((value) => ({
      productId,
      text: value.text,
      icon: value.icon,
      order: value.order
    }))
  );
}

async function insertModifiers(
  database: ProductDatabase,
  productId: string,
  values: readonly ProductModifierInput[]
): Promise<void> {
  if (values.length === 0) return;
  await database.insert(productModifiers).values(
    values.map((value) => ({
      productId,
      label: value.label,
      priceMinor: value.priceMinor,
      kind: value.kind,
      isEnabled: value.isEnabled,
      createsArtifact: value.createsArtifact,
      order: value.order
    }))
  );
}

async function hydrateProducts(
  database: ProductDatabase,
  rows: readonly ProductRow[]
): Promise<Product[]> {
  const productIds = rows.map((row) => row.id);
  if (productIds.length === 0) return [];

  const deliveryFormatRows = await database
    .select()
    .from(productDeliveryFormats)
    .where(inArray(productDeliveryFormats.productId, productIds))
    .orderBy(productDeliveryFormats.order);
  const requiredClientDataRows = await database
    .select()
    .from(productRequiredClientData)
    .where(inArray(productRequiredClientData.productId, productIds))
    .orderBy(productRequiredClientData.order);
  const methodRows = await database
    .select()
    .from(productMethods)
    .where(inArray(productMethods.productId, productIds))
    .orderBy(productMethods.order);
  const accessGrantRows = await database
    .select()
    .from(productAccessGrants)
    .where(inArray(productAccessGrants.productId, productIds))
    .orderBy(productAccessGrants.order);
  const includedItemRows = await database
    .select()
    .from(productIncludedItems)
    .where(inArray(productIncludedItems.productId, productIds))
    .orderBy(productIncludedItems.order);
  const modifierRows = await database
    .select()
    .from(productModifiers)
    .where(inArray(productModifiers.productId, productIds))
    .orderBy(productModifiers.order);

  const deliveryFormatsByProduct = groupValues(deliveryFormatRows);
  const requiredClientDataByProduct = groupValues(requiredClientDataRows);
  const methodsByProduct = groupValues(methodRows);
  const accessGrantsByProduct = groupValues(accessGrantRows);
  const includedItemsByProduct = groupIncludedItems(includedItemRows);
  const modifiersByProduct = groupModifiers(modifierRows);

  return rows.map((row) => ({
    id: row.id,
    ownerUserId: row.ownerUserId,
    type: row.type as Product["type"],
    status: row.status as Product["status"],
    title: row.title,
    subtitle: row.subtitle,
    priceMinor: row.priceMinor,
    currency: row.currency as Product["currency"],
    coverMediaId: row.coverMediaId,
    introVideoUrl: row.introVideoUrl,
    executionMode: row.executionMode as Product["executionMode"],
    paymentModel: row.paymentModel as Product["paymentModel"],
    durationMinutes: row.durationMinutes,
    durationLabel: row.durationLabel,
    slaLabel: row.slaLabel,
    packageSessionCount: row.packageSessionCount,
    packageDiscountPercent: row.packageDiscountPercent,
    subscriptionPeriod: row.subscriptionPeriod as Product["subscriptionPeriod"],
    trialDays: row.trialDays,
    participantMode: row.participantMode as Product["participantMode"],
    groupSize: row.groupSize,
    deliveryFormats: (deliveryFormatsByProduct.get(row.id) ?? []) as Product["deliveryFormats"],
    requiredClientData: (requiredClientDataByProduct.get(row.id) ??
      []) as Product["requiredClientData"],
    methods: (methodsByProduct.get(row.id) ?? []) as Product["methods"],
    accessGrants: (accessGrantsByProduct.get(row.id) ?? []) as Product["accessGrants"],
    includedItems: includedItemsByProduct.get(row.id) ?? [],
    modifiers: modifiersByProduct.get(row.id) ?? [],
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  }));
}

async function countByStatus(
  database: ProductDatabase,
  ownerUserId: string
): Promise<ProductListResult["counts"]> {
  const rows = await database
    .select({
      status: products.status,
      value: count()
    })
    .from(products)
    .where(eq(products.ownerUserId, ownerUserId))
    .groupBy(products.status);
  const counts = {
    all: 0,
    active: 0,
    draft: 0,
    archived: 0
  };

  for (const row of rows) {
    const value = Number(row.value);
    counts.all += value;
    if (row.status === "active" || row.status === "draft" || row.status === "archived") {
      counts[row.status] = value;
    }
  }

  return counts;
}

function toProductInsertRow(input: ProductStoreCreateInput): ProductInsertRow {
  return {
    ownerUserId: input.ownerUserId,
    type: input.type,
    status: input.status,
    title: input.title,
    subtitle: input.subtitle,
    priceMinor: input.priceMinor,
    currency: input.currency,
    coverMediaId: input.coverMediaId,
    introVideoUrl: input.introVideoUrl,
    executionMode: input.executionMode,
    paymentModel: input.paymentModel,
    durationMinutes: input.durationMinutes,
    durationLabel: input.durationLabel,
    slaLabel: input.slaLabel,
    packageSessionCount: input.packageSessionCount,
    packageDiscountPercent: input.packageDiscountPercent,
    subscriptionPeriod: input.subscriptionPeriod,
    trialDays: input.trialDays,
    participantMode: input.participantMode,
    groupSize: input.groupSize,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now)
  };
}

function toProductUpdateRow(patch: ProductStoreUpdatePatch, now: string): ProductUpdateRow {
  return omitUndefined({
    type: patch.type,
    status: patch.status,
    title: patch.title,
    subtitle: patch.subtitle,
    priceMinor: patch.priceMinor,
    currency: patch.currency,
    coverMediaId: patch.coverMediaId,
    introVideoUrl: patch.introVideoUrl,
    executionMode: patch.executionMode,
    paymentModel: patch.paymentModel,
    durationMinutes: patch.durationMinutes,
    durationLabel: patch.durationLabel,
    slaLabel: patch.slaLabel,
    packageSessionCount: patch.packageSessionCount,
    packageDiscountPercent: patch.packageDiscountPercent,
    subscriptionPeriod: patch.subscriptionPeriod,
    trialDays: patch.trialDays,
    participantMode: patch.participantMode,
    groupSize: patch.groupSize,
    updatedAt: new Date(now)
  });
}

function hasChildPatch(patch: ProductStoreUpdatePatch): boolean {
  return (
    patch.deliveryFormats !== undefined ||
    patch.requiredClientData !== undefined ||
    patch.methods !== undefined ||
    patch.accessGrants !== undefined ||
    patch.includedItems !== undefined ||
    patch.modifiers !== undefined
  );
}

function groupValues<TRow extends { readonly productId: string; readonly value: string }>(
  rows: readonly TRow[]
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const values = grouped.get(row.productId) ?? [];
    values.push(row.value);
    grouped.set(row.productId, values);
  }
  return grouped;
}

function groupIncludedItems(
  rows: readonly ProductIncludedItemRow[]
): Map<string, ProductIncludedItem[]> {
  const grouped = new Map<string, ProductIncludedItem[]>();
  for (const row of rows) {
    const values = grouped.get(row.productId) ?? [];
    values.push({
      id: row.id,
      text: row.text,
      icon: row.icon,
      order: row.order
    });
    grouped.set(row.productId, values);
  }
  return grouped;
}

function groupModifiers(rows: readonly ProductModifierRow[]): Map<string, ProductModifier[]> {
  const grouped = new Map<string, ProductModifier[]>();
  for (const row of rows) {
    const values = grouped.get(row.productId) ?? [];
    values.push({
      id: row.id,
      label: row.label,
      priceMinor: row.priceMinor,
      kind: row.kind as ProductModifier["kind"],
      isEnabled: row.isEnabled,
      createsArtifact: row.createsArtifact,
      order: row.order
    });
    grouped.set(row.productId, values);
  }
  return grouped;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}
