import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type {
  ListProductsResponse,
  ProductStatus,
  ProductSummaryResponse
} from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import { ActionMenu } from "@elevenhouse/design-system/components/ActionMenu";
import { Card } from "@elevenhouse/design-system/components/Card";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProductDraft } from "../../../features/products/model/productDraft";
import { productCopyByLocale } from "../../../features/products/model/productCopy";
import { getProductCardActionItems } from "../../../features/products/model/productCardActions";
import { ProductCard } from "./ProductCard";
import { ProductConstructorModal } from "./ProductConstructorModal";
import { ProductsCreateFlow } from "./ProductsCreateFlow";
import { ProductCreateTypeModal } from "./ProductCreateTypeModal";
import { ProductsResults } from "./ProductsResults";
import { ProductsSummaryStrip } from "./ProductsSummaryStrip";
import { ProductsToolbar } from "./ProductsToolbar";
import styles from "../ProductsPage.module.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

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

const constructorCopy = {
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
};

const productActions = {
  menuLabel: "Действия продукта",
  editLabel: "Изменить",
  duplicateLabel: "Дублировать",
  publishLabel: "Опубликовать",
  draftLabel: "В черновик",
  archiveLabel: "В архив",
  onEdit: vi.fn(),
  onDuplicate: vi.fn(),
  onStatusChange: vi.fn()
};

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
    expect(toolbar.props.children[0].props.children[0].type).toBe(Icon);
    const titleIcon = findRequiredElementByType(toolbar, Icon);
    expect(titleIcon.props.iconName).toBe("box");
    expect(titleIcon.props.variant).toBe("active");
    expect(titleIcon.props["aria-hidden"]).toBe("true");
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
    expect(createButton.props.startIcon.type).toBe(Icon);
    expect(createButton.props.startIcon.props.iconName).toBe("plus");
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

  it("renders unavailable summary analytics without fake zero metrics", () => {
    const strip = ProductsSummaryStrip({
      copy: {
        activeLabel: "Активных",
        salesLabel: "Продаж всего",
        revenueLabel: "Выручка каталога",
        bestsellerLabel: "Бестселлер",
        emptyBestseller: "—"
      },
      locale: "ru",
      summary: {
        ...summary,
        analyticsStatus: "unavailable",
        totalSalesCount: 0,
        grossRevenueMinor: 0,
        bestseller: null
      }
    });

    expect(JSON.stringify(strip.props.children)).toContain("—");
    expect(JSON.stringify(strip.props.children)).not.toContain('Продаж всего","value":"0');
  });

  it("renders product cards and state messages", () => {
    const results = ProductsResults({
      products: [product],
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      actions: productActions,
      isActionPending: false,
      isLoading: false,
      isError: false,
      loadingLabel: "Загружаем продукты",
      errorLabel: "Не удалось загрузить продукты",
      emptyLabel: "Нет продуктов в этом статусе"
    });

    expect(findElementsByType(results, ProductCard)).toHaveLength(1);
    expect(findRequiredElementByType(results, ProductCard).props.actions).toBe(productActions);

    const loading = ProductsResults({
      products: [],
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      actions: productActions,
      isActionPending: false,
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
      actions: productActions,
      isActionPending: false,
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
      locale: "ru",
      actions: productActions,
      isActionPending: false
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

  it("renders product type icon from the shared product icon mapping", () => {
    const card = ProductCard({
      product,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      actions: productActions,
      isActionPending: false
    });

    const typeIcon = getArrayItem(findElementsByType(card, Icon), 0);

    expect(typeIcon.props.iconName).toBe("video");
  });

  it("renders product included item icons from product response", () => {
    const card = ProductCard({
      product: {
        ...product,
        includedItems: [
          {
            ...getArrayItem(product.includedItems, 0),
            icon: "video"
          }
        ]
      },
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      actions: productActions,
      isActionPending: false
    });

    const includedItemIcon = findRenderedElementsByType(card, Icon).find(
      (icon) => icon.props.width === 13
    );

    expect(includedItemIcon?.props.iconName).toBe("video");
  });

  it("builds product card action items by product status", () => {
    expect(
      getProductCardActionItems("draft", {
        menuLabel: "Действия продукта",
        editLabel: "Изменить",
        duplicateLabel: "Дублировать",
        publishLabel: "Опубликовать",
        draftLabel: "В черновик",
        archiveLabel: "В архив"
      }).map((item) => item.kind)
    ).toEqual(["edit", "duplicate", "publish", "archive"]);

    expect(
      getProductCardActionItems("active", {
        menuLabel: "Действия продукта",
        editLabel: "Изменить",
        duplicateLabel: "Дублировать",
        publishLabel: "Опубликовать",
        draftLabel: "В черновик",
        archiveLabel: "В архив"
      }).map((item) => item.kind)
    ).toEqual(["edit", "duplicate", "draft", "archive"]);

    expect(
      getProductCardActionItems("archived", {
        menuLabel: "Действия продукта",
        editLabel: "Изменить",
        duplicateLabel: "Дублировать",
        publishLabel: "Опубликовать",
        draftLabel: "В черновик",
        archiveLabel: "В архив"
      }).map((item) => item.kind)
    ).toEqual(["edit", "duplicate", "draft"]);
  });

  it("exposes product card actions", () => {
    const onEdit = vi.fn();
    const onDuplicate = vi.fn();
    const onStatusChange = vi.fn();
    const card = ProductCard({
      product,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      isActionPending: false,
      actions: {
        menuLabel: "Действия продукта",
        editLabel: "Изменить",
        duplicateLabel: "Дублировать",
        publishLabel: "Опубликовать",
        draftLabel: "В черновик",
        archiveLabel: "В архив",
        onEdit,
        onDuplicate,
        onStatusChange
      }
    });

    const menuItems = findRequiredElementByType(card, ActionMenu).props.items ?? [];
    getArrayItem(menuItems, 0).onSelect();
    getArrayItem(menuItems, 1).onSelect();
    getArrayItem(menuItems, 2).onSelect();
    getArrayItem(menuItems, 3).onSelect();

    expect(onEdit).toHaveBeenCalledWith(product);
    expect(onDuplicate).toHaveBeenCalledWith(product);
    expect(onStatusChange).toHaveBeenCalledWith(product.id, "draft");
    expect(onStatusChange).toHaveBeenCalledWith(product.id, "archived");
  });

  it("disables duplicate and status actions while a product action is pending", () => {
    const draftCard = ProductCard({
      product: createProductWithStatus("draft"),
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      actions: productActions,
      isActionPending: true
    });

    const draftMenuItems = findRequiredElementByType(draftCard, ActionMenu).props.items ?? [];
    expect(getArrayItem(draftMenuItems, 0).disabled).toBe(false);
    expect(getArrayItem(draftMenuItems, 1).disabled).toBe(true);
    expect(getArrayItem(draftMenuItems, 2).disabled).toBe(true);
    expect(getArrayItem(draftMenuItems, 3).disabled).toBe(true);

    const activeCard = ProductCard({
      product: createProductWithStatus("active"),
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      actions: productActions,
      isActionPending: true
    });

    expect(
      getArrayItem(findRequiredElementByType(activeCard, ActionMenu).props.items ?? [], 2).disabled
    ).toBe(true);
  });

  it("renders status action buttons by product status", () => {
    const onStatusChange = vi.fn();

    const draftCard = ProductCard({
      product: createProductWithStatus("draft"),
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      isActionPending: false,
      actions: {
        ...productActions,
        onStatusChange
      }
    });
    const draftItems = findRequiredElementByType(draftCard, ActionMenu).props.items ?? [];
    getArrayItem(draftItems, 2).onSelect();
    getArrayItem(draftItems, 3).onSelect();
    expect(draftItems.map((item) => item.id)).not.toContain("draft");
    expect(onStatusChange).toHaveBeenCalledWith(product.id, "active");
    expect(onStatusChange).toHaveBeenCalledWith(product.id, "archived");

    onStatusChange.mockClear();
    const activeCard = ProductCard({
      product: createProductWithStatus("active"),
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      isActionPending: false,
      actions: {
        ...productActions,
        onStatusChange
      }
    });
    const activeItems = findRequiredElementByType(activeCard, ActionMenu).props.items ?? [];
    getArrayItem(activeItems, 2).onSelect();
    getArrayItem(activeItems, 3).onSelect();
    expect(activeItems.map((item) => item.id)).not.toContain("publish");
    expect(onStatusChange).toHaveBeenCalledWith(product.id, "draft");
    expect(onStatusChange).toHaveBeenCalledWith(product.id, "archived");

    onStatusChange.mockClear();
    const archivedCard = ProductCard({
      product: createProductWithStatus("archived"),
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      isActionPending: false,
      actions: {
        ...productActions,
        onStatusChange
      }
    });
    const archivedItems = findRequiredElementByType(archivedCard, ActionMenu).props.items ?? [];
    getArrayItem(archivedItems, 2).onSelect();
    expect(archivedItems.map((item) => item.id)).not.toContain("archive");
    expect(archivedItems.map((item) => item.id)).not.toContain("publish");
    expect(onStatusChange).toHaveBeenCalledWith(product.id, "draft");
  });

  it("propagates product actions through results to rendered card buttons", () => {
    const onEdit = vi.fn();
    const onDuplicate = vi.fn();
    const onStatusChange = vi.fn();
    const results = ProductsResults({
      products: [
        createProductWithStatus("draft"),
        createProductWithStatus("active"),
        createProductWithStatus("archived")
      ],
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      isActionPending: false,
      actions: {
        menuLabel: "Действия продукта",
        editLabel: "Изменить",
        duplicateLabel: "Дублировать",
        publishLabel: "Опубликовать",
        draftLabel: "В черновик",
        archiveLabel: "В архив",
        onEdit,
        onDuplicate,
        onStatusChange
      },
      isLoading: false,
      isError: false,
      loadingLabel: "Загружаем продукты",
      errorLabel: "Не удалось загрузить продукты",
      emptyLabel: "Нет продуктов в этом статусе"
    });

    const menus = findRenderedElementsByType(results, ActionMenu);
    getArrayItem(getArrayItem(menus, 0).props.items ?? [], 0).onSelect();
    getArrayItem(getArrayItem(menus, 0).props.items ?? [], 1).onSelect();
    getArrayItem(getArrayItem(menus, 0).props.items ?? [], 2).onSelect();
    getArrayItem(getArrayItem(menus, 1).props.items ?? [], 2).onSelect();
    getArrayItem(getArrayItem(menus, 1).props.items ?? [], 3).onSelect();

    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ id: product.id, status: "draft" })
    );
    expect(onDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ id: product.id, status: "draft" })
    );
    expect(onStatusChange).toHaveBeenCalledWith(product.id, "active");
    expect(onStatusChange).toHaveBeenCalledWith(product.id, "draft");
    expect(onStatusChange).toHaveBeenCalledWith(product.id, "archived");
  });

  it("propagates action pending state through results to rendered card buttons", () => {
    const results = ProductsResults({
      products: [createProductWithStatus("draft")],
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      isActionPending: true,
      actions: productActions,
      isLoading: false,
      isError: false,
      loadingLabel: "Загружаем продукты",
      errorLabel: "Не удалось загрузить продукты",
      emptyLabel: "Нет продуктов в этом статусе"
    });

    const menuItems = findRequiredRenderedElementByType(results, ActionMenu).props.items ?? [];
    expect(getArrayItem(menuItems, 1).disabled).toBe(true);
    expect(getArrayItem(menuItems, 2).disabled).toBe(true);
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
    typeOptions.forEach((option) => {
      const icon = getArrayItem(Children.toArray(option.props.children), 0);

      expect(isValidElement(icon) ? icon.type : null).toBe(Icon);
      expect(isValidElement<TestElementProps>(icon) ? icon.props.variant : undefined).toBe(
        "active"
      );
      expect(isValidElement<TestElementProps>(icon) ? icon.props["aria-hidden"] : undefined).toBe(
        "true"
      );
    });
    expect(JSON.stringify(modal.props.children)).toContain("Разовая консультация");

    getArrayItem(typeOptions, 0).props.onClick();
    expect(onSelect).toHaveBeenCalledWith("single");
  });

  it("renders create-flow modals from consolidated flow state", () => {
    const draft = createDefaultProductDraft("single");
    const modalTarget = { nodeType: 1 } as HTMLElement;
    const flow = {
      isTypeModalOpen: true,
      editorDraft: draft,
      editorError: null,
      coverMediaUrl: null,
      isCoverUploading: false,
      coverUploadError: null,
      isSaving: false,
      openTypeSelection: vi.fn(),
      closeTypeSelection: vi.fn(),
      selectType: vi.fn(),
      editProduct: vi.fn(),
      updateDraft: vi.fn(),
      uploadProductCover: vi.fn(),
      removeProductCover: vi.fn(),
      saveDraft: vi.fn(),
      publishDraft: vi.fn(),
      closeEditor: vi.fn(),
      returnToTypeSelection: vi.fn(),
      closeCreateFlow: vi.fn()
    };

    const flowView = ProductsCreateFlow({
      copy: {
        createTypeModal: {
          title: "Выберите тип продукта",
          closeLabel: "Закрыть выбор типа",
          description: "Тип задаст базовые параметры, которые можно изменить в редакторе."
        },
        editor: constructorCopy
      },
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      flow,
      modalTarget
    });

    const typeModal = findRequiredElementByType(flowView, ProductCreateTypeModal);
    expect(typeModal.props.portalTarget).toBe(modalTarget);
    expect(typeModal.props.backdropClassName).toBe(styles.productScopedModalBackdrop);
    typeModal.props.onSelect("single");
    typeModal.props.onClose();
    expect(flow.selectType).toHaveBeenCalledWith("single");
    expect(flow.closeTypeSelection).toHaveBeenCalledOnce();

    const constructorModal = findRequiredElementByType(flowView, ProductConstructorModal);
    expect(constructorModal.props.copy).toBe(constructorCopy);
    expect(constructorModal.props.productCopy).toBe(productCopyByLocale.ru);
    expect(constructorModal.props.locale).toBe("ru");
    expect(constructorModal.props.draft).toBe(draft);
    expect(constructorModal.props.portalTarget).toBe(modalTarget);
    expect(constructorModal.props.backdropClassName).toBe(styles.productScopedModalBackdrop);
    constructorModal.props.onDraftChange(draft);
    constructorModal.props.onSave();
    constructorModal.props.onPublish();
    constructorModal.props.onClose();
    expect(flow.updateDraft).toHaveBeenCalledWith(draft);
    expect(flow.saveDraft).toHaveBeenCalledOnce();
    expect(flow.publishDraft).toHaveBeenCalledOnce();
    expect(flow.closeEditor).toHaveBeenCalledOnce();
  });
});

