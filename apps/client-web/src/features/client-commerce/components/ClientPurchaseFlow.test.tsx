// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { ClientPurchaseOption, OrderResponse } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { clientCopyByLocale } from "../../../common/i18n/clientCopy";
import { ClientPurchaseFlow } from "./ClientPurchaseFlow";

const api = vi.hoisted(() => ({
  createClientOrder: vi.fn(),
  createClientPaidBookingHold: vi.fn(),
  getClientAvailableSlots: vi.fn(),
  getClientCheckoutPreparationState: vi.fn(),
  getClientOrder: vi.fn(),
  getClientPurchaseOptions: vi.fn(),
  prepareClientCheckout: vi.fn()
}));
vi.mock("../api/clientCommerceApi", () => api);

afterEach(cleanup);

describe("ClientPurchaseFlow checkout errors", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/me");
    vi.restoreAllMocks();
  });

  it("shows provider-unavailable copy instead of a verified-contact error", async () => {
    api.getClientPurchaseOptions.mockResolvedValueOnce({ products: [astroDiaryProduct] });
    api.createClientOrder.mockResolvedValueOnce(order);
    api.prepareClientCheckout.mockRejectedValueOnce(
      new HttpError(503, { code: "payment_checkout_unavailable" })
    );

    renderFlow();

    fireEvent.click(await screen.findByRole("button", { name: /Астродневник/ }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "client@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Оплатить 10,00 ₽" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Оплата временно недоступна на стороне платёжного сервиса"
    );
    expect(screen.queryByText(/Проверьте подтверждённый email/)).not.toBeInTheDocument();
  });

  it("keeps verified-contact copy for buyer contact failures", async () => {
    api.getClientPurchaseOptions.mockResolvedValueOnce({ products: [astroDiaryProduct] });
    api.createClientOrder.mockResolvedValueOnce(order);
    api.prepareClientCheckout.mockRejectedValueOnce(
      new HttpError(422, { code: "payment_checkout_buyer_contact_unverified" })
    );

    renderFlow();

    fireEvent.click(await screen.findByRole("button", { name: /Астродневник/ }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "client@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Оплатить 10,00 ₽" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Проверьте подтверждённый email");
  });

  it("does not reuse checkout idempotency keys across product revision changes", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "11111111-1111-4111-8111-111111111111"
    );
    window.sessionStorage.setItem(
      `elevenhouse.client-checkout.keys.${encodeURIComponent(
        [astrologerId, productId, "chat", ""].join("|")
      )}`,
      JSON.stringify({
        booking: "client-checkout:booking:stale",
        order: "client-checkout:order:stale",
        checkout: "client-checkout:checkout:stale"
      })
    );
    api.getClientPurchaseOptions.mockResolvedValueOnce({
      products: [{ ...astroDiaryProduct, revision: astroDiaryProduct.revision + 1 }]
    });
    api.createClientOrder.mockResolvedValueOnce(order);
    api.prepareClientCheckout.mockRejectedValueOnce(
      new HttpError(503, { code: "payment_checkout_unavailable" })
    );

    renderFlow();

    fireEvent.click(await screen.findByRole("button", { name: /Астродневник/ }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "client@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Оплатить 10,00 ₽" }));

    await screen.findByRole("alert");
    expect(api.createClientOrder).toHaveBeenCalledWith(
      expect.objectContaining({ expectedProductRevision: astroDiaryProduct.revision + 1 }),
      "client-checkout:order:11111111-1111-4111-8111-111111111111"
    );
  });
});

function renderFlow() {
  return render(
    <ClientPurchaseFlow
      astrologers={[
        {
          astrologerUserId: astrologerId,
          publicName: "Ксения",
          publicHandle: "test",
          relationshipStatus: "active",
          firstLinkedAt: "2026-08-01T00:00:00.000Z",
          lastLinkedAt: "2026-08-18T00:00:00.000Z"
        }
      ]}
      copy={clientCopyByLocale.ru.purchaseFlow}
      locale="ru"
    />
  );
}

const astrologerId = "a9088cf2-8c4d-439a-8c79-cb6e336824c7";
const productId = "2f714088-a9e5-4326-99f8-10624d00d176";
const orderId = "43a1cbed-cc07-4f0c-b5c6-18c8eefe3220";

const astroDiaryProduct = {
  id: productId,
  title: "Астродневник",
  subtitle: "Личное сопровождение и вопросы для рефлексии",
  type: "async",
  executionMode: "async",
  paymentModel: "once",
  priceMinor: 1000,
  currency: "RUB",
  durationMinutes: null,
  durationLabel: null,
  slaLabel: "После оплаты астролог начнёт работу по услуге.",
  deliveryFormats: ["chat"],
  includedItems: [],
  revision: 2
} satisfies ClientPurchaseOption;

const order = {
  id: orderId,
  clientUserId: "7732266f-f1df-43fd-ac83-a91b36a10dd9",
  astrologerUserId: astrologerId,
  productId,
  productTitleSnapshot: "Астродневник",
  directLinkIntentId: null,
  bookingId: null,
  status: "pending_payment",
  grossAmount: { amountMinor: 1000, currency: "RUB" },
  platformFee: { amountMinor: 0, currency: "RUB" },
  astrologerNetAmount: { amountMinor: 1000, currency: "RUB" },
  financePolicySnapshotId: "53a1cbed-cc07-4f0c-b5c6-18c8eefe3220",
  financePolicyRiskTier: "standard",
  financePolicyHoldDurationHours: 0,
  financePolicyReserveBps: 0,
  financePolicyReserveReleaseDelayDays: 0,
  financePolicyProviderSettlementRequired: false,
  createdAt: "2026-08-19T13:35:29.944Z",
  updatedAt: "2026-08-19T13:35:29.944Z"
} satisfies OrderResponse;
