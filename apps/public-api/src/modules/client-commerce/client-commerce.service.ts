import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  getAvailableBookingSlots,
  resolveActiveTariffCommission,
  resolvePlatformTariffCapability,
  type AvailabilityStore,
  type BookingProduct,
  type ClientAstrologerRelationshipReader,
  type FinancePolicyStore,
  type PlatformTariffEntitlementStore,
  type Product,
  type ProductStore
} from "@elevenhouse/domain";
import {
  availableBookingSlotsQuerySchema,
  availableBookingSlotsResponseSchema,
  clientPurchaseAstrologerParamsSchema,
  clientPurchaseOptionsResponseSchema,
  type AvailableBookingSlotsResponse,
  type ClientPurchaseOptionsResponse
} from "@elevenhouse/contracts";
import { SystemClock } from "../../common/system-clock.js";
import {
  CLIENT_COMMERCE_AVAILABILITY_STORE,
  CLIENT_COMMERCE_FINANCE_POLICY_STORE,
  CLIENT_COMMERCE_PRODUCT_STORE,
  CLIENT_COMMERCE_RELATIONSHIP_READER,
  CLIENT_COMMERCE_TARIFF_AUTHORITY_STORE
} from "./client-commerce.tokens";

/**
 * Relationship-scoped buyer read model. The caller already owns the client session;
 * this service never accepts a public handle and never performs a global product lookup.
 */
@Injectable()
export class ClientCommerceService {
  constructor(
    @Inject(CLIENT_COMMERCE_RELATIONSHIP_READER)
    private readonly relationshipReader: ClientAstrologerRelationshipReader,
    @Inject(CLIENT_COMMERCE_PRODUCT_STORE)
    private readonly products: Pick<ProductStore, "listByOwner" | "findByOwnerAndId">,
    @Inject(CLIENT_COMMERCE_TARIFF_AUTHORITY_STORE)
    private readonly tariffAuthority: PlatformTariffEntitlementStore,
    @Inject(CLIENT_COMMERCE_FINANCE_POLICY_STORE)
    private readonly financePolicies: Pick<FinancePolicyStore, "findEffectivePolicyForAstrologer">,
    @Inject(CLIENT_COMMERCE_AVAILABILITY_STORE)
    private readonly availabilityStore: AvailabilityStore,
    @Inject(SystemClock)
    private readonly clock: SystemClock
  ) {}

  async listPurchaseOptions(
    clientUserId: string,
    astrologerUserId: string
  ): Promise<ClientPurchaseOptionsResponse> {
    const params = clientPurchaseAstrologerParamsSchema.parse({ astrologerUserId });
    await this.requireRelationship(clientUserId, params.astrologerUserId);
    const products = await this.findOrderableProducts(params.astrologerUserId);
    return clientPurchaseOptionsResponseSchema.parse({
      astrologerUserId: params.astrologerUserId,
      products: products.map(toPurchaseOption)
    });
  }

  async getAvailableSlots(
    clientUserId: string,
    astrologerUserId: string,
    query: unknown
  ): Promise<AvailableBookingSlotsResponse> {
    const params = clientPurchaseAstrologerParamsSchema.parse({ astrologerUserId });
    const request = availableBookingSlotsQuerySchema.parse(query);
    await this.requireRelationship(clientUserId, params.astrologerUserId);
    const products = await this.findOrderableProducts(params.astrologerUserId);
    const selected = products.find(
      (product) => product.id === request.productId && product.executionMode === "live"
    );
    if (!selected) throw new NotFoundException("Purchase option is not available");

    return availableBookingSlotsResponseSchema.parse(
      await getAvailableBookingSlots({
        availabilityStore: this.availabilityStore,
        productReader: {
          findByOwnerAndId: async ({ ownerUserId, productId }) => {
            if (ownerUserId !== params.astrologerUserId || productId !== selected.id) return null;
            return toBookingProduct(selected);
          }
        },
        ownerUserId: params.astrologerUserId,
        productId: selected.id,
        rangeStartAt: request.start,
        rangeEndAt: request.end,
        now: this.clock.now()
      })
    );
  }

  private async requireRelationship(clientUserId: string, astrologerUserId: string): Promise<void> {
    if (!(await this.relationshipReader.hasActiveRelationship({ clientUserId, astrologerUserId }))) {
      throw new NotFoundException("Astrologer relationship was not found");
    }
  }

  private async findOrderableProducts(ownerUserId: string): Promise<readonly Product[]> {
    const now = this.clock.now().toISOString();
    const [capability, commission, financePolicy, listed] = await Promise.all([
      resolvePlatformTariffCapability({
        store: this.tariffAuthority,
        ownerUserId,
        capability: "products",
        operation: "mutation",
        now
      }),
      resolveActiveTariffCommission({ store: this.tariffAuthority, ownerUserId, now }),
      this.financePolicies.findEffectivePolicyForAstrologer(ownerUserId),
      this.products.listByOwner({ ownerUserId, status: "active", limit: 200, offset: 0 })
    ]);
    if (capability !== "allow" || !commission || !financePolicy) return [];
    return listed.products.filter(
      (product) =>
        product.priceMinor > 0 &&
        (product.paymentModel === "once" || product.paymentModel === "pack") &&
        (product.executionMode !== "live" || product.durationMinutes !== null)
    );
  }
}

function toPurchaseOption(product: Product) {
  return {
    id: product.id,
    title: product.title,
    subtitle: product.subtitle,
    type: product.type,
    executionMode: product.executionMode,
    paymentModel: product.paymentModel,
    priceMinor: product.priceMinor,
    currency: product.currency,
    durationMinutes: product.durationMinutes,
    durationLabel: product.durationLabel,
    slaLabel: product.slaLabel,
    deliveryFormats: product.deliveryFormats,
    includedItems: product.includedItems.map(({ text, icon, order }) => ({ text, icon, order }))
  };
}

function toBookingProduct(product: Product) {
  return {
    id: product.id,
    title: product.title,
    status: product.status,
    executionMode: product.executionMode,
    participantMode: product.participantMode,
    durationMinutes: product.durationMinutes,
    deliveryFormats: product.deliveryFormats,
    requiredClientData: product.requiredClientData,
    methods: product.methods,
    priceMinor: product.priceMinor,
    currency: product.currency
  } satisfies BookingProduct;
}
