import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type {
  AstrologerTariffCatalogResponse,
  StartAstrologerTariffSubscriptionResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { TariffSettingsPanel } from "./TariffSettingsPanel";

describe("TariffSettingsPanel", () => {
  it("renders a real tariff selection and tells the astrologer that saved-card setup is pending", () => {
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
    expect(text).toContain("Комиссия ElevenHouse 4%");
    expect(text).toContain("Тариф выбран. Для завершения потребуется защищённая привязка карты.");
    expect(text).not.toContain("Скачать чек");
    expect(findFirstElementByType(view, "a")).toBeNull();

    const selectButton = findRequiredElementByText(view, "Выбрать тариф");
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
    expect(text).toContain("Ожидается защищённая привязка карты");
    expect(text).toContain("Текущий выбор");
    expect(text).not.toContain("Смена тарифа");
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
  currentSubscription: null
} satisfies AstrologerTariffCatalogResponse;

const selectionResult = {
  subscription: {
    subscriptionId: "11111111-1111-4111-8111-111111111111",
    tariffSeriesId: "pro",
    tariffVersion: 1,
    state: "incomplete_setup",
    commissionBpsSnapshot: 400,
    startsAt: null,
    endsAt: null
  },
  billingCycle: "month",
  nextAction: "saved_card_setup_required"
} satisfies StartAstrologerTariffSubscriptionResponse;
