import { relations } from "drizzle-orm";
import { users } from "../identity/accounts.schema";
import { productAccessGrants } from "./product-access-grants.schema";
import { productDeliveryFormats } from "./product-delivery-formats.schema";
import { productIncludedItems } from "./product-included-items.schema";
import { productMethods } from "./product-methods.schema";
import { productModifiers } from "./product-modifiers.schema";
import { productRequiredClientData } from "./product-required-client-data.schema";
import { products } from "./products.schema";

export const productsRelations = relations(products, ({ many, one }) => ({
  owner: one(users, {
    fields: [products.ownerUserId],
    references: [users.id]
  }),
  deliveryFormats: many(productDeliveryFormats),
  requiredClientData: many(productRequiredClientData),
  methods: many(productMethods),
  accessGrants: many(productAccessGrants),
  includedItems: many(productIncludedItems),
  modifiers: many(productModifiers)
}));

export const productDeliveryFormatsRelations = relations(productDeliveryFormats, ({ one }) => ({
  product: one(products, {
    fields: [productDeliveryFormats.productId],
    references: [products.id]
  })
}));

export const productRequiredClientDataRelations = relations(
  productRequiredClientData,
  ({ one }) => ({
    product: one(products, {
      fields: [productRequiredClientData.productId],
      references: [products.id]
    })
  })
);

export const productMethodsRelations = relations(productMethods, ({ one }) => ({
  product: one(products, {
    fields: [productMethods.productId],
    references: [products.id]
  })
}));

export const productAccessGrantsRelations = relations(productAccessGrants, ({ one }) => ({
  product: one(products, {
    fields: [productAccessGrants.productId],
    references: [products.id]
  })
}));

export const productIncludedItemsRelations = relations(productIncludedItems, ({ one }) => ({
  product: one(products, {
    fields: [productIncludedItems.productId],
    references: [products.id]
  })
}));

export const productModifiersRelations = relations(productModifiers, ({ one }) => ({
  product: one(products, {
    fields: [productModifiers.productId],
    references: [products.id]
  })
}));
