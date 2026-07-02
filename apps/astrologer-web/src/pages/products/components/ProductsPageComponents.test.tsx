import { Children, isValidElement, type ReactElement } from "react";
import type { ListProductsResponse, ProductSummaryResponse } from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import { Card } from "@elevenhouse/design-system/components/Card";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import { Wallet } from "@elevenhouse/design-system/icons/Wallet";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProductDraft } from "../../../features/products/model/productDraft";
import { productCopyByLocale } from "../../../features/products/model/productCopy";
import { ProductCard } from "./ProductCard";
import { ProductsCreateFlow } from "./ProductsCreateFlow";
import { ProductCreateTypeModal } from "./ProductCreateTypeModal";
import { ProductEditorModal } from "./ProductEditorModal";
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

  it("renders product type selection modal with all product templates", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const modal = ProductCreateTypeModal({
      copy: {
        title: "Выберите тип продукта",
        closeLabel: "Закрыть выбор типа",
        description: "Тип задаст базовые параметры, которые можно изменить в редакторе."
      },
      types: productCopyByLocale.ru.types,
      onSelect,
      onClose
    });

    const modalRoot = findRequiredElementByType(modal, Modal);
    expect(modalRoot.props.title).toBe("Выберите тип продукта");
    expect(modalRoot.props.closeLabel).toBe("Закрыть выбор типа");

    const typeOptions = findElementsByProp(modal, "data-product-create-type");
    expect(typeOptions.map((option) => option.props["data-product-create-type"])).toEqual([
      "single",
      "pack",
      "async",
      "sub",
      "mini",
      "course",
      "custom"
    ]);
    expect(JSON.stringify(modal.props.children)).toContain("Разовая консультация");

    getArrayItem(typeOptions, 0).props.onClick();
    expect(onSelect).toHaveBeenCalledWith("single");
  });

  it("renders product editor modal and updates draft fields", async () => {
    const draft = createDefaultProductDraft("single");
    const onDraftChange = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const modal = ProductEditorModal({
      copy: {
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
        genericError: "Не удалось сохранить продукт"
      },
      productType: productCopyByLocale.ru.types.single,
      draft,
      isSaving: false,
      error: null,
      onDraftChange,
      onSave,
      onClose
    });

    expect(findRequiredElementByType(modal, Modal).props.title).toBe("Новый продукт");
    expect(findRequiredElementByProp(modal, "data-product-editor-type-label").props.children).toBe(
      "Разовая консультация"
    );

    findRequiredElementByProp(modal, "data-product-editor-title").props.onChange({
      currentTarget: { value: "Натальный разбор" }
    });
    expect(onDraftChange).toHaveBeenCalledWith({
      ...draft,
      title: "Натальный разбор"
    });

    findRequiredElementByProp(modal, "data-product-editor-subtitle").props.onChange({
      currentTarget: { value: "60 минут онлайн" }
    });
    expect(onDraftChange).toHaveBeenCalledWith({
      ...draft,
      subtitle: "60 минут онлайн"
    });

    findRequiredElementByProp(modal, "data-product-editor-price").props.onChange({
      currentTarget: { value: "6200" }
    });
    expect(onDraftChange).toHaveBeenCalledWith({
      ...draft,
      priceMinor: 620000
    });

    findRequiredElementByProp(modal, "data-product-editor-included-item").props.onChange({
      currentTarget: { value: "Персональные рекомендации" }
    });
    expect(onDraftChange).toHaveBeenCalledWith({
      ...draft,
      includedItems: [
        { ...draft.includedItems[0], text: "Персональные рекомендации" },
        ...draft.includedItems.slice(1)
      ]
    });

    const submitResult = findRequiredElementByProp(modal, "data-product-editor-form").props.onSubmit({
      preventDefault: vi.fn()
    });
    expect(submitResult).toBeUndefined();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("renders create-flow modals from consolidated flow state", () => {
    const draft = createDefaultProductDraft("single");
    const flow = {
      isTypeModalOpen: true,
      editorDraft: draft,
      editorError: null,
      isSaving: false,
      openTypeSelection: vi.fn(),
      closeTypeSelection: vi.fn(),
      selectType: vi.fn(),
      updateDraft: vi.fn(),
      saveDraft: vi.fn(),
      closeEditor: vi.fn()
    };

    const flowView = ProductsCreateFlow({
      copy: {
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
          genericError: "Не удалось сохранить продукт"
        }
      },
      productCopy: productCopyByLocale.ru,
      flow
    });

    const typeModal = findRequiredElementByType(flowView, ProductCreateTypeModal);
    typeModal.props.onSelect("single");
    typeModal.props.onClose();
    expect(flow.selectType).toHaveBeenCalledWith("single");
    expect(flow.closeTypeSelection).toHaveBeenCalledOnce();

    const editorModal = findRequiredElementByType(flowView, ProductEditorModal);
    expect(editorModal.props.draft).toBe(draft);
    expect(editorModal.props.productType).toBe(productCopyByLocale.ru.types.single);
    editorModal.props.onDraftChange(draft);
    editorModal.props.onSave();
    editorModal.props.onClose();
    expect(flow.updateDraft).toHaveBeenCalledWith(draft);
    expect(flow.saveDraft).toHaveBeenCalledOnce();
    expect(flow.closeEditor).toHaveBeenCalledOnce();
  });
});

type TestElementProps = {
  active?: boolean;
  as?: string;
  children?: unknown;
  closeLabel?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  onChange: (event: { currentTarget: { value: string } }) => void;
  onClick: () => void;
  onSubmit: (event: { preventDefault: () => void }) => void | Promise<void>;
  product?: unknown;
  productType?: unknown;
  startIcon: { type: unknown };
  title?: string;
  value?: string | number;
  "data-product-create-type"?: string;
  "data-product-editor-form"?: string;
  "data-product-editor-included-item"?: string;
  "data-product-editor-price"?: string;
  "data-product-editor-subtitle"?: string;
  "data-product-editor-title"?: string;
  "data-product-editor-type-label"?: string;
  draft?: unknown;
  onClose: () => void;
  onDraftChange: (draft: unknown) => void;
  onSave: () => void | Promise<void>;
  onSelect: (type: string) => void;
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

function findRequiredElementByProp(root: unknown, propName: keyof TestElementProps) {
  const element = findElementsByProp(root, propName)[0];
  if (!element) {
    throw new Error(`Expected React element with ${String(propName)}`);
  }

  return element;
}

function findElementsByProp(
  root: unknown,
  propName: keyof TestElementProps
): Array<{ props: TestElementProps }> {
  const matches: Array<{ props: TestElementProps }> = [];
  visitElements(root, (element) => {
    if (propName in element.props) {
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
