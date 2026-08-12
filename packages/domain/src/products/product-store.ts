import type {
  Product,
  ProductCreateInput,
  ProductStatus,
  ProductStatusFilter,
  ProductUpdatePatch
} from "./product-types";

export type ProductListResult = {
  readonly products: readonly Product[];
  readonly total: number;
  readonly counts: {
    readonly all: number;
    readonly active: number;
    readonly draft: number;
    readonly archived: number;
  };
};

export type ProductStoreCreateInput = ProductCreateInput & {
  readonly status: ProductStatus;
  readonly now: string;
};

export type ProductStoreUpdatePatch = ProductUpdatePatch & {
  readonly status?: ProductStatus;
};

export type ProductStoreUpdateOutcome =
  | { readonly outcome: "updated"; readonly product: Product }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "revision_conflict"; readonly currentRevision: number };

export type ProductStoreDuplicateOutcome =
  | { readonly outcome: "duplicated"; readonly product: Product }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "revision_conflict"; readonly currentRevision: number };

export type ProductStore = {
  readonly listByOwner: (query: {
    readonly ownerUserId: string;
    readonly status: ProductStatusFilter;
    readonly limit: number;
    readonly offset: number;
  }) => Promise<ProductListResult>;
  readonly findByOwnerAndId: (input: {
    readonly ownerUserId: string;
    readonly productId: string;
  }) => Promise<Product | null>;
  readonly create: (input: ProductStoreCreateInput) => Promise<Product>;
  readonly update: (input: {
    readonly ownerUserId: string;
    readonly productId: string;
    readonly expectedRevision: number;
    readonly patch: ProductStoreUpdatePatch;
    readonly now: string;
  }) => Promise<ProductStoreUpdateOutcome>;
  readonly duplicate: (
    input: ProductStoreCreateInput & {
      readonly sourceProductId: string;
      readonly expectedSourceRevision: number;
    }
  ) => Promise<ProductStoreDuplicateOutcome>;
};
