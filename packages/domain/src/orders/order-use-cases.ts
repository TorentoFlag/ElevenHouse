/* eslint-disable no-control-regex -- Domain validation intentionally rejects ASCII control characters. */
import { createHash, randomUUID } from "node:crypto";
import { allocateBps, type Money } from "../money";
import type { FinancePolicyStore } from "../finance-policies";
import {
  resolveActiveTariffCommission,
  resolvePlatformTariffCapability,
  type PlatformTariffEntitlementStore
} from "../platform-billing";
import type { Product, ProductStore } from "../products";
import type { FinanceOrder, FinanceOrderStore } from "./order-store";

const createOrderScopePrefix = "orders.create";
const createOrderIdempotencyTtlMs = 24 * 60 * 60 * 1000;

export type ClientAstrologerRelationshipReader = {
  readonly hasActiveRelationship: (input: {
    readonly clientUserId: string;
    readonly astrologerUserId: string;
  }) => Promise<boolean>;
};

export type CreateOrderUseCaseInput = {
  readonly orderStore: Pick<FinanceOrderStore, "executeCreateOrder">;
  readonly relationshipReader: ClientAstrologerRelationshipReader;
  readonly productStore: Pick<ProductStore, "findByOwnerAndId">;
  readonly financePolicyStore: Pick<FinancePolicyStore, "findEffectivePolicyForAstrologer">;
  readonly tariffAuthorityStore: PlatformTariffEntitlementStore;
  readonly clientUserId: string;
  readonly request: CreateOrderRequestInput;
  readonly idempotencyKey: string;
  readonly now: Date;
  readonly idGenerator?: () => string;
};

export type CreateOrderRequestInput = {
  readonly astrologerUserId: string;
  readonly productId: string;
  readonly expectedProductRevision: number;
  readonly directLinkIntentId: string | null;
  readonly bookingId?: string | null;
  readonly clientBirthDataId?: string | null;
};

export class OrderClientRelationshipRequiredError extends Error {
  readonly code = "order_client_relationship_required";

  constructor() {
    super("Client does not have an active relationship with this astrologer");
    this.name = "OrderClientRelationshipRequiredError";
  }
}

export class OrderProductNotAvailableError extends Error {
  readonly code = "order_product_not_available";

  constructor() {
    super("Product is not available for order creation");
    this.name = "OrderProductNotAvailableError";
  }
}

export class OrderProductRevisionConflictError extends Error {
  readonly code = "order_product_revision_conflict" as const;

  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number
  ) {
    super("Product revision changed before order creation");
    this.name = "OrderProductRevisionConflictError";
  }
}

export class OrderPurchaseAuthorityChangedError extends Error {
  readonly code = "order_purchase_authority_changed" as const;

  constructor() {
    super("Product or relationship authority changed before order creation");
    this.name = "OrderPurchaseAuthorityChangedError";
  }
}

export class OrderFinancePolicyUnavailableError extends Error {
  readonly code = "order_finance_policy_unavailable";

  constructor() {
    super("Effective finance policy is not available for this astrologer");
    this.name = "OrderFinancePolicyUnavailableError";
  }
}

export class OrderTariffCommissionUnavailableError extends Error {
  readonly code = "order_tariff_commission_unavailable";

  constructor() {
    super("Astrologer does not have an active tariff commission authority");
    this.name = "OrderTariffCommissionUnavailableError";
  }
}

export class OrderProductFiscalLabelInvalidError extends Error {
  readonly code = "order_product_fiscal_label_invalid";

  constructor() {
    super("Product title cannot be represented safely in the fiscal order snapshot");
  }
}

export class OrderBookingHoldNotClaimableError extends Error {
  readonly code = "order_booking_hold_not_claimable";

  constructor() {
    super("Booking hold is not available for order creation");
    this.name = "OrderBookingHoldNotClaimableError";
  }
}

export class OrderBookingHoldRequiredError extends Error {
  readonly code = "order_booking_hold_required";

  constructor() {
    super("A live product requires an active paid booking hold before checkout");
    this.name = "OrderBookingHoldRequiredError";
  }
}

