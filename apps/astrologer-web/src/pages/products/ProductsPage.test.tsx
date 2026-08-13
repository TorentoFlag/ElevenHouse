import { Children, isValidElement, type ReactElement } from "react";
import type {
  CreateProductRequest,
  ListProductsResponse,
  ProductStatus,
  ProductSummaryResponse,
  ProductTemplateResponse
} from "@elevenhouse/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../common/http/HttpError";
import { toggleProductAccessGrant } from "../../features/products/model/productDraft";
import type { ProductConstructorModalProps } from "./components/ProductConstructorModal";
import { ProductsPage } from "./ProductsPage";
import type { ProductsPageViewProps } from "./ProductsPageView";

const mocks = vi.hoisted(() => ({
  hookState: {
    cursor: 0,
    values: [] as unknown[]
  },
  productsPageView: vi.fn(),
  productCreateTypeModal: vi.fn(),
  productConstructorModal: vi.fn(),
  useI18n: vi.fn(),
  useDocumentTitle: vi.fn(),
  useProductListQuery: vi.fn(),
  useProductSummaryQuery: vi.fn(),
  useProductTemplatesQuery: vi.fn(),
  useCreateProductFromTemplateMutation: vi.fn(),
  useCreateProductMutation: vi.fn(),
  useUpdateProductMutation: vi.fn(),
  usePublishProductMutation: vi.fn(),
  useMoveProductToDraftMutation: vi.fn(),
  useArchiveProductMutation: vi.fn(),
  useDuplicateProductMutation: vi.fn(),
  useAstrologerTariffEntitlementsQuery: vi.fn(),
  navigate: vi.fn()
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
    }),
    useReducer: vi.fn(
      (reducer: (state: unknown, action: unknown) => unknown, initialArg: unknown) => {
        const stateIndex = mocks.hookState.cursor;
        mocks.hookState.cursor += 1;

        if (!(stateIndex in mocks.hookState.values)) {
          mocks.hookState.values[stateIndex] = initialArg;
        }

        return [
          mocks.hookState.values[stateIndex],
          (action: unknown) => {
            mocks.hookState.values[stateIndex] = reducer(
              mocks.hookState.values[stateIndex],
              action
            );
          }
        ];
      }
    )
  };
});

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: mocks.useI18n
}));

