import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { IconPicker } from "@elevenhouse/design-system/components/IconPicker";
import { NumberStepper } from "@elevenhouse/design-system/components/NumberStepper";
import { SelectableTile } from "@elevenhouse/design-system/components/SelectableTile";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProductDraft } from "../../../../features/products/model/productDraft";
import { productCopyByLocale } from "../../../../features/products/model/productCopy";
import { ProductConstructorModal } from "./ProductConstructorModal";

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
  includedItemPlaceholder: "Что получает клиент",
  includedItemIconLabel: "Иконка пункта",
  addIncludedItemLabel: "Добавить пункт",
  removeIncludedItemLabel: "Удалить пункт",
  modifiersLabel: "Модификаторы",
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
    const draft = createDefaultProductDraft("pack");
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
});

type TestElementProps = {
  children?: ReactNode;
  getIconAriaLabel: (iconName: string) => string;
  onChange: (event: { currentTarget: { value: string } }) => void;
  onSubmit: (event: { preventDefault: () => void }) => void | Promise<void>;
  title?: ReactNode;
  "data-product-constructor-form"?: string;
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
