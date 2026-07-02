import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  archiveProduct,
  createProduct,
  duplicateProduct,
  getProduct,
  listProducts,
  moveProductToDraft,
  ProductNotFoundError,
  ProductValidationError,
  publishProduct,
  updateProduct,
  type Product,
  type ProductAnalyticsReader,
  type ProductCreateInput,
  type ProductStore,
  type ProductUpdatePatch
} from "@elevenhouse/domain";
import {
  createProductRequestSchema,
  listProductsQuerySchema,
  listProductsResponseSchema,
  productIdParamSchema,
  productResponseSchema,
  productSummaryResponseSchema,
  updateProductRequestSchema,
  type CreateProductRequest,
  type ListProductsResponse,
  type ProductResponse,
  type ProductSummaryResponse,
  type UpdateProductRequest
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PRODUCT_ANALYTICS_READER, PRODUCT_STORE } from "./products.tokens";

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_STORE) private readonly store: ProductStore,
    @Inject(PRODUCT_ANALYTICS_READER) private readonly analyticsReader: ProductAnalyticsReader,
    private readonly clock: SystemClock
  ) {}

  async listProducts(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<ListProductsResponse> {
    const parsedQuery = parseContract(listProductsQuerySchema, query);
    const ownerUserId = requireOwnerUserId(request);
    const result = await listProducts({
      store: this.store,
      ownerUserId,
      status: parsedQuery.status,
      limit: parsedQuery.limit,
      offset: parsedQuery.offset
    });
    const products = await this.mapProducts(ownerUserId, result.products);

    return listProductsResponseSchema.parse({
      products,
      total: result.total,
      counts: result.counts
    });
  }

  async getProduct(
    productId: string,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const ownerUserId = requireOwnerUserId(request);

    return mapProductErrors(async () => {
      const product = await getProduct({
        store: this.store,
        ownerUserId,
        productId: params.productId
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  async getSummary(request: AstrologerSessionRequest): Promise<ProductSummaryResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const result = await listProducts({
      store: this.store,
      ownerUserId,
      status: "all",
      limit: 1,
      offset: 0
    });
    const analytics = await this.analyticsReader.getCatalogLifetimeSummary({ ownerUserId });

    return productSummaryResponseSchema.parse({
      total: result.counts.all,
      active: result.counts.active,
      draft: result.counts.draft,
      archived: result.counts.archived,
      totalSalesCount: analytics.totalSalesCount,
      grossRevenueMinor: analytics.grossRevenueMinor,
      currency: analytics.currency,
      bestseller: analytics.bestseller
    });
  }

  async createProduct(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    const parsedBody = parseContract(createProductRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);
    const product = await createProduct({
      store: this.store,
      input: toCreateInput(parsedBody, ownerUserId),
      now: this.clock.now()
    });
    const [response] = await this.mapProducts(ownerUserId, [product]);

    return productResponseSchema.parse(response);
  }

  async updateProduct(
    productId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const patch = parseContract(updateProductRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapProductErrors(async () => {
      const product = await updateProduct({
        store: this.store,
        ownerUserId,
        productId: params.productId,
        patch: toUpdatePatch(patch),
        now: this.clock.now()
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  publishProduct(productId: string, request: AstrologerSessionRequest): Promise<ProductResponse> {
    return this.transitionProduct(productId, request, publishProduct);
  }

  moveProductToDraft(
    productId: string,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    return this.transitionProduct(productId, request, moveProductToDraft);
  }

  archiveProduct(productId: string, request: AstrologerSessionRequest): Promise<ProductResponse> {
    return this.transitionProduct(productId, request, archiveProduct);
  }

  async duplicateProduct(
    productId: string,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const ownerUserId = requireOwnerUserId(request);

    return mapProductErrors(async () => {
      const product = await duplicateProduct({
        store: this.store,
        ownerUserId,
        productId: params.productId,
        now: this.clock.now()
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  private async transitionProduct(
    productId: string,
    request: AstrologerSessionRequest,
    transition: (input: {
      readonly store: ProductStore;
      readonly ownerUserId: string;
      readonly productId: string;
      readonly now: Date;
    }) => Promise<Product>
  ): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const ownerUserId = requireOwnerUserId(request);

    return mapProductErrors(async () => {
      const product = await transition({
        store: this.store,
        ownerUserId,
        productId: params.productId,
        now: this.clock.now()
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  private async mapProducts(
    ownerUserId: string,
    products: readonly Product[]
  ): Promise<ProductResponse[]> {
    const analytics = await this.analyticsReader.getLifetimeAnalytics({
      ownerUserId,
      productIds: products.map((product) => product.id)
    });

    return products.map((product) => ({
      ...product,
      deliveryFormats: [...product.deliveryFormats],
      requiredClientData: [...product.requiredClientData],
      methods: [...product.methods],
      accessGrants: [...product.accessGrants],
      includedItems: product.includedItems.map((item) => ({ ...item })),
      modifiers: product.modifiers.map((modifier) => ({ ...modifier })),
      analytics: analytics.get(product.id) ?? {
        productId: product.id,
        salesCount: 0,
        grossRevenueMinor: 0,
        currency: "RUB",
        averageRating: null,
        reviewsCount: 0
      }
    }));
  }
}

function toCreateInput(body: CreateProductRequest, ownerUserId: string): ProductCreateInput {
  return {
    ownerUserId,
    type: body.type,
    title: body.title,
    subtitle: body.subtitle ?? null,
    priceMinor: body.priceMinor,
    currency: body.currency,
    coverMediaId: body.coverMediaId ?? null,
    introVideoUrl: body.introVideoUrl ?? null,
    executionMode: body.executionMode,
    paymentModel: body.paymentModel,
    durationMinutes: body.durationMinutes ?? null,
    durationLabel: body.durationLabel ?? null,
    slaLabel: body.slaLabel ?? null,
    packageSessionCount: body.packageSessionCount ?? null,
    packageDiscountPercent: body.packageDiscountPercent ?? null,
    subscriptionPeriod: body.subscriptionPeriod ?? null,
    trialDays: body.trialDays ?? null,
    participantMode: body.participantMode,
    groupSize: body.groupSize ?? null,
    deliveryFormats: body.deliveryFormats,
    requiredClientData: body.requiredClientData,
    methods: body.methods,
    accessGrants: body.accessGrants,
    includedItems: body.includedItems,
    modifiers: body.modifiers
  };
}

function toUpdatePatch(body: UpdateProductRequest): ProductUpdatePatch {
  return omitUndefined({
    type: body.type,
    title: body.title,
    subtitle: body.subtitle,
    priceMinor: body.priceMinor,
    currency: body.currency,
    coverMediaId: body.coverMediaId,
    introVideoUrl: body.introVideoUrl,
    executionMode: body.executionMode,
    paymentModel: body.paymentModel,
    durationMinutes: body.durationMinutes,
    durationLabel: body.durationLabel,
    slaLabel: body.slaLabel,
    packageSessionCount: body.packageSessionCount,
    packageDiscountPercent: body.packageDiscountPercent,
    subscriptionPeriod: body.subscriptionPeriod,
    trialDays: body.trialDays,
    participantMode: body.participantMode,
    groupSize: body.groupSize,
    deliveryFormats: body.deliveryFormats,
    requiredClientData: body.requiredClientData,
    methods: body.methods,
    accessGrants: body.accessGrants,
    includedItems: body.includedItems,
    modifiers: body.modifiers
  });
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }

  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException("Invalid product request");
  }

  return result.data;
}

async function mapProductErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      throw new NotFoundException("Product not found");
    }
    if (error instanceof ProductValidationError) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}
