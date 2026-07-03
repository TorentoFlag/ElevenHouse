import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { IconPicker } from "@elevenhouse/design-system/components/IconPicker";
import { NumberStepper } from "@elevenhouse/design-system/components/NumberStepper";
import { SelectableTile } from "@elevenhouse/design-system/components/SelectableTile";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProductDraft } from "../../../../features/products/model/productDraft";
import { productCopyByLocale } from "../../../../features/products/model/productCopy";
import { ProductConstructorModal } from "./ProductConstructorModal";
import styles from "../../ProductsPage.module.css";

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
  formatLabel: "Формат",
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
  requiredClientDataLabel: "Данные клиента",
  methodsLabel: "Методы",
  accessGrantsLabel: "Доступы",
  includedItemsLabel: "Что входит",
  includedItemTextLabel: "Текст пункта",
  includedItemPlaceholder: "Что получает клиент",
  includedItemIconLabel: "Иконка пункта",
  addIncludedItemLabel: "Добавить пункт",
  removeIncludedItemLabel: "Удалить пункт",
  modifiersLabel: "Модификаторы",
  modifierKindLabel: "Тип модификатора",
  modifierFixedLabel: "Фиксированная цена",
  modifierPercentLabel: "Процент",
  modifierFreeLabel: "Бесплатно",
  modifierLabelLabel: "Название модификатора",
  modifierLabelPlaceholder: "Название модификатора",
  modifierPriceLabel: "Цена модификатора",
  addModifierLabel: "Добавить модификатор",
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
    chat: "Чат",
    content: "Контент",
    flow: "Поток",
    box: "Коробка",
    wallet: "Кошелек",
    orbit: "Орбита",
    reference: "Справочник",
    verified: "Проверено",
    refresh: "Обновить"
  }
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
      error: null,
      onDraftChange,
      onSave,
      onClose
    });

    expect(findByType(modal, Modal).props.title).toBe(copy.title);
    expect(findAllByType(modal, SelectableTile).length).toBeGreaterThan(12);
    expect(findAllByType(modal, NumberStepper).length).toBeGreaterThan(0);
    expect(findAllByType(modal, IconPicker).length).toBeGreaterThan(0);

    const serialized = JSON.stringify(modal.props.children);
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

    const firstIconPicker = findAllByType(modal, IconPicker)[0];
    expect(firstIconPicker?.props.getIconAriaLabel("check")).toBe("Галочка");
  });

  it("does not save an invalid draft on form submit", () => {
    const onSave = vi.fn();
    const modal = ProductConstructorModal({
      copy,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      draft: createDefaultProductDraft("single"),
      isSaving: false,
      error: null,
      onDraftChange: vi.fn(),
      onSave,
      onClose: vi.fn()
    });

    findByProp(modal, "data-product-constructor-form").props.onSubmit({
      preventDefault: vi.fn()
    });

    expect(onSave).not.toHaveBeenCalled();
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
      error: null,
      onDraftChange,
      onSave: vi.fn(),
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

  it("switches product type by applying next type defaults and preserving basic fields", () => {
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
      error: null,
      onDraftChange,
      onSave: vi.fn(),
      onClose: vi.fn()
    });

    findAllByType(modal, SelectableTile).find(
      (tile) => tile.props.label === productCopyByLocale.ru.types.sub.label
    )?.props.onClick();

    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sub",
        paymentModel: "sub",
        subscriptionPeriod: "month",
        deliveryFormats: ["channel"],
        title: draft.title,
        subtitle: draft.subtitle,
        priceMinor: draft.priceMinor,
        currency: draft.currency,
        coverMediaId: draft.coverMediaId,
        introVideoUrl: draft.introVideoUrl
      })
    );
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
      error: null,
      onDraftChange: vi.fn(),
      onSave: vi.fn(),
      onClose: vi.fn()
    });

    const modifierRow = findByProp(modal, "data-product-constructor-modifier-row");
    expect(modifierRow.props.className).toContain(styles.constructorModifierRow);

    expect(findByAriaLabel(modal, copy.includedItemTextLabel).props.value).toBe(
      draft.includedItems[0]?.text
    );
    expect(findByAriaLabel(modal, copy.modifierLabelLabel).props.value).toBe("Срочность");
    expect(findByAriaLabel(modal, copy.modifierPriceLabel).props.value).toBe("900");

    expect(findByAriaLabel(modal, `${copy.modifierKindLabel}: ${copy.modifierFixedLabel}`)).toBeDefined();
    expect(findByAriaLabel(modal, `${copy.modifierKindLabel}: ${copy.modifierPercentLabel}`)).toBeDefined();
    expect(findByAriaLabel(modal, `${copy.modifierKindLabel}: ${copy.modifierFreeLabel}`)).toBeDefined();
  });
});

type TestElementProps = {
  className?: string;
  children?: ReactNode;
  getIconAriaLabel: (iconName: string) => string;
  label?: ReactNode;
  onChange: (event: { currentTarget: { value: string } }) => void;
  onClick: () => void;
  onSubmit: (event: { preventDefault: () => void }) => void | Promise<void>;
  title?: ReactNode;
  value?: string | number;
  "aria-label"?: string;
  "data-product-constructor-form"?: string;
  "data-product-constructor-modifier-row"?: string;
  "data-product-constructor-title"?: string;
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
  if (!isValidElement<TestElementProps>(root)) {
    return;
  }

  visitor(root);

  Children.forEach(root.props.children, (child) => {
    visitElements(child, visitor);
  });
}
