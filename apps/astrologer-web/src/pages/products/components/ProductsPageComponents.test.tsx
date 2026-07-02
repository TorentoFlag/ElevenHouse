import { Children, isValidElement, type ReactElement } from "react";
import type { ListProductsResponse, ProductSummaryResponse } from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import { Card } from "@elevenhouse/design-system/components/Card";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import { Wallet } from "@elevenhouse/design-system/icons/Wallet";
import { describe, expect, it, vi } from "vitest";
import { productCopyByLocale } from "../../../features/products/model/productCopy";
import { ProductCard } from "./ProductCard";
import { ProductsResults } from "./ProductsResults";
import { ProductsSummaryStrip } from "./ProductsSummaryStrip";
import { ProductsToolbar } from "./ProductsToolbar";
import styles from "../ProductsPage.module.css";

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  type: "single",
  status: "active",
  title: "Натальный разбор",
  subtitle: null,
  priceMinor: 490000,
  currency: "RUB",
  coverMediaId: null,
  introVideoUrl: null,
  executionMode: "live",
  paymentModel: "once",
  durationMinutes: 60,
  durationLabel: "60 мин",
  slaLabel: null,
  packageSessionCount: null,
  packageDiscountPercent: null,
  subscriptionPeriod: null,
  trialDays: null,
  participantMode: "solo",
  groupSize: null,
  deliveryFormats: ["video"],
  requiredClientData: ["chart1"],
  methods: ["natal"],
  accessGrants: [],
  includedItems: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      text: "Полный разбор карты",
      icon: "check",
      order: 10
    }
  ],
  modifiers: [],
  analytics: {
    salesCount: 47,
    grossRevenueMinor: 23030000,
    currency: "RUB",
    averageRating: 4.9,
    reviewsCount: 12
  },
  createdAt: "2026-07-02T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z"
} satisfies ListProductsResponse["products"][number];

const summary = {
  total: 1,
  active: 1,
  draft: 0,
  archived: 0,
  totalSalesCount: 47,
  grossRevenueMinor: 23030000,
  currency: "RUB",
  bestseller: {
    productId: product.id,
    title: product.title,
    salesCount: 47
  }
} satisfies ProductSummaryResponse;

describe("Products page components", () => {
  it("renders toolbar status filters and create command", () => {
    const onStatusChange = vi.fn();
    const onCreate = vi.fn();
    const toolbar = ProductsToolbar({
      title: "Продукты",
      total: 1,
      statusFilterAriaLabel: "Фильтр статусов продуктов",
      createLabel: "Создать продукт",
      counts: {
        all: 1,
        active: 1,
        draft: 0,
        archived: 0
      },
      selectedStatus: "active",
      statusFilters: productCopyByLocale.ru.statusFilters,
      onStatusChange,
      onCreate
    });

    expect(toolbar.props.className).toBe(styles.toolbar);
    expect(findRequiredElementByType(toolbar, Wallet)).toBeTruthy();
    expect(findElementsByType(toolbar, Chip).map((chip) => chip.props.label)).toEqual([
      "Все",
      "Активные",
      "Черновики",
      "Архив"
    ]);
    expect(getArrayItem(findElementsByType(toolbar, Chip), 1).props.active).toBe(true);
    getArrayItem(findElementsByType(toolbar, Chip), 2).props.onClick();
    expect(onStatusChange).toHaveBeenCalledWith("draft");

    const createButton = findRequiredElementByType(toolbar, Button);
    expect(createButton.props.title).toBe("Создать продукт");
    expect(createButton.props.startIcon.type).toBe(Plus);
    createButton.props.onClick();
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("renders summary metrics from catalog summary", () => {
    const strip = ProductsSummaryStrip({
      copy: {
        activeLabel: "Активных",
        salesLabel: "Продаж всего",
        revenueLabel: "Выручка каталога",
        bestsellerLabel: "Бестселлер",
        emptyBestseller: "—"
      },
      locale: "ru",
      summary
    });

    expect(strip.props.className).toBe(styles.summaryStrip);
    expect(JSON.stringify(strip.props.children)).toContain("Активных");
    expect(JSON.stringify(strip.props.children)).toContain("1 из 1");
    expect(JSON.stringify(strip.props.children)).toContain("230 300 ₽");
    expect(JSON.stringify(strip.props.children)).toContain("Натальный разбор");
  });

  it("renders product cards and state messages", () => {
    const results = ProductsResults({
      products: [product],
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      isLoading: false,
      isError: false,
      loadingLabel: "Загружаем продукты",
      errorLabel: "Не удалось загрузить продукты",
      emptyLabel: "Нет продуктов в этом статусе"
    });

    expect(findElementsByType(results, ProductCard)).toHaveLength(1);

    const loading = ProductsResults({
      products: [],
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      isLoading: true,
      isError: false,
      loadingLabel: "Загружаем продукты",
      errorLabel: "Не удалось загрузить продукты",
      emptyLabel: "Нет продуктов в этом статусе"
    });
    expect(JSON.stringify(loading.props.children)).toContain("Загружаем продукты");

    const empty = ProductsResults({
      products: [],
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      isLoading: false,
      isError: false,
      loadingLabel: "Загружаем продукты",
      errorLabel: "Не удалось загрузить продукты",
      emptyLabel: "Нет продуктов в этом статусе"
    });
    expect(JSON.stringify(empty.props.children)).toContain("Нет продуктов в этом статусе");
  });

  it("renders compact product card content from product response", () => {
    const card = ProductCard({
      product,
      productCopy: productCopyByLocale.ru,
      locale: "ru"
    });

    expect(findRequiredElementByType(card, Card).props.as).toBe("article");
    expect(JSON.stringify(card.props.children)).toContain("Разовая консультация");
    expect(JSON.stringify(card.props.children)).toContain("Натальный разбор");
    expect(JSON.stringify(card.props.children)).toContain("4 900 ₽");
    expect(JSON.stringify(card.props.children)).toContain("Видео · 60 мин");
    expect(JSON.stringify(card.props.children)).toContain("Полный разбор карты");
    expect(JSON.stringify(card.props.children)).toContain("Продаж");
    expect(JSON.stringify(card.props.children)).toContain("4.9");
  });
});

type TestElementProps = {
  active?: boolean;
  as?: string;
  children?: unknown;
  className?: string;
  label?: string;
  onClick: () => void;
  product?: unknown;
  startIcon: { type: unknown };
  title?: string;
};

function findRequiredElementByType(root: unknown, type: unknown) {
  const element = findElementsByType(root, type)[0];
  if (!element) {
    throw new Error("Expected matching React element");
  }

  return element;
}

function findElementsByType(root: unknown, type: unknown): Array<{ props: TestElementProps }> {
  const matches: Array<{ props: TestElementProps }> = [];
  visitElements(root, (element) => {
    if (element.type === type) {
      matches.push(element as { props: TestElementProps });
    }
  });

  return matches;
}

function getArrayItem<T>(items: T[], index: number): T {
  const item = items[index];
  if (!item) {
    throw new Error(`Expected item at index ${index}`);
  }

  return item;
}

function visitElements(root: unknown, visitor: (element: ReactElement<TestElementProps>) => void) {
  if (!isValidElement<TestElementProps>(root)) {
    return;
  }

  visitor(root);

  Children.forEach(root.props.children, (child) => {
    visitElements(child, visitor);
  });
}
