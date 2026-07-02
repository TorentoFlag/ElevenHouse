import { Children, isValidElement, type ReactElement } from "react";
import type { CreateProductRequest, ListProductsResponse, ProductSummaryResponse } from "@elevenhouse/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductEditorModalProps } from "./components/ProductEditorModal";
import { ProductsPage } from "./ProductsPage";
import type { ProductsPageViewProps } from "./ProductsPageView";

const mocks = vi.hoisted(() => ({
  hookState: {
    cursor: 0,
    values: [] as unknown[]
  },
  productsPageView: vi.fn(),
  productCreateTypeModal: vi.fn(),
  productEditorModal: vi.fn(),
  useI18n: vi.fn(),
  useDocumentTitle: vi.fn(),
  useProductListQuery: vi.fn(),
  useProductSummaryQuery: vi.fn(),
  useCreateProductMutation: vi.fn()
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useState: vi.fn((initialValue: unknown) => {
      const stateIndex = mocks.hookState.cursor;
      mocks.hookState.cursor += 1;

      if (!(stateIndex in mocks.hookState.values)) {
        mocks.hookState.values[stateIndex] =
          typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue;
      }

      return [
        mocks.hookState.values[stateIndex],
        (nextValue: unknown) => {
          mocks.hookState.values[stateIndex] =
            typeof nextValue === "function"
              ? (nextValue as (currentValue: unknown) => unknown)(
                  mocks.hookState.values[stateIndex]
                )
              : nextValue;
        }
      ];
    })
  };
});

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: mocks.useI18n
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));

vi.mock("../../features/products/model/useProductListQuery", () => ({
  useProductListQuery: mocks.useProductListQuery
}));

vi.mock("../../features/products/model/useProductSummaryQuery", () => ({
  useProductSummaryQuery: mocks.useProductSummaryQuery
}));

vi.mock("../../features/products/model/useCreateProductMutation", () => ({
  useCreateProductMutation: mocks.useCreateProductMutation
}));

vi.mock("./ProductsPageView", () => ({
  ProductsPageView: mocks.productsPageView
}));

vi.mock("./components/ProductCreateTypeModal", () => ({
  ProductCreateTypeModal: mocks.productCreateTypeModal
}));

vi.mock("./components/ProductEditorModal", () => ({
  ProductEditorModal: mocks.productEditorModal
}));

