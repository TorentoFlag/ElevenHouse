import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Button } from "@elevenhouse/design-system/components/Button";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { NumberStepper } from "@elevenhouse/design-system/components/NumberStepper";
import { SelectableTile } from "@elevenhouse/design-system/components/SelectableTile";
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultProductDraft,
  toggleProductAccessGrant
} from "../../../../features/products/model/productDraft";
import { productCopyByLocale } from "../../../../features/products/model/productCopy";
import { ProductConstructorModal } from "./ProductConstructorModal";
import styles from "./ProductConstructorModal.module.css";

const copy = {
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
const defaultCoverUploadProps = {
  isCoverUploading: false,
  coverMediaUrl: null,
  coverUploadError: null,
  onCoverFileSelected: vi.fn(),
  onCoverRemove: vi.fn()
};

describe("ProductConstructorModal", () => {
  it("renders constructor controls and submits draft changes", () => {
    const draft = {
      ...createDefaultProductDraft("pack"),
      title: "Пакет консультаций"
    };
    const onDraftChange = vi.fn();
    const onSave = vi.fn();
    const onClose = vi.fn();

    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft,
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange,
      onSave,
      onPublish: vi.fn(),
      onClose
    });

    expect(findByType(modal, Modal).props.title).toBe(copy.title);
    expect(findAllByType(modal, SelectableTile).length).toBeGreaterThan(12);
    expect(findAllByType(modal, NumberStepper).length).toBeGreaterThan(0);

    const serialized = serializeRendered(modal);
    expect(serialized).toContain("Формат");
    expect(serialized).toContain("Превью");

    findByProp(modal, "data-product-constructor-title").props.onChange({
      currentTarget: { value: "Натальный разбор" }
    });
    expect(onDraftChange).toHaveBeenCalledWith({
      ...draft,
      title: "Натальный разбор"
    });

    const preventDefault = vi.fn();
    findByProp(modal, "data-product-constructor-form").props.onSubmit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();

    expect(serialized).toContain("Авто — из выбранных кубиков");
  });

  it("renders the design-reference fullscreen constructor shell", () => {
    const draft = {
      ...createDefaultProductDraft("custom"),
      title: "Астрография · где жить",
      subtitle: "Где вам будет лучше — по карте мест",
      priceMinor: 790000,
      includedItems: [
        { text: "Разбор натальной карты", icon: "orbit", order: 10 },
        { text: "Анализ карты по городам", icon: "reference", order: 20 }
      ],
      modifiers: [
        {
          label: "PDF-карта / резюме",
          priceMinor: 99000,
          kind: "fixed" as const,
          isEnabled: true,
          createsArtifact: true,
          order: 10
        }
      ]
    };
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft,
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    expect(findByProp(modal, "data-product-constructor-shell").props.className).toContain(
      styles.productConstructorShell
    );
    expect(findByProp(modal, "data-product-constructor-header")).toBeDefined();
    expect(findByProp(modal, "data-product-constructor-editor")).toBeDefined();
    expect(findByProp(modal, "data-product-constructor-preview-panel")).toBeDefined();

    const serialized = serializeRendered(modal);
    expect(serialized).toContain("Продукты");
    expect(serialized).toContain("Создать");
    expect(serialized).toContain("Свой формат");
    expect(serialized).toContain("Обложка и медиа");
    expect(serialized).toContain("Превью · так увидит клиент");
    expect(serialized).toContain("Что получит клиент");
    expect(serialized).toContain("Когда");
    expect(serialized).toContain("Вживую · слот");
    expect(serialized).toContain("Асинхронно · SLA");
    expect(serialized).toContain("Пакет из N");
    expect(serialized).toContain("Бесплатно · лид-магнит");
    expect(serialized).toContain("Объём");
    expect(serialized).toContain("Личная консультация");
    expect(serialized).not.toContain("Сценарий выполнения");
  });

  it("keeps custom products as the full constructor", () => {
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft: createDefaultProductDraft("custom"),
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    const serialized = serializeRendered(modal);

    expect(serialized).toContain("Формат поставки");
    expect(serialized).toContain("Оплата");
    expect(serialized).toContain("Участники");
    expect(serialized).toContain("Метод / система");
    expect(serialized).toContain("Данные от клиента");
    expect(serialized).toContain("Доступ");
    expect(serialized).toContain("Допы · модификаторы");
  });

  it("renders subscription products as a focused scenario instead of the full cube builder", () => {
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft: createDefaultProductDraft("sub"),
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    const serialized = serializeRendered(modal);

    expect(serialized).toContain("Период подписки");
    expect(serialized).toContain("Доступ");
    expect(serialized).toContain("Что входит");
    expect(serialized).not.toContain("Сессий в пакете");
    expect(serialized).not.toContain("Вживую · слот");
    expect(serialized).not.toContain("Метод / система");
    expect(serialized).not.toContain("Допы · модификаторы");
  });

  it("renders bounded accessible AstroDiary settings and blocks an invalid timezone", () => {
    const onDraftChange = vi.fn();
    const diaryDraft = {
      ...toggleProductAccessGrant(createDefaultProductDraft("sub"), "journal"),
      title: "Астродневник"
    };
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft: diaryDraft,
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange,
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    const serialized = serializeRendered(modal);
    expect(serialized).toContain("Настройки астродневника");
    expect(serialized).toContain("Циклов рефлексии за период");
    expect(serialized).toContain("Ответ астролога · рабочих дней");
    expect(serialized).toContain("Окно ответа клиента · календарных дней");
    expect(serialized).toContain("Рабочие дни");
    expect(serialized).toContain("Часовой пояс");
    expect(serialized).not.toContain("Пробный период");
    expect(serialized).not.toContain("Формат поставки");
    expect(serialized).not.toContain("Метод / система");
    expect(serialized).not.toContain("Данные от клиента");
    expect(serialized).not.toContain("Допы · модификаторы");

    findByProp(modal, "data-astro-diary-timezone").props.onChange({
      currentTarget: { value: "Europe/Moscow" }
    });
    expect(onDraftChange).toHaveBeenCalledWith({
      ...diaryDraft,
      astroDiaryConfig: {
        ...diaryDraft.astroDiaryConfig!,
        serviceTimezone: "Europe/Moscow"
      }
    });

    const invalidModal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft: {
        ...diaryDraft,
        astroDiaryConfig: { ...diaryDraft.astroDiaryConfig!, serviceTimezone: "Mars/Olympus" }
      },
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });
    const buttons = findAllByType(invalidModal, Button);
    expect(findByProp(invalidModal, "data-astro-diary-timezone").props["aria-invalid"]).toBe(true);
    expect(
      buttons.find((button) => button.props.title === copy.saveDraftLabel)?.props.disabled
    ).toBe(true);
    expect(buttons.find((button) => button.props.title === "Опубликовать")?.props.disabled).toBe(
      true
    );
  });

  it("renders media, client-facing preview, enabled modifiers and cabinet artifacts", () => {
    const draft = {
      ...createDefaultProductDraft("single"),
      title: "Астрография · где жить",
      subtitle: "Где вам будет лучше — по карте мест",
      priceMinor: 790000,
      deliveryFormats: ["video", "file"] as const,
      methods: ["natal"] as const,
      includedItems: [
        { text: "Запись сессии", icon: "video", order: 10 },
        { text: "Анализ карты по городам", icon: "reference", order: 20 }
      ],
      modifiers: [
        {
          label: "PDF-карта / резюме",
          priceMinor: 99000,
          kind: "fixed" as const,
          isEnabled: true,
          createsArtifact: true,
          order: 10
        },
        {
          label: "Срочно — за 24 часа",
          priceMinor: 150000,
          kind: "fixed" as const,
          isEnabled: true,
          createsArtifact: false,
          order: 20
        }
      ]
    };
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft,
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    expect(findByProp(modal, "data-product-constructor-cover-dropzone")).toBeDefined();
    expect(findByProp(modal, "data-product-constructor-preview-cover")).toBeDefined();
    expect(
      findAllByProp(modal, "data-product-constructor-cabinet-artifact").length
    ).toBeGreaterThan(1);
    expect(findAllByProp(modal, "data-product-constructor-upsell").length).toBe(2);

    const serialized = serializeRendered(modal);
    expect(serialized).toContain("7 900");
    expect(serialized).toContain("Видео + Файл · 60 мин");
    expect(serialized).toContain("PDF-карта / резюме");
    expect(serialized).toContain("+990");
    expect(serialized).toContain("Записаться");
  });

  it("does not save an invalid draft on form submit", () => {
    const onSave = vi.fn();
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft: createDefaultProductDraft("single"),
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange: vi.fn(),
      onSave,
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    findByProp(modal, "data-product-constructor-form").props.onSubmit({
      preventDefault: vi.fn()
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("disables save and publish while a cover upload is in flight", () => {
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft: {
        ...createDefaultProductDraft("single"),
        title: "Натальный разбор"
      },
      isSaving: false,
      ...defaultCoverUploadProps,
      isCoverUploading: true,
      error: null,
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    const buttons = findAllByType(modal, Button);
    expect(
      buttons.find((button) => button.props.title === copy.saveDraftLabel)?.props.disabled
    ).toBe(true);
    expect(buttons.find((button) => button.props.title === "Опубликовать")?.props.disabled).toBe(
      true
    );
  });

  it("disables stale save and publish actions until the product is reloaded", () => {
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft: {
        ...createDefaultProductDraft("single"),
        title: "Натальный разбор"
      },
      isSaving: false,
      ...defaultCoverUploadProps,
      error: "Обновите страницу",
      requiresReload: true,
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    const buttons = findAllByType(modal, Button);
    expect(
      buttons.find((button) => button.props.title === copy.saveDraftLabel)?.props.disabled
    ).toBe(true);
    expect(buttons.find((button) => button.props.title === "Опубликовать")?.props.disabled).toBe(
      true
    );
  });

  it("submits the visible included-item preview composition", () => {
    const onSave = vi.fn();
    const draft = {
      ...createDefaultProductDraft("single"),
      title: "Натальный разбор",
      deliveryFormats: ["video", "file"] as const,
      includedItems: [{ text: "Ручной бонус", icon: "star", order: 30 }]
    };
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft,
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange: vi.fn(),
      onSave,
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    findByProp(modal, "data-product-constructor-form").props.onSubmit({
      preventDefault: vi.fn()
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: "Видео + Файл · 60 мин" }),
        expect.objectContaining({ text: "Запись сессии" }),
        expect.objectContaining({ text: "Ручной бонус" })
      ])
    );
  });

  it("can hide automatic included items and add custom items from the add button", () => {
    const onDraftChange = vi.fn();
    const draft = {
      ...createDefaultProductDraft("single"),
      title: "Натальный разбор"
    };
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft,
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange,
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    findByAriaLabel(modal, "Показывается клиенту: Видео · 60 мин").props.onClick();

    expect(onDraftChange).toHaveBeenCalledWith({
      ...draft,
      hiddenAutoIncludedKeys: ["fmt"]
    });

    findByProp(modal, "data-product-constructor-add-included-button").props.onClick({
      currentTarget: {
        previousElementSibling: {
          value: "Персональный чек-лист"
        }
      }
    });

    expect(onDraftChange).toHaveBeenCalledWith({
      ...draft,
      includedItems: [
        ...draft.includedItems,
        { text: "Персональный чек-лист", icon: "check", order: 30 }
      ]
    });
  });

  it("does not deselect the only selected delivery format", () => {
    const draft = {
      ...createDefaultProductDraft("single"),
      deliveryFormats: ["video" as const]
    };
    const onDraftChange = vi.fn();
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft,
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange,
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    const selectedDeliveryFormat = findAllByType(modal, SelectableTile).find(
      (tile) => tile.props.label === productCopyByLocale.ru.deliveryFormats.video.label
    );
    expect(selectedDeliveryFormat).toBeDefined();

    selectedDeliveryFormat?.props.onClick();

    expect(onDraftChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryFormats: []
      })
    );
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("keeps product type selection outside the full constructor surface", () => {
    const draft = {
      ...createDefaultProductDraft("single"),
      title: "Личный прогноз",
      subtitle: "Описание",
      priceMinor: 620000,
      coverMediaId: "cover-media-id",
      introVideoUrl: "https://example.com/intro"
    };
    const onDraftChange = vi.fn();
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft,
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange,
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    const serialized = serializeRendered(modal);
    expect(serialized).toContain(productCopyByLocale.ru.types.single.label);
    expect(serialized).not.toContain(productCopyByLocale.ru.types.sub.description);
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("uses dedicated modifier rows and accessible labels for dynamic controls", () => {
    const draft = {
      ...createDefaultProductDraft("single"),
      title: "Натальный разбор",
      modifiers: [
        {
          label: "Срочность",
          priceMinor: 90000,
          kind: "fixed" as const,
          isEnabled: true,
          createsArtifact: false,
          order: 10
        }
      ]
    };
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft,
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    const modifierRow = findByProp(modal, "data-product-constructor-modifier-row");
    expect(modifierRow.props.className).toContain(styles.constructorModifierRow);

    expect(findByAriaLabel(modal, copy.includedItemTextLabel).props.value).toBe(
      draft.includedItems[0]?.text
    );
    expect(findByAriaLabel(modal, `${copy.modifierLabelLabel}: Срочность`).props.value).toBe(
      "Срочность"
    );
    expect(findByAriaLabel(modal, `${copy.modifierPriceLabel}: Срочность`).props.value).toBe("900");

    expect(
      findByAriaLabel(modal, `${copy.modifierKindLabel}: ${copy.modifierFixedLabel} · Срочность`)
    ).toBeDefined();
    expect(
      findByAriaLabel(modal, `${copy.modifierKindLabel}: ${copy.modifierPercentLabel} · Срочность`)
    ).toBeDefined();
    expect(
      findByAriaLabel(modal, `${copy.modifierKindLabel}: ${copy.modifierFreeLabel} · Срочность`)
    ).toBeDefined();

    expect(findByAriaLabel(modal, `${copy.removeModifierLabel}: Срочность`)).toBeDefined();
  });

  it("edits percent modifiers as whole percentages instead of money minor units", () => {
    const draft = {
      ...createDefaultProductDraft("single"),
      title: "Натальный разбор",
      modifiers: [
        {
          label: "Скидка",
          priceMinor: 15,
          kind: "percent" as const,
          isEnabled: true,
          createsArtifact: false,
          order: 10
        }
      ]
    };
    const onDraftChange = vi.fn();
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft,
      isSaving: false,
      ...defaultCoverUploadProps,
      error: null,
      onDraftChange,
      onSave: vi.fn(),
      onPublish: vi.fn(),
      onClose: vi.fn()
    });

    expect(findByAriaLabel(modal, `${copy.modifierPriceLabel}: Скидка`).props.value).toBe("15");

    findByAriaLabel(modal, `${copy.modifierPriceLabel}: Скидка`).props.onChange({
      currentTarget: { value: "25" }
    });

    expect(onDraftChange).toHaveBeenCalledWith({
      ...draft,
      modifiers: [
        {
          ...draft.modifiers[0],
          priceMinor: 25
        }
      ]
    });
  });
});