vi.mock("react-router", () => ({
  useNavigate: () => mocks.navigate
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

vi.mock("../../features/products/model/useProductTemplatesQuery", () => ({
  useProductTemplatesQuery: mocks.useProductTemplatesQuery
}));

vi.mock("../../features/products/model/useCreateProductFromTemplateMutation", () => ({
  useCreateProductFromTemplateMutation: mocks.useCreateProductFromTemplateMutation
}));

vi.mock("../../features/products/model/useCreateProductMutation", () => ({
  useCreateProductMutation: mocks.useCreateProductMutation
}));

vi.mock("../../features/products/model/useUpdateProductMutation", () => ({
  useUpdateProductMutation: mocks.useUpdateProductMutation
}));

vi.mock("../../features/products/model/usePublishProductMutation", () => ({
  usePublishProductMutation: mocks.usePublishProductMutation
}));

vi.mock("../../features/products/model/useMoveProductToDraftMutation", () => ({
  useMoveProductToDraftMutation: mocks.useMoveProductToDraftMutation
}));

vi.mock("../../features/products/model/useArchiveProductMutation", () => ({
  useArchiveProductMutation: mocks.useArchiveProductMutation
}));

vi.mock("../../features/products/model/useDuplicateProductMutation", () => ({
  useDuplicateProductMutation: mocks.useDuplicateProductMutation
}));

vi.mock("../../features/platform-tariffs/model/useAstrologerTariffEntitlementsQuery", () => ({
  useAstrologerTariffEntitlementsQuery: mocks.useAstrologerTariffEntitlementsQuery
}));

vi.mock("./ProductsPageView", () => ({
  ProductsPageView: mocks.productsPageView
}));

vi.mock("./components/ProductCreateTypeModal", () => ({
  ProductCreateTypeModal: mocks.productCreateTypeModal
}));

vi.mock("./components/ProductConstructorModal", () => ({
  ProductConstructorModal: mocks.productConstructorModal
}));

const productsCopy = {
  documentTitle: "ElevenHouse | Продукты",
  title: "Продукты",
  createLabel: "Создать продукт",
  statusFilterAriaLabel: "Фильтр статусов продуктов",
  createTypeModal: {
    title: "Выберите тип продукта",
    closeLabel: "Закрыть выбор типа",
    description: "Тип задаст базовые параметры, которые можно изменить в редакторе.",
    loadError: "Не удалось загрузить шаблоны. Выберите тип вручную."
  },
  editor: {
    title: "Конструктор продукта",
    closeLabel: "Закрыть конструктор продукта",
    typeLabel: "Тип",
    titleLabel: "Название",
    titlePlaceholder: "Например, Натальный разбор",
    subtitleLabel: "Описание",
    subtitlePlaceholder: "Коротко объясните, что получит клиент",
    priceLabel: "Цена",
    durationLabel: "Длительность",
    durationSuffix: " мин",
    decrementDurationLabel: "Уменьшить длительность",
    incrementDurationLabel: "Увеличить длительность",
    formatLabel: "Формат поставки",
    executionModeLabel: "Сценарий выполнения",
    paymentModelLabel: "Оплата",
    packageLabel: "Пакет",
    packageSessionCountLabel: "Сессий в пакете",
    packageDiscountLabel: "Скидка пакета",
    subscriptionLabel: "Подписка",
    subscriptionPeriodLabel: "Период подписки",
    trialDaysLabel: "Пробный период",
    participantModeLabel: "Участники",
    groupSizeLabel: "Размер группы",
    requiredClientDataLabel: "Данные от клиента",
    methodsLabel: "Метод / система",
    accessGrantsLabel: "Доступ",
    includedItemsLabel: "Что входит",
    includedItemTextLabel: "Текст пункта",
    includedItemPlaceholder: "Что получает клиент",
    includedItemIconLabel: "Иконка пункта",
    addIncludedItemLabel: "Добавить пункт",
    removeIncludedItemLabel: "Удалить пункт",
    modifiersLabel: "Допы · модификаторы",
    modifierKindLabel: "Тип модификатора",
    modifierFixedLabel: "Фиксированная цена",
    modifierPercentLabel: "Процент",
    modifierFreeLabel: "Бесплатно",
    modifierLabelLabel: "Название модификатора",
    modifierLabelPlaceholder: "Название модификатора",
    modifierPriceLabel: "Цена модификатора",
    addModifierLabel: "Свой модификатор",
    removeModifierLabel: "Удалить модификатор",
    previewLabel: "Превью",
    previewPriceLabel: "Стоимость",
    previewIncludedItemsLabel: "Включено",
    cancelLabel: "Отмена",
    saveDraftLabel: "Сохранить черновик",
    savingLabel: "Сохраняем",
    iconLabelByName: {
      check: "Галочка",
      sparkle: "Искра",
      video: "Видео",
      mic: "Микрофон",
      chat: "Чат",
      content: "Контент",
      fileDown: "Файл",
      flow: "Поток",
      globe: "Канал",
      box: "Коробка",
      wallet: "Кошелек",
      calendar: "Календарь",
      clock: "Часы",
      lightning: "Молния",
      users: "Группа",
      gift: "Подарок",
      orbit: "Орбита",
      map: "Карта",
      star: "Звезда",
      reference: "Справочник",
      verified: "Проверено",
      refresh: "Обновить"
    }
  },
  actions: {
    menuLabel: "Действия продукта",
    editLabel: "Изменить",
    duplicateLabel: "Дублировать",
    publishLabel: "Опубликовать",
    draftLabel: "В черновик",
    archiveLabel: "В архив"
  },
  summary: {
    activeLabel: "Активных",
    salesLabel: "Продаж всего",
    revenueLabel: "Выручка каталога",
    bestsellerLabel: "Бестселлер",
    emptyBestseller: "—"
  },
  saveErrorLabel: "Не удалось сохранить продукт",
  actionErrorReloadLabel: "Обновить продукты",
  emptyLabel: "Нет продуктов в этом статусе",
  loadingLabel: "Загружаем продукты",
  errorLabel: "Не удалось загрузить продукты"
};

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  type: "single",
  status: "draft",
  revision: 7,
  title: "Натальный разбор",
  subtitle: null,
  priceMinor: 490000,
  currency: "RUB",
  coverMediaId: null,
  coverMedia: null,
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
  astroDiaryConfig: null,
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
    mocks.productConstructorModal.mockImplementation(() => null);
    mocks.useProductTemplatesQuery.mockReturnValue({
      data: { templates: [] },
      isLoading: false,
      isError: false
    });
    mocks.useCreateProductFromTemplateMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
    mocks.useCreateProductMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
    mocks.useUpdateProductMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
    mocks.usePublishProductMutation.mockReturnValue({
      mutate: vi.fn(),
      reset: vi.fn(),
      isPending: false
    });
    mocks.useMoveProductToDraftMutation.mockReturnValue({
      mutate: vi.fn(),
      reset: vi.fn(),
      isPending: false
    });
    mocks.useArchiveProductMutation.mockReturnValue({
      mutate: vi.fn(),
      reset: vi.fn(),
      isPending: false
    });
    mocks.useDuplicateProductMutation.mockReturnValue({
      mutate: vi.fn(),
      reset: vi.fn(),
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
      isError: false,
      refetch: vi.fn()
    });
    mocks.useProductSummaryQuery.mockReturnValue({
      data: summaryResponse,
      isLoading: false,
      isError: false,
      refetch: vi.fn()
    });
    mocks.useAstrologerTariffEntitlementsQuery.mockReturnValue({
      data: { products: { read: "allow", mutation: "allow" } }
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
    expect(viewProps.isProductActionPending).toBe(false);
    expect(typeof viewProps.onEditProduct).toBe("function");
    expect(typeof viewProps.onDuplicateProduct).toBe("function");
    expect(typeof viewProps.onProductStatusChange).toBe("function");
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

  it("renders a typed stale card-action error and reloads server authority before retry", async () => {
    const listRefetch = vi.fn().mockResolvedValue(undefined);
    const summaryRefetch = vi.fn().mockResolvedValue(undefined);
    const publishReset = vi.fn();
    const moveReset = vi.fn();
    const archiveReset = vi.fn();
    const duplicateReset = vi.fn();
    const publishMutate = vi.fn();
    const duplicateMutate = vi.fn();
    mocks.useProductListQuery.mockReturnValue({
      data: productsResponse,
      isLoading: false,
      isError: false,
      refetch: listRefetch
    });
    mocks.useProductSummaryQuery.mockReturnValue({
      data: summaryResponse,
      isLoading: false,
      isError: false,
      refetch: summaryRefetch
    });
    mocks.usePublishProductMutation.mockReturnValue({
      mutate: publishMutate,
      reset: publishReset,
      isPending: false,
      error: new HttpError(409, {
        code: "PRODUCT_REVISION_CONFLICT",
        expectedRevision: 7,
        currentRevision: 8
      })
    });
    mocks.useMoveProductToDraftMutation.mockReturnValue({
      mutate: vi.fn(),
      reset: moveReset,
      isPending: false
    });
    mocks.useArchiveProductMutation.mockReturnValue({
      mutate: vi.fn(),
      reset: archiveReset,
      isPending: false
    });
    mocks.useDuplicateProductMutation.mockReturnValue({
      mutate: duplicateMutate,
      reset: duplicateReset,
      isPending: false
    });

    renderPage();
    const props = getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView);

    expect(props.productActionError).toBe(
      "Продукт изменился в другой вкладке: текущая редакция 8. Обновите страницу перед повторной правкой."
    );
    expect(props.isProductActionPending).toBe(true);
    props.onProductStatusChange(product.id, "active");
    props.onDuplicateProduct(product);
    expect(publishMutate).not.toHaveBeenCalled();
    expect(duplicateMutate).not.toHaveBeenCalled();
    await props.onReloadProductAuthority();
    expect(listRefetch).toHaveBeenCalledOnce();
    expect(summaryRefetch).toHaveBeenCalledOnce();
    expect(publishReset).toHaveBeenCalledOnce();
    expect(moveReset).toHaveBeenCalledOnce();
    expect(archiveReset).toHaveBeenCalledOnce();
    expect(duplicateReset).toHaveBeenCalledOnce();
  });

  it("renders the typed fulfillment blocker from a card duplicate/lifecycle mutation", () => {
    mocks.useDuplicateProductMutation.mockReturnValue({
      mutate: vi.fn(),
      reset: vi.fn(),
      isPending: false,
      error: new HttpError(409, {
        code: "PRODUCT_FULFILLMENT_NOT_READY",
        message: "AstroDiary subscription fulfillment is not ready"
      })
    });

    renderPage();

    expect(
      getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).productActionError
    ).toBe(
      "Подписку на Астродневник пока нельзя активировать: платежи и выдача доступа еще не подключены. Сохраните продукт как черновик."
    );
  });

  it("turns the server entitlement projection into a tariff-management route gate", () => {
    mocks.useAstrologerTariffEntitlementsQuery.mockReturnValueOnce({
      data: { products: { read: "deny", mutation: "deny" } }
    });

    renderPage();
    const props = getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView);
    expect(props.isTariffLocked).toBe(true);
    props.onManageTariff();
    expect(mocks.navigate).toHaveBeenCalledWith("/settings");
  });

  it("keeps historical products readable but removes mutation controls", () => {
    mocks.useAstrologerTariffEntitlementsQuery.mockReturnValueOnce({
      data: { products: { read: "read_only", mutation: "read_only" } }
    });

    renderPage();

    const props = getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView);
    expect(props.isTariffLocked).toBe(false);
    expect(props.canManageProducts).toBe(false);
  });

  it.each([
    ["duplicate", "useDuplicateProductMutation"],
    ["publish", "usePublishProductMutation"],
    ["move to draft", "useMoveProductToDraftMutation"],
    ["archive", "useArchiveProductMutation"]
  ] satisfies Array<[string, keyof typeof mocks]>)(
    "marks product actions pending while the %s mutation is pending",
    (_label, mutationHookName) => {
      mocks[mutationHookName].mockReturnValue({
        mutate: vi.fn(),
        isPending: true
      });

      renderPage();

      expect(
        getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).isProductActionPending
      ).toBe(true);
    }
  );

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

    const constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    expect(constructorProps.copy).toBe(productsCopy.editor);
    expect(constructorProps.locale).toBe("ru");
    expect(constructorProps.draft.type).toBe("single");
    expect(constructorProps.draft.priceMinor).toBe(490000);
  });

  it("closes the constructor without changing the selected type flow", () => {
    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onCreate();
    renderPage();
    getLatestMockProps<{ onSelect: (type: "custom") => void }>(
      mocks.productCreateTypeModal
    ).onSelect("custom");
    renderPage();

    const constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    expect(constructorProps.draft.type).toBe("custom");

    constructorProps.onClose();
    const typeModalCallCountBeforeCloseRender = mocks.productCreateTypeModal.mock.calls.length;
    const constructorCallCountBeforeCloseRender = mocks.productConstructorModal.mock.calls.length;
    renderPage();

    expect(mocks.productCreateTypeModal).toHaveBeenCalledTimes(typeModalCallCountBeforeCloseRender);
    expect(mocks.productConstructorModal).toHaveBeenCalledTimes(
      constructorCallCountBeforeCloseRender
    );
  });

  it("does not persist a template draft when the constructor closes without saving", async () => {
    const template = createProductTemplate();
    const createFromTemplate = vi.fn().mockResolvedValue({
      ...product,
      id: "44444444-4444-4444-8444-444444444444",
      title: template.payload.title
    });
    const createProduct = vi.fn().mockResolvedValue(product);
    mocks.useProductTemplatesQuery.mockReturnValue({
      data: { templates: [template] },
      isLoading: false,
      isError: false
    });
    mocks.useCreateProductFromTemplateMutation.mockReturnValue({
      mutateAsync: createFromTemplate,
      isPending: false
    });
    mocks.useCreateProductMutation.mockReturnValue({
      mutateAsync: createProduct,
      isPending: false
    });

    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onCreate();
    renderPage();
    getLatestMockProps<{ onSelectTemplate: (code: string) => void }>(
      mocks.productCreateTypeModal
    ).onSelectTemplate(template.code);

    expect(createFromTemplate).not.toHaveBeenCalled();
    expect(createProduct).not.toHaveBeenCalled();

    renderPage();
    const constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    expect(constructorProps.draft.title).toBe(template.payload.title);
    expect(constructorProps.draft.includedItems).toEqual(template.payload.includedItems);

    constructorProps.onClose();
    renderPage();

    expect(createFromTemplate).not.toHaveBeenCalled();
    expect(createProduct).not.toHaveBeenCalled();
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
    getLatestMockProps<{ onSelect: (type: "single") => void }>(
      mocks.productCreateTypeModal
    ).onSelect("single");
    renderPage();

    let constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    constructorProps.onDraftChange({
      ...constructorProps.draft,
      title: "Натальный разбор",
      subtitle: "60 минут онлайн",
      priceMinor: 490000
    });
    renderPage();
    constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    await constructorProps.onSave();

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Натальный разбор",
        subtitle: "60 минут онлайн",
        priceMinor: 490000
      }) satisfies Partial<CreateProductRequest>
    );

    const constructorCallCountBeforeCloseRender = mocks.productConstructorModal.mock.calls.length;
    renderPage();
    expect(mocks.productConstructorModal).toHaveBeenCalledTimes(
      constructorCallCountBeforeCloseRender
    );
  });

  it("creates a draft and publishes it from the constructor publish action", async () => {
    const createMutateAsync = vi.fn().mockResolvedValue({ ...product, id: "created-product-id" });
    const publishMutateAsync = vi.fn().mockResolvedValue({
      ...product,
      id: "created-product-id",
      status: "active"
    });
    mocks.useCreateProductMutation.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false
    });
    mocks.usePublishProductMutation.mockReturnValue({
      mutateAsync: publishMutateAsync,
      mutate: vi.fn(),
      isPending: false
    });

    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onCreate();
    renderPage();
    getLatestMockProps<{ onSelect: (type: "single") => void }>(
      mocks.productCreateTypeModal
    ).onSelect("single");
    renderPage();

    let constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    constructorProps.onDraftChange({
      ...constructorProps.draft,
      title: "Натальный разбор"
    });
    renderPage();
    constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    await constructorProps.onPublish();

    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Натальный разбор"
      }) satisfies Partial<CreateProductRequest>
    );
    expect(publishMutateAsync).toHaveBeenCalledWith({
      productId: "created-product-id",
      expectedRevision: product.revision
    });
  });

  it("keeps the created AstroDiary draft open when activation fulfillment is unavailable", async () => {
    const diaryProduct = {
      ...product,
      id: "created-diary-product-id",
      type: "sub" as const,
      title: "Астродневник",
      executionMode: "async" as const,
      paymentModel: "sub" as const,
      durationMinutes: null,
      durationLabel: null,
      subscriptionPeriod: "month" as const,
      trialDays: null,
      deliveryFormats: ["chat", "audio", "file"] as const,
      requiredClientData: [],
      methods: [],
      accessGrants: ["journal"] as const,
      astroDiaryConfig: {
        reflectionCyclesPerPeriod: 4,
        responseSlaWorkingDays: 2,
        clientResponseWindowCalendarDays: 7,
        workingWeekdays: [1, 2, 3, 4, 5] as const,
        serviceTimezone: "UTC"
      }
    };
    mocks.useCreateProductMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(diaryProduct),
      isPending: false
    });
    mocks.usePublishProductMutation.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(
        new HttpError(409, {
          code: "PRODUCT_FULFILLMENT_NOT_READY",
          message: "AstroDiary subscription fulfillment is not ready"
        })
      ),
      mutate: vi.fn(),
      isPending: false
    });

    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onCreate();
    renderPage();
    getLatestMockProps<{ onSelect: (type: "sub") => void }>(mocks.productCreateTypeModal).onSelect(
      "sub"
    );
    renderPage();

    let constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    constructorProps.onDraftChange(
      toggleProductAccessGrant({ ...constructorProps.draft, title: diaryProduct.title }, "journal")
    );
    renderPage();
    constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    await constructorProps.onPublish();
    renderPage();

    constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    expect(constructorProps.error).toBe(
      "Подписку на Астродневник пока нельзя активировать: платежи и выдача доступа еще не подключены. Сохраните продукт как черновик."
    );
    expect(constructorProps.draft.title).toBe("Астродневник");
  });

  it("opens an existing product in the constructor and saves it through the update mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(product);
    mocks.useUpdateProductMutation.mockReturnValue({
      mutateAsync,
      isPending: false
    });

    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onEditProduct!(product);
    renderPage();

    let constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    expect(constructorProps.draft.title).toBe("Натальный разбор");
    constructorProps.onDraftChange({
      ...constructorProps.draft,
      title: "Обновленный натальный разбор"
    });
    renderPage();

    constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    await constructorProps.onSave();

    expect(mutateAsync).toHaveBeenCalledWith({
      productId: product.id,
      body: expect.objectContaining({
        expectedRevision: product.revision,
        title: "Обновленный натальный разбор"
      })
    });
  });

  it("keeps a stale edit open and explains that the product must be reloaded", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(
      new HttpError(409, {
        code: "PRODUCT_REVISION_CONFLICT",
        expectedRevision: product.revision,
        currentRevision: product.revision + 1
      })
    );
    mocks.useUpdateProductMutation.mockReturnValue({
      mutateAsync,
      isPending: false
    });

    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onEditProduct!(product);
    renderPage();

    await getLatestMockProps<ProductConstructorModalProps>(mocks.productConstructorModal).onSave();
    renderPage();

    let staleConstructor = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    expect(staleConstructor.error).toBe(
      "Продукт изменился в другой вкладке: текущая редакция 8. Обновите страницу перед повторной правкой."
    );
    expect(staleConstructor.draft.title).toBe(product.title);

    staleConstructor.onDraftChange({ ...staleConstructor.draft, title: "Еще одна правка" });
    renderPage();
    staleConstructor = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    expect(staleConstructor.error).toContain("Обновите страницу");
    await staleConstructor.onSave();
    expect(mutateAsync).toHaveBeenCalledOnce();
  });

  it("updates an existing product and publishes it from the constructor publish action", async () => {
    const updateMutateAsync = vi.fn().mockResolvedValue(product);
    const publishMutateAsync = vi.fn().mockResolvedValue({ ...product, status: "active" });
    mocks.useUpdateProductMutation.mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false
    });
    mocks.usePublishProductMutation.mockReturnValue({
      mutateAsync: publishMutateAsync,
      mutate: vi.fn(),
      isPending: false
    });

    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onEditProduct!(product);
    renderPage();

    let constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    constructorProps.onDraftChange({
      ...constructorProps.draft,
      title: "Опубликованный натальный разбор"
    });
    renderPage();
    constructorProps = getLatestMockProps<ProductConstructorModalProps>(
      mocks.productConstructorModal
    );
    await constructorProps.onPublish();

    expect(updateMutateAsync).toHaveBeenCalledWith({
      productId: product.id,
      body: expect.objectContaining({
        expectedRevision: product.revision,
        title: "Опубликованный натальный разбор"
      })
    });
    expect(publishMutateAsync).toHaveBeenCalledWith({
      productId: product.id,
      expectedRevision: product.revision
    });
  });

  it("clears the edited draft when opening type selection from edit flow", () => {
    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onEditProduct!(product);
    renderPage();
    expect(
      getLatestMockProps<ProductConstructorModalProps>(mocks.productConstructorModal).draft.title
    ).toBe("Натальный разбор");

    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onCreate();
    const constructorCallCountBeforeCreateRender = mocks.productConstructorModal.mock.calls.length;
    renderPage();

    expect(mocks.productConstructorModal).toHaveBeenCalledTimes(
      constructorCallCountBeforeCreateRender
    );
    expect(
      getLatestMockProps<{ onSelect: (type: "single") => void }>(mocks.productCreateTypeModal)
    ).toBeTruthy();
  });

  it.each([
    ["active", "usePublishProductMutation"],
    ["draft", "useMoveProductToDraftMutation"],
    ["archived", "useArchiveProductMutation"]
  ] satisfies Array<[ProductStatus, keyof typeof mocks]>)(
    "routes %s status actions to the matching mutation",
    (status, mutationHookName) => {
      const mutate = vi.fn();
      mocks[mutationHookName].mockReturnValue({
        mutate,
        isPending: false
      });

      renderPage();
      getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onProductStatusChange!(
        product.id,
        status
      );

      expect(mutate).toHaveBeenCalledWith({
        productId: product.id,
        expectedRevision: product.revision
      });
    }
  );

  it("duplicates products through the duplicate mutation", () => {
    const mutate = vi.fn();
    mocks.useDuplicateProductMutation.mockReturnValue({
      mutate,
      isPending: false
    });

    renderPage();
    getLatestMockProps<ProductsPageViewProps>(mocks.productsPageView).onDuplicateProduct!(product);

    expect(mutate).toHaveBeenCalledWith({
      productId: product.id,
      body: {
        expectedRevision: product.revision,
        title: "Натальный разбор (копия)"
      }
    });
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

function createProductTemplate(): ProductTemplateResponse {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    code: "individual_consultation",
    locale: "ru",
    type: "single",
    status: "active",
    title: "Индивидуальная консультация",
    subtitle: "Одна встреча с понятным результатом",
    description: "Готовая заготовка консультации",
    sortOrder: 10,
    payload: {
      type: "single",
      title: "Индивидуальная консультация",
      subtitle: "Одна встреча с понятным результатом",
      priceMinor: 490000,
      currency: "RUB",
      executionMode: "live",
      paymentModel: "once",
      durationMinutes: 60,
      durationLabel: "60 мин",
      participantMode: "solo",
      deliveryFormats: ["video"],
      requiredClientData: ["question"],
      methods: [],
      accessGrants: [],
      includedItems: [{ text: "Онлайн-встреча 1 : 1", icon: "video", order: 10 }],
      modifiers: []
    },
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z"
  };
}