export async function createOrder(input: CreateOrderUseCaseInput): Promise<FinanceOrder> {
  const nowIso = input.now.toISOString();
  const expiresAt = new Date(input.now.getTime() + createOrderIdempotencyTtlMs).toISOString();
  const requestHash = hashCreateOrderRequest(input.clientUserId, input.request);

  const result = await input.orderStore.executeCreateOrder(
    {
      scope: `${createOrderScopePrefix}:${input.clientUserId}`,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.clientUserId,
      requestHash,
      now: nowIso,
      expiresAt
    },
    async () => {
      await requireActiveRelationship(input);
      const product = await requireActiveProduct(input);
      if (product.revision !== input.request.expectedProductRevision) {
        throw new OrderProductRevisionConflictError(
          input.request.expectedProductRevision,
          product.revision
        );
      }
      if (product.executionMode === "live" && !input.request.bookingId) {
        throw new OrderBookingHoldRequiredError();
      }
      const entitlement = await resolvePlatformTariffCapability({
        store: input.tariffAuthorityStore,
        ownerUserId: product.ownerUserId,
        capability: "products",
        operation: "mutation",
        now: nowIso
      });
      if (entitlement !== "allow") {
        // The public buyer sees the same unavailable-product result as for a stale or draft product.
        throw new OrderProductNotAvailableError();
      }
      const policy = await input.financePolicyStore.findEffectivePolicyForAstrologer(
        product.ownerUserId
      );
      if (!policy) {
        throw new OrderFinancePolicyUnavailableError();
      }
      const tariffCommission = await resolveActiveTariffCommission({
        ownerUserId: product.ownerUserId,
        now: nowIso,
        store: input.tariffAuthorityStore
      });
      if (!tariffCommission) {
        throw new OrderTariffCommissionUnavailableError();
      }

      const grossAmount = money(product.priceMinor, product.currency);
      const { feeMinor, remainderMinor } = allocateBps({
        amountMinor: grossAmount.amountMinor,
        bps: tariffCommission.commissionBps
      });

      return {
        id: (input.idGenerator ?? randomUUID)(),
        clientUserId: input.clientUserId,
        astrologerUserId: product.ownerUserId,
        productId: input.request.productId,
        productTitleSnapshot: fiscalProductTitle(product.title),
        purchasePurpose: orderPurchasePurpose(product, input.clientUserId),
        directLinkIntentId: input.request.directLinkIntentId,
        bookingId: input.request.bookingId ?? null,
        status: "pending_payment",
        grossAmount,
        platformFee: { amountMinor: feeMinor, currency: grossAmount.currency },
        astrologerNetAmount: { amountMinor: remainderMinor, currency: grossAmount.currency },
        financePolicySnapshotId: policy.policyId,
        financePolicyRiskTier: policy.riskTier,
        financePolicyHoldDurationHours: policy.holdDurationHours,
        financePolicyReserveBps: policy.reserveBps,
        financePolicyReserveReleaseDelayDays: policy.reserveReleaseDelayDays,
        tariffSeriesId: tariffCommission.tariffSeriesId,
        tariffVersion: tariffCommission.tariffVersion,
        tariffVersionDigest: tariffCommission.tariffVersionDigest,
        tariffCommissionBps: tariffCommission.commissionBps,
        financePolicyProviderSettlementRequired: policy.providerSettlementRequired,
        now: nowIso
      };
    }
  );

  return result.value;
}

function orderPurchasePurpose(product: Product, clientUserId: string) {
  if (product.astroDiaryConfig === null) {
    return {
      kind: "standard" as const,
      expectedProductRevision: product.revision
    };
  }
  if (product.subscriptionPeriod === null) {
    throw new OrderProductNotAvailableError();
  }
  return {
    kind: "astro_diary_paid_period" as const,
    expectedProductRevision: product.revision,
    acceptedProduct: {
      productId: product.id,
      revision: product.revision,
      ownerUserId: product.ownerUserId,
      status: product.status,
      type: product.type,
      paymentModel: product.paymentModel,
      executionMode: product.executionMode,
      participantMode: product.participantMode,
      priceMinor: product.priceMinor,
      currency: product.currency,
      cadence: product.subscriptionPeriod,
      trialDays: product.trialDays,
      groupSize: product.groupSize,
      packageSessionCount: product.packageSessionCount,
      accessGrants: product.accessGrants,
      deliveryFormats: product.deliveryFormats,
      requiredClientData: product.requiredClientData,
      methods: product.methods,
      modifiers: product.modifiers,
      astroDiaryConfig: product.astroDiaryConfig
    },
    acceptedRelationship: {
      clientUserId,
      astrologerUserId: product.ownerUserId,
      status: "active" as const
    }
  };
}

async function requireActiveProduct(input: CreateOrderUseCaseInput): Promise<Product> {
  const product = await input.productStore.findByOwnerAndId({
    ownerUserId: input.request.astrologerUserId,
    productId: input.request.productId
  });
  if (
    !product ||
    product.status !== "active" ||
    product.paymentModel === "free" ||
    product.priceMinor <= 0
  ) {
    throw new OrderProductNotAvailableError();
  }
  return product;
}

async function requireActiveRelationship(input: CreateOrderUseCaseInput): Promise<void> {
  const hasRelationship = await input.relationshipReader.hasActiveRelationship({
    clientUserId: input.clientUserId,
    astrologerUserId: input.request.astrologerUserId
  });
  if (!hasRelationship) {
    throw new OrderClientRelationshipRequiredError();
  }
}

function money(amountMinor: number, currency: string): Money {
  if (currency !== "RUB") {
    throw new OrderProductNotAvailableError();
  }
  return { amountMinor, currency };
}

function fiscalProductTitle(value: string): string {
  const title = value.trim();
  if (!title || title.length > 128 || /[\u0000-\u001f\u007f]/.test(title)) {
    throw new OrderProductFiscalLabelInvalidError();
  }
  return title;
}

function hashCreateOrderRequest(
  clientUserId: string,
  request: CreateOrderRequestInput
): `sha256:${string}` {
  const payload = {
    clientUserId,
    astrologerUserId: request.astrologerUserId,
    productId: request.productId,
    expectedProductRevision: request.expectedProductRevision,
    directLinkIntentId: request.directLinkIntentId,
    bookingId: request.bookingId ?? null,
    clientBirthDataId: request.clientBirthDataId ?? null
  };

  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}