type TestElementProps = {
  className?: string;
  children?: ReactNode;
  getIconAriaLabel: (iconName: string) => string;
  label?: ReactNode;
  onChange: (event: { currentTarget: { value: string } }) => void;
  onClick: (event?: {
    currentTarget?: {
      previousElementSibling?: {
        value: string;
      };
    };
  }) => void;
  onSubmit: (event: { preventDefault: () => void }) => void | Promise<void>;
  title?: ReactNode;
  value?: string | number;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "data-astro-diary-timezone"?: string;
  "data-product-constructor-add-included-button"?: string;
  "data-product-constructor-add-included-input"?: string;
  "data-product-constructor-cabinet-artifact"?: string;
  "data-product-constructor-cover-dropzone"?: string;
  "data-product-constructor-editor"?: string;
  "data-product-constructor-form"?: string;
  "data-product-constructor-header"?: string;
  "data-product-constructor-modifier-row"?: string;
  "data-product-constructor-preview-cover"?: string;
  "data-product-constructor-preview-panel"?: string;
  "data-product-constructor-shell"?: string;
  "data-product-constructor-title"?: string;
  "data-product-constructor-upsell"?: string;
};

function findByType(root: unknown, type: unknown) {
  const element = findAllByType(root, type)[0];
  if (!element) {
    throw new Error("Expected matching React element");
  }

  return element;
}

