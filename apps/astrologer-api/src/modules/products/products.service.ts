import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  archiveProduct,
  assertUsableMediaForOwner,
  createProduct,
  createProductFromTemplate,
  duplicateProduct,
  getProduct,
  listProductTemplates,
  listProducts,
  MediaNotFoundError,
  MediaValidationError,
  moveProductToDraft,
  ProductFulfillmentNotReadyError,
  ProductNotFoundError,
  ProductRevisionConflictError,
  ProductTemplateNotFoundError,
  ProductTemplateValidationError,
  ProductValidationError,
  publishProduct,
  updateProduct,
  type Product,
  type ProductAnalyticsReader,
  type ProductCreateInput,
  type MediaAssetStore,
  type ProductStore,
  type ProductTemplate,
  type ProductTemplateStore,
  type ProductUpdatePatch
} from "@elevenhouse/domain";
import {
  createProductFromTemplateParamsSchema,
  createProductFromTemplateRequestSchema,
  createProductRequestSchema,
  duplicateProductRequestSchema,
  listProductTemplatesQuerySchema,
  listProductTemplatesResponseSchema,
  listProductsQuerySchema,
  listProductsResponseSchema,
  productIdParamSchema,
  productResponseSchema,
  productStatusTransitionRequestSchema,
  productSummaryResponseSchema,
  productTemplateResponseSchema,
  updateProductRequestSchema,
  type CreateProductRequest,
  type ListProductTemplatesResponse,
  type ListProductsResponse,
  type MediaAssetResponse,
  type ProductResponse,
  type ProductFulfillmentNotReadyResponse,
  type ProductRevisionConflictResponse,
  type ProductSummaryResponse,
  type ProductTemplateResponse,
  type UpdateProductRequest
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PRODUCT_ANALYTICS_READER, PRODUCT_STORE, PRODUCT_TEMPLATE_STORE } from "./products.tokens";
import { MEDIA_ASSET_STORE, MEDIA_PUBLIC_URL_RESOLVER } from "../media/media.tokens";
import { toMediaAssetResponse, type MediaPublicUrlResolver } from "../media/media-response.mapper";

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_STORE) private readonly store: ProductStore,
    @Inject(PRODUCT_TEMPLATE_STORE) private readonly templateStore: ProductTemplateStore,
    @Inject(PRODUCT_ANALYTICS_READER) private readonly analyticsReader: ProductAnalyticsReader,
    @Inject(MEDIA_ASSET_STORE) private readonly mediaStore: MediaAssetStore,
    @Inject(MEDIA_PUBLIC_URL_RESOLVER) private readonly publicUrlResolver: MediaPublicUrlResolver,
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

  async getProduct(productId: string, request: AstrologerSessionRequest): Promise<ProductResponse> {
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
      analyticsStatus: analytics.analyticsStatus,
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

  async listProductTemplates(query: unknown): Promise<ListProductTemplatesResponse> {
    const parsedQuery = parseContract(listProductTemplatesQuerySchema, query ?? {});
    const templates = await listProductTemplates({
      store: this.templateStore,
      locale: parsedQuery.locale
    });

    return listProductTemplatesResponseSchema.parse({
      templates: templates.map(toProductTemplateResponse)
    });
  }

  async createProduct(body: unknown, request: AstrologerSessionRequest): Promise<ProductResponse> {
    const parsedBody = parseContract(createProductRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);
    await this.assertProductCoverMedia(ownerUserId, parsedBody.coverMediaId);
    const product = await createProduct({
      store: this.store,
      input: toCreateInput(parsedBody, ownerUserId),
      now: this.clock.now()
    });
    const [response] = await this.mapProducts(ownerUserId, [product]);

    return productResponseSchema.parse(response);
  }

  async createProductFromTemplate(
    templateCode: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    const params = parseContract(createProductFromTemplateParamsSchema, { templateCode });
    const parsedBody = parseContract(createProductFromTemplateRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapProductErrors(async () => {
      const product = await createProductFromTemplate({
        productStore: this.store,
        templateStore: this.templateStore,
        ownerUserId,
        templateCode: params.templateCode,
        locale: parsedBody.locale,
        now: this.clock.now()
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  async updateProduct(
    productId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const patch = parseContract(updateProductRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);
    await this.assertProductCoverMedia(ownerUserId, patch.coverMediaId);

    return mapProductErrors(async () => {
      const product = await updateProduct({
        store: this.store,
        ownerUserId,
        productId: params.productId,
        expectedRevision: patch.expectedRevision,
        patch: toUpdatePatch(patch),
        now: this.clock.now()
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  publishProduct(
    productId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    return this.transitionProduct(productId, body, request, publishProduct);
  }

  moveProductToDraft(
    productId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    return this.transitionProduct(productId, body, request, moveProductToDraft);
  }

  archiveProduct(
    productId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    return this.transitionProduct(productId, body, request, archiveProduct);
  }

  async duplicateProduct(
    productId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const parsedBody = parseContract(duplicateProductRequestSchema, body ?? {});
    const ownerUserId = requireOwnerUserId(request);

    return mapProductErrors(async () => {
      const product = await duplicateProduct({
        store: this.store,
        ownerUserId,
        productId: params.productId,
        expectedRevision: parsedBody.expectedRevision,
        title: parsedBody.title,
        now: this.clock.now()
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  private async transitionProduct(
    productId: string,
    body: unknown,
    request: AstrologerSessionRequest,
    transition: (input: {
      readonly store: ProductStore;
      readonly ownerUserId: string;
      readonly productId: string;
      readonly expectedRevision: number;
      readonly now: Date;
    }) => Promise<Product>
  ): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const parsedBody = parseContract(productStatusTransitionRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);

    return mapProductErrors(async () => {
      const product = await transition({
        store: this.store,
        ownerUserId,
        productId: params.productId,
        expectedRevision: parsedBody.expectedRevision,
        now: this.clock.now()
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  private async assertProductCoverMedia(
    ownerUserId: string,
    coverMediaId: string | null | undefined
  ): Promise<void> {
    if (!coverMediaId) return;

    await mapProductErrors(async () => {
      await assertUsableMediaForOwner({
        store: this.mediaStore,
        ownerUserId,
        mediaId: coverMediaId,
        purpose: "product_cover"
      });
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
    const coverMediaById = await this.getCoverMediaById(ownerUserId, products);

    return products.map((product) => ({
      ...product,
      coverMedia: product.coverMediaId ? (coverMediaById.get(product.coverMediaId) ?? null) : null,
      deliveryFormats: [...product.deliveryFormats],
      requiredClientData: [...product.requiredClientData],
      methods: [...product.methods],
      accessGrants: [...product.accessGrants],
      astroDiaryConfig: product.astroDiaryConfig
        ? {
            ...product.astroDiaryConfig,
            workingWeekdays: [...product.astroDiaryConfig.workingWeekdays]
          }
        : null,
      includedItems: product.includedItems.map((item) => ({ ...item })),
      modifiers: product.modifiers.map((modifier) => ({ ...modifier })),
      analytics: analytics.get(product.id) ?? {
        status: "unavailable",
        productId: product.id,
        salesCount: 0,
        grossRevenueMinor: 0,
        currency: "RUB",
        averageRating: null,
        reviewsCount: 0
      }
    }));
  }

  private async getCoverMediaById(
    ownerUserId: string,
    products: readonly Product[]
  ): Promise<Map<string, MediaAssetResponse>> {
    const mediaIds = [
      ...new Set(
        products.map((product) => product.coverMediaId).filter((id): id is string => Boolean(id))
      )
    ];
    const coverMediaById = new Map<string, MediaAssetResponse>();

    await Promise.all(
      mediaIds.map(async (mediaId) => {
        const asset = await this.mediaStore.findByOwnerAndId({ ownerUserId, mediaId });

        if (!asset || asset.purpose !== "product_cover" || asset.status !== "ready") {
          return;
        }

        coverMediaById.set(mediaId, toMediaAssetResponse(asset, this.publicUrlResolver));
      })
    );

    return coverMediaById;
  }
}

function toProductTemplateResponse(template: ProductTemplate): ProductTemplateResponse {
  return productTemplateResponseSchema.parse(template);
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
    astroDiaryConfig: body.astroDiaryConfig ?? null,
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
    astroDiaryConfig: body.astroDiaryConfig,
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
    if (error instanceof ProductRevisionConflictError) {
      throw new ConflictException({
        code: error.code,
        expectedRevision: error.expectedRevision,
        currentRevision: error.currentRevision
      } satisfies ProductRevisionConflictResponse);
    }
    if (error instanceof ProductFulfillmentNotReadyError) {
      throw new ConflictException({
        code: error.code,
        message: error.message
      } satisfies ProductFulfillmentNotReadyResponse);
    }
    if (error instanceof ProductTemplateNotFoundError) {
      throw new NotFoundException("Product template not found");
    }
    if (
      error instanceof ProductValidationError ||
      error instanceof ProductTemplateValidationError ||
      error instanceof MediaValidationError ||
      error instanceof MediaNotFoundError
    ) {
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