const productsCopy = {
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
    genericError: "Не удалось сохранить продукт"
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
  status: "draft",
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

const productsResponse = {
  products: [product],
  total: 1,
  counts: {
    all: 1,
    active: 0,
    draft: 1,
    archived: 0
  }
} satisfies ListProductsResponse;

const summaryResponse = {
  total: 1,
  active: 0,
  draft: 1,
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

describe("ProductsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hookState.cursor = 0;
    mocks.hookState.values = [];
    mocks.productsPageView.mockImplementation(() => null);
    mocks.productCreateTypeModal.mockImplementation(() => null);
    mocks.productEditorModal.mockImplementation(() => null);
    mocks.useCreateProductMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
    mocks.useI18n.mockReturnValue({
      dictionary: {
        products: productsCopy
      },
      locale: "ru"
    });
    mocks.useProductListQuery.mockReturnValue({
      data: productsResponse,
      isLoading: false,
      isError: false
    });
    mocks.useProductSummaryQuery.mockReturnValue({
      data: summaryResponse,
      isLoading: false,
      isError: false
    });
  });

  it("loads all products by default and passes product data to the view", () => {
    renderPage();

    expect(mocks.useDocumentTitle).toHaveBeenCalledWith("ElevenHouse | Продукты");
    expect(mocks.useProductListQuery).toHaveBeenCalledWith({
      status: "all",
      limit: 50,
      offset: 0
    });
    expect(mocks.useProductSummaryQuery).toHaveBeenCalledWith();

    const viewProps = getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView);
    expect(viewProps.copy).toBe(productsCopy);
    expect(viewProps.locale).toBe("ru");
    expect(viewProps.selectedStatus).toBe("all");
    expect(viewProps.products).toEqual([product]);
    expect(viewProps.counts).toEqual(productsResponse.counts);
    expect(viewProps.summary).toBe(summaryResponse);
    expect(viewProps.isLoading).toBe(false);
    expect(viewProps.isError).toBe(false);
  });

  it("changes the status filter and reloads products with that query", () => {
    renderPage();
    let viewProps = getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView);
    viewProps.onStatusChange("draft");

    renderPage();

    expect(mocks.useProductListQuery).toHaveBeenLastCalledWith({
      status: "draft",
      limit: 50,
      offset: 0
    });
    viewProps = getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView);
    expect(viewProps.selectedStatus).toBe("draft");
  });

  it("combines list and summary query loading and error states", () => {
    mocks.useProductListQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false
    });

    renderPage();
    expect(getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).isLoading).toBe(true);

    mocks.useProductListQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true
    });
    mocks.useProductSummaryQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: false
    });

    renderPage();
    expect(getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).isError).toBe(true);
  });

  it("opens product type selection and then opens the editor with a default draft", () => {
    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onCreate();

    renderPage();
    const typeModalProps = getLatestMockProps<{
      copy: typeof productsCopy.createTypeModal;
      onSelect: (type: "single") => void;
    }>(mocks.productCreateTypeModal);
    expect(typeModalProps.copy).toBe(productsCopy.createTypeModal);

    typeModalProps.onSelect("single");
    renderPage();

    const editorProps = getLatestMockProps<ProductEditorModalProps>(mocks.productEditorModal);
    expect(editorProps.copy).toBe(productsCopy.editor);
    expect(editorProps.draft.type).toBe("single");
    expect(editorProps.draft.priceMinor).toBe(490000);
  });

  it("saves a created draft through the products mutation and closes the editor", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(product);
    mocks.useCreateProductMutation.mockReturnValue({
      mutateAsync,
      isPending: false
    });

    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onCreate();
    renderPage();
    getLatestMockProps<{ onSelect: (type: "single") => void }>(mocks.productCreateTypeModal).onSelect(
      "single"
    );
    renderPage();

    let editorProps = getLatestMockProps<ProductEditorModalProps>(mocks.productEditorModal);
    editorProps.onDraftChange({
      ...editorProps.draft,
      title: "Натальный разбор",
      subtitle: "60 минут онлайн",
      priceMinor: 490000
    });
    renderPage();
    editorProps = getLatestMockProps<ProductEditorModalProps>(mocks.productEditorModal);
    await editorProps.onSave();

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Натальный разбор",
        subtitle: "60 минут онлайн",
        priceMinor: 490000
      }) satisfies Partial<CreateProductRequest>
    );

    const editorCallCountBeforeCloseRender = mocks.productEditorModal.mock.calls.length;
    renderPage();
    expect(mocks.productEditorModal).toHaveBeenCalledTimes(editorCallCountBeforeCloseRender);
  });
});

function renderPage() {
  mocks.hookState.cursor = 0;
  renderElement(<ProductsPage />);
}

function renderElement(element: unknown): void {
  if (Array.isArray(element)) {
    element.forEach(renderElement);
    return;
  }

  if (!isValidElement(element)) {
    return;
  }

  const typedElement = element as ReactElement<Record<string, unknown>>;

  if (typeof typedElement.type === "function") {
    const Component = typedElement.type as (props: Record<string, unknown>) => unknown;
    renderElement(Component(typedElement.props));
    return;
  }

  Children.forEach(typedElement.props.children, renderElement);
}

function getLatestMockProps<T>(mock: { mock: { calls: unknown[][] } }): T {
  const lastCall = mock.mock.calls.at(-1);

  if (!lastCall?.[0]) {
    throw new Error("Expected mock to be called with props");
  }

  return lastCall[0] as T;
}