type TestElementProps = {
  active?: boolean;
  as?: string;
  children?: ReactNode;
  closeLabel?: string;
  className?: string;
  copy?: unknown;
  disabled?: boolean;
  ariaLabel?: string;
  items?: Array<{
    id?: string;
    label: ReactNode;
    isCurrent?: boolean;
    disabled?: boolean;
    onSelect: () => void;
  }>;
  id?: string;
  label?: string;
  onChange: (event: { currentTarget: { value: string } }) => void;
  onClick: () => void;
  onSubmit: (event: { preventDefault: () => void }) => void | Promise<void>;
  product?: unknown;
  productType?: unknown;
  portalTarget?: Element | null;
  backdropClassName?: string;
  startIcon: { props: { iconName?: string }; type: unknown };
  width?: number;
  iconName?: string;
  variant?: string;
  "aria-hidden"?: string;
  title?: string;
  value?: string | number;
  "data-product-create-type"?: string;
  actions?: unknown;
  draft?: unknown;
  locale?: string;
  productCopy?: unknown;
  onClose: () => void;
  onBackToTypeSelection: () => void;
  onCloseCreateFlow: () => void;
  onDraftChange: (draft: unknown) => void;
  onPublish: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSelect: (type: string) => void;
};

function createProductWithStatus(status: ProductStatus): ListProductsResponse["products"][number] {
  return {
    ...product,
    status
  };
}

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

function findRenderedElementsByType(
  root: unknown,
  type: unknown
): Array<{ props: TestElementProps }> {
  const matches: Array<{ props: TestElementProps }> = [];
  visitRenderedElements(root, (element) => {
    if (element.type === type) {
      matches.push(element as { props: TestElementProps });
    }
  });

  return matches;
}

function findRequiredRenderedElementByType(root: unknown, type: unknown) {
  const element = findRenderedElementsByType(root, type)[0];
  if (!element) {
    throw new Error("Expected rendered matching React element");
  }

  return element;
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

function visitRenderedElements(
  root: unknown,
  visitor: (element: ReactElement<TestElementProps>) => void
) {
  if (!isValidElement<TestElementProps>(root)) {
    return;
  }

  visitor(root);

  if (root.type === ActionMenu) {
    return;
  }

  if (typeof root.type === "function") {
    const Component = root.type as (props: TestElementProps) => unknown;
    visitRenderedElements(Component(root.props), visitor);
    return;
  }

  Children.forEach(root.props.children, (child) => {
    visitRenderedElements(child, visitor);
  });
}
