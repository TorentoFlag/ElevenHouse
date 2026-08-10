import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type {
  AstrologerTariffCatalogResponse,
  StartAstrologerTariffSubscriptionResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { TariffSettingsPanel } from "./TariffSettingsPanel";

describe("TariffSettingsPanel", () => {
  it("renders a real tariff selection without duplicating the active card-setup flow as a status banner", () => {
    const selectTariff = vi.fn();
    const view = TariffSettingsPanel({
      catalog,
      billingCycle: "month",
      selectionResult,
      isLoading: false,
      isError: false,
      isSelecting: false,
      onBillingCycleChange: vi.fn(),
      onSelectTariff: selectTariff
    });

    const text = normalizeText(collectText(view));
    expect(text).toContain("Pro");
    expect(text).toContain("Комиссия 4%");
    expect(text).not.toContain("Тариф выбран. Для завершения потребуется защищённая привязка карты.");
    expect(text).not.toContain("Скачать чек");
    expect(findFirstElementByType(view, "a")).toBeNull();

    const selectButton = findRequiredElementByText(view, "Выбрать");
    (selectButton.props.onClick as () => void)();
    expect(selectTariff).toHaveBeenCalledWith(catalog.tariffs[0], "month");
  });

  it("does not offer a second subscription while an incomplete setup already exists", () => {
    const view = TariffSettingsPanel({
      catalog: {
        ...catalog,
        currentSubscription: selectionResult.subscription
      },
      billingCycle: "month",
      selectionResult: null,
      isLoading: false,
      isError: false,
      isSelecting: false,
      onBillingCycleChange: vi.fn(),
      onSelectTariff: vi.fn()
    });

    const text = collectText(view);
    expect(text).not.toContain("Ожидается защищённая привязка карты");
    expect(text).toContain("Текущий");
    expect(text).not.toContain("Смена тарифа");
  });

  it("renders the active subscription, period discount and captured charges from server data", () => {
    const view = TariffSettingsPanel({
      catalog: {
        ...catalog,
        currentSubscription: {
          subscriptionId: "22222222-2222-4222-8222-222222222222",
          tariffSeriesId: "pro",
          tariffVersion: 1,
          billingCycle: "month",
          state: "active",
          commissionBpsSnapshot: 400,
          startsAt: "2026-08-01T00:00:00.000Z",
          endsAt: "2026-09-01T00:00:00.000Z"
        },
        recentInvoices: [
          {
            invoiceId: "visual-pro-invoice-1",
            subscriptionId: "22222222-2222-4222-8222-222222222222",
            tariffSeriesId: "pro",
            tariffVersion: 1,
            amountMinor: 199_000,
            currency: "RUB",
            state: "captured",
            capturedAt: "2026-08-01T00:00:00.000Z"
          }
        ]
      },
      billingCycle: "month",
      selectionResult: null,
      isLoading: false,
      isError: false,
      isSelecting: false,
      onBillingCycleChange: vi.fn(),
      onSelectTariff: vi.fn()
    });

    const text = normalizeText(collectText(view));
    expect(text).toContain("Текущий тариф");
    expect(text).toContain("Pro");
    expect(text).toContain("Активен");
    expect(text).toContain("Комиссия сервиса 4% · следующее списание 01 сентября 2026");
    expect(text).toContain("Год · −20%");
    expect(text).toContain("Способ оплаты");
    expect(text).toContain("История списаний");
    expect(text).toContain("01 августа 2026");
    expect(text).toContain("Оплачено");
    expect(text).not.toContain("4521");
    expect(text).not.toContain("Скачать чек");
  });

  it("shows an honest empty payment-method state without provider marketing copy", () => {
    const view = TariffSettingsPanel({
      catalog: {
        ...catalog,
        currentSubscription: {
          subscriptionId: "22222222-2222-4222-8222-222222222222",
          tariffSeriesId: "pro",
          tariffVersion: 1,
          billingCycle: "month",
          state: "active",
          commissionBpsSnapshot: 400,
          startsAt: "2026-08-01T00:00:00.000Z",
          endsAt: "2026-09-01T00:00:00.000Z"
        }
      },
      billingCycle: "month",
      selectionResult: null,
      isLoading: false,
      isError: false,
      isSelecting: false,
      onBillingCycleChange: vi.fn(),
      onSelectTariff: vi.fn()
    });

    const text = normalizeText(collectText(view));
    expect(text).toContain("Нет привязанных способов оплаты");
    expect(text).not.toContain("ArcPay");
    expect(text).not.toContain("Защищённая оплата");
  });

  it("renders the provider-confirmed masked card without exposing card data", () => {
    const view = TariffSettingsPanel({
      catalog: {
        ...catalog,
        paymentMethod: { brand: "visa", last4: "4521", expiryMonth: 9, expiryYear: 2027 }
      } as AstrologerTariffCatalogResponse,
      billingCycle: "month",
      selectionResult: null,
      isLoading: false,
      isError: false,
      isSelecting: false,
      onBillingCycleChange: vi.fn(),
      onSelectTariff: vi.fn()
    });

    const text = normalizeText(collectText(view));
    expect(text).toContain("Карта ···· 4521");
    expect(text).toContain("до 09/27");
    expect(text).not.toContain("ArcPay");
  });
});

function findRequiredElementByText(
  node: ReactNode,
  text: string
): ReactElement<Record<string, unknown>> {
  const element = findFirstElementByText(node, text);
  if (!element) throw new Error(`Expected element with text ${text}`);
  return element;
}

function findFirstElementByText(
  node: ReactNode,
  text: string
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const element = findFirstElementByText(child, text);
      if (element) return element;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (collectText(element) === text) return element;
  let result: ReactElement<Record<string, unknown>> | null = null;
  Children.forEach(element.props.children, (child) => {
    if (!result) result = findFirstElementByText(child as ReactNode, text);
  });
  return result;
}

function findFirstElementByType(
  node: ReactNode,
  type: string
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const element = findFirstElementByType(child, type);
      if (element) return element;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === type) return element;
  let result: ReactElement<Record<string, unknown>> | null = null;
  Children.forEach(element.props.children, (child) => {
    if (!result) result = findFirstElementByType(child as ReactNode, type);
  });
  return result;
}

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (!isValidElement(node)) return "";
  return collectText((node as ReactElement<Record<string, unknown>>).props.children as ReactNode);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const catalog = {
  tariffs: [
    {
      tariffSeriesId: "pro",
      version: 1,
      name: "Pro",
      tagline: "Для активной практики",
      monthlyPriceMinor: 199_000,
      yearlyPriceMinor: 1_910_400,
      monthlyRecurringFrequencyDays: 31,
      yearlyRecurringFrequencyDays: 365,
      clientSaleCommissionBps: 400,
      seatsLimit: 1,
      bookingsLimit: null,
      aiRequestsLimit: null,
      automationLimit: null,
      isPopular: true,
      displayOrder: 1,
      features: ["products", "analytics"],
      lifecycle: "published"
    }
  ],
  currentSubscription: null,
  recentInvoices: [],
  paymentMethod: null
} satisfies AstrologerTariffCatalogResponse;

const selectionResult = {
  subscription: {
    subscriptionId: "11111111-1111-4111-8111-111111111111",
    tariffSeriesId: "pro",
    tariffVersion: 1,
    billingCycle: "month",
    state: "incomplete_setup",
    commissionBpsSnapshot: 400,
    startsAt: null,
    endsAt: null
  },
  billingCycle: "month",
  nextAction: "saved_card_setup_required"
} satisfies StartAstrologerTariffSubscriptionResponse;
