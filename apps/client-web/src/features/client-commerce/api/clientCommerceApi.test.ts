import { afterEach, describe, expect, it, vi } from "vitest";

import { application } from "../../../Application";
import { createClientOrder, getClientPurchaseOptions } from "./clientCommerceApi";

const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const productId = "33333333-3333-4333-8333-333333333333";
const orderId = "44444444-4444-4444-8444-444444444444";
const financePolicySnapshotId = "55555555-5555-4555-8555-555555555555";

describe("clientCommerceApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the fetched product revision and submits it as the required purchase authority", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue({
      astrologerUserId,
      products: [
        {
          id: productId,
          revision: 7,
          title: "Разбор",
          subtitle: null,
          type: "async",
          executionMode: "async",
          paymentModel: "once",
          priceMinor: 4_900,
          currency: "RUB",
          durationMinutes: null,
          durationLabel: null,
          slaLabel: "Ответ в течение двух дней",
          deliveryFormats: ["text"],
          includedItems: []
        }
      ]
    });
    const post = vi.spyOn(application.http, "post").mockResolvedValue(orderResponse());

    const options = await getClientPurchaseOptions(astrologerUserId);
    const selected = options.products[0];
    if (!selected) throw new Error("Expected one purchase option");
    await createClientOrder(
      {
        astrologerUserId,
        productId: selected.id,
        expectedProductRevision: selected.revision,
        directLinkIntentId: null,
        bookingId: null,
        clientBirthDataId: null
      },
      "order-key"
    );

    expect(get).toHaveBeenCalledWith(`/me/astrologers/${astrologerUserId}/purchase-options`);
    expect(post).toHaveBeenCalledWith(
      "/orders",
      expect.objectContaining({ productId, expectedProductRevision: 7 }),
      { csrf: true, idempotencyKey: "order-key" }
    );
  });
});

function orderResponse() {
  return {
    id: orderId,
    clientUserId,
    astrologerUserId,
    productId,
    productTitleSnapshot: "Разбор",
    directLinkIntentId: null,
    bookingId: null,
    status: "pending_payment",
    grossAmount: { amountMinor: 4_900, currency: "RUB" },
    platformFee: { amountMinor: 490, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 4_410, currency: "RUB" },
    financePolicySnapshotId,
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    financePolicyProviderSettlementRequired: true,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z"
  };
}
