import { createHash, randomUUID } from "node:crypto";
import { allocateBps, type Money } from "../money";
import type { FinancePolicyStore } from "../finance-policies";
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
  readonly clientUserId: string;
  readonly request: CreateOrderRequestInput;
  readonly idempotencyKey: string;
  readonly now: Date;
  readonly idGenerator?: () => string;
};

export type CreateOrderRequestInput = {
  readonly astrologerUserId: string;
  readonly productId: string;
  readonly directLinkIntentId: string | null;
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

export class OrderFinancePolicyUnavailableError extends Error {
  readonly code = "order_finance_policy_unavailable";

  constructor() {
    super("Effective finance policy is not available for this astrologer");
    this.name = "OrderFinancePolicyUnavailableError";
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
      const policy = await input.financePolicyStore.findEffectivePolicyForAstrologer(
        input.request.astrologerUserId
      );
      if (!policy) {
        throw new OrderFinancePolicyUnavailableError();
      }

      const grossAmount = money(product.priceMinor, product.currency);
      const { feeMinor, remainderMinor } = allocateBps({
        amountMinor: grossAmount.amountMinor,
        bps: policy.platformFeeBps
      });

      return {
        id: (input.idGenerator ?? randomUUID)(),
        clientUserId: input.clientUserId,
        astrologerUserId: input.request.astrologerUserId,
        productId: input.request.productId,
        directLinkIntentId: input.request.directLinkIntentId,
        status: "pending_payment",
        grossAmount,
        platformFee: { amountMinor: feeMinor, currency: grossAmount.currency },
        astrologerNetAmount: { amountMinor: remainderMinor, currency: grossAmount.currency },
        financePolicySnapshotId: policy.policyId,
        now: nowIso
      };
    }
  );

  return result.value;
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

function hashCreateOrderRequest(
  clientUserId: string,
  request: CreateOrderRequestInput
): `sha256:${string}` {
  const payload = {
    clientUserId,
    astrologerUserId: request.astrologerUserId,
    productId: request.productId,
    directLinkIntentId: request.directLinkIntentId,
    clientBirthDataId: request.clientBirthDataId ?? null
  };

  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}
