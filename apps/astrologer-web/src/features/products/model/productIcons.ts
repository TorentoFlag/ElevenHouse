import type {
  ProductAccessGrant,
  ProductDeliveryFormat,
  ProductMethod,
  ProductType
} from "@elevenhouse/contracts";
import {
  productAccessGrantOptions,
  productDeliveryFormatOptions,
  productIconNames,
  productMethodOptions,
  type ProductIconName
} from "./productConstructorOptions";
import type { ProductFormDraft } from "./productDraft";

const productTypeIconByType = {
  single: "video",
  pack: "box",
  async: "refresh",
  sub: "flow",
  mini: "chat",
  course: "content",
  custom: "sparkle"
} satisfies Record<ProductType, ProductIconName>;

const productMethodPreviewIconByMethod = Object.fromEntries(
  productMethodOptions.map((option) => [option.value, resolveProductIconName(option.iconName)])
) as Record<ProductMethod, ProductIconName>;

export function resolveProductIconName(icon: string): ProductIconName {
  return productIconNames.includes(icon as ProductIconName) ? (icon as ProductIconName) : "check";
}

export function getProductTypeIconName(type: ProductType): ProductIconName {
  return productTypeIconByType[type];
}

export function getProductPreviewIconName(draft: ProductFormDraft): ProductIconName {
  const [primaryMethod] = draft.methods;

  return primaryMethod ? productMethodPreviewIconByMethod[primaryMethod] : getProductTypeIconName(draft.type);
}

export function getDeliveryFormatIconName(deliveryFormat: ProductDeliveryFormat | undefined): ProductIconName {
  const option = productDeliveryFormatOptions.find((item) => item.value === deliveryFormat);

  return resolveProductIconName(option?.iconName ?? "check");
}

export function getAccessGrantIconName(accessGrant: ProductAccessGrant): ProductIconName {
  const option = productAccessGrantOptions.find((item) => item.value === accessGrant);

  return resolveProductIconName(option?.iconName ?? "check");
}

export function getMethodIconName(method: ProductMethod): ProductIconName {
  return productMethodPreviewIconByMethod[method];
}
