import { Children, isValidElement, type ReactElement } from "react";
import type { ListProductsResponse, ProductSummaryResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { ProductsResults } from "./components/ProductsResults";
import { ProductsSummaryStrip } from "./components/ProductsSummaryStrip";
import { ProductsToolbar } from "./components/ProductsToolbar";
import { ProductsPageView, type ProductsPageViewProps } from "./ProductsPageView";
import styles from "./ProductsPage.module.css";

const copy = {
  documentTitle: "ElevenHouse | Продукты",
  title: "Продукты",
  createLabel: "Создать продукт",
  statusFilterAriaLabel: "Фильтр статусов продуктов",
  createTypeModal: {
    title: "Выберите тип продукта",
    closeLabel: "Закрыть выбор типа",
    description: "Тип задаст базовые параметры, которые можно изменить в редакторе."
  },
  editor: {
    createTitle: "Новый продукт",
    closeLabel: "Закрыть редактор продукта",
    typeLabel: "Тип",
    titleLabel: "Название",
    titlePlaceholder: "Например, Натальный разбор",
    subtitleLabel: "Описание",
    subtitlePlaceholder: "Коротко объясните, что получит клиент",
    priceLabel: "Цена",
    includedItemsLabel: "Что входит",
    cancelLabel: "Отмена",
    saveDraftLabel: "Сохранить черновик",
    savingLabel: "Сохраняем",
    genericError: "Не удалось сохранить продукт",
    breadcrumbsAriaLabel: "Путь создания продукта",
    productsBreadcrumb: "Продукты",
    createBreadcrumb: "Создать"
  },
  summary: {
    activeLabel: "Активных",
    salesLabel: "Продаж всего",
    revenueLabel: "Выручка каталога",
    bestsellerLabel: "Бестселлер",
    emptyBestseller: "—"
  },
  emptyLabel: "Нет продуктов в этом статусе",
  loadingLabel: "Загружаем продукты",
  errorLabel: "Не удалось загрузить продукты"
};

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

describe("ProductsPageView", () => {
  it("composes toolbar, summary and results with page state", () => {
    const onStatusChange = vi.fn();
    const onCreate = vi.fn();
    const view = ProductsPageView({
      ...createBaseProps(),
      products: [product],
      summary,
      counts: {
        all: 1,
        active: 1,
        draft: 0,
        archived: 0
      },
      selectedStatus: "active",
      onStatusChange,
      onCreate
    });

    expect(view.type).toBe("section");
    expect(view.props.className).toBe(styles.productsPage);
    expect(view.props["aria-labelledby"]).toBe("products-title");

    const toolbar = findRequiredElementByType(view, ProductsToolbar);
    expect(toolbar.props.title).toBe("Продукты");
    expect(toolbar.props.total).toBe(1);
    expect(toolbar.props.selectedStatus).toBe("active");
    toolbar.props.onStatusChange("draft");
    toolbar.props.onCreate();
    expect(onStatusChange).toHaveBeenCalledWith("draft");
    expect(onCreate).toHaveBeenCalledOnce();

    const summaryStrip = findRequiredElementByType(view, ProductsSummaryStrip);
    expect(summaryStrip.props.summary).toBe(summary);
    expect(summaryStrip.props.copy).toBe(copy.summary);

    const results = findRequiredElementByType(view, ProductsResults);
    expect(results.props.products).toEqual([product]);
    expect(results.props.locale).toBe("ru");
    expect(results.props.isLoading).toBe(false);
    expect(results.props.isError).toBe(false);
  });

  it("passes loading, error and empty copy to results", () => {
    const view = ProductsPageView({
      ...createBaseProps(),
      isLoading: true,
      isError: true,
      products: []
    });
    const results = findRequiredElementByType(view, ProductsResults);

    expect(results.props.isLoading).toBe(true);
    expect(results.props.isError).toBe(true);
    expect(results.props.loadingLabel).toBe("Загружаем продукты");
    expect(results.props.errorLabel).toBe("Не удалось загрузить продукты");
    expect(results.props.emptyLabel).toBe("Нет продуктов в этом статусе");
  });
});

function createBaseProps(): ProductsPageViewProps {
  return {
    copy,
    locale: "ru",
    products: [],
    summary: null,
    counts: {
      all: 0,
      active: 0,
      draft: 0,
      archived: 0
    },
    selectedStatus: "all",
    isLoading: false,
    isError: false,
    onStatusChange: vi.fn(),
    onCreate: vi.fn()
  };
}

type TestElementProps = {
  children?: unknown;
  className?: string;
  copy?: unknown;
  counts?: unknown;
  emptyLabel?: string;
  errorLabel?: string;
  isError?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
  locale?: string;
  onCreate: () => void;
  onStatusChange: (status: string) => void;
  products?: unknown[];
  selectedStatus?: string;
  summary?: unknown;
  title?: string;
  total?: number;
  "aria-labelledby"?: string;
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

function visitElements(root: unknown, visitor: (element: ReactElement<TestElementProps>) => void) {
  if (!isValidElement<TestElementProps>(root)) {
    return;
  }

  visitor(root);

  Children.forEach(root.props.children, (child) => {
    visitElements(child, visitor);
  });
}