function findAllByType(root: unknown, type: unknown): Array<{ props: TestElementProps }> {
  const matches: Array<{ props: TestElementProps }> = [];
  visitElements(root, (element) => {
    if (element.type === type) {
      matches.push(element as { props: TestElementProps });
    }
  });

  return matches;
}

function findByProp(root: unknown, propName: keyof TestElementProps) {
  const element = findAllByProp(root, propName)[0];
  if (!element) {
    throw new Error(`Expected React element with ${String(propName)}`);
  }

  return element;
}

function findByAriaLabel(root: unknown, label: string) {
  const element = findAllByProp(root, "aria-label").find(
    (currentElement) => currentElement.props["aria-label"] === label
  );
  if (!element) {
    throw new Error(`Expected React element with aria-label ${label}`);
  }

  return element;
}

function findAllByProp(
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

function visitElements(root: unknown, visitor: (element: ReactElement<TestElementProps>) => void) {
  const renderedRoot = renderProductConstructorComponents(root);

  if (!isValidElement<TestElementProps>(renderedRoot)) {
    return;
  }

  visitor(renderedRoot);

  Children.forEach(renderedRoot.props.children, (child) => {
    visitElements(child, visitor);
  });
}

function serializeRendered(root: unknown): string {
  return JSON.stringify(renderProductConstructorComponents(root));
}

function renderProductConstructorComponents(root: unknown): unknown {
  if (!isValidElement<TestElementProps>(root)) {
    return root;
  }

  if (typeof root.type === "function" && shouldRenderProductConstructorComponent(root.type.name)) {
    const component = root.type as (props: TestElementProps) => ReactElement<TestElementProps>;

    return renderProductConstructorComponents(component(root.props));
  }

  const children = Children.map(root.props.children, (child) =>
    renderProductConstructorComponents(child)
  );

  if (!children) {
    return root;
  }

  return {
    ...root,
    props: {
      ...root.props,
      children
    }
  };
}

function shouldRenderProductConstructorComponent(componentName: string): boolean {
  return (
    componentName.startsWith("ProductConstructor") ||
    componentName.endsWith("Section") ||
    componentName === "BasicProductSections" ||
    componentName === "ConstructorOptionGroup" ||
    componentName === "SectionHeading" ||
    componentName === "LabeledStepper"
  );
}
