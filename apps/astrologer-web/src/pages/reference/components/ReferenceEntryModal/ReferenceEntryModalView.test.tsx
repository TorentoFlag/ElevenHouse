import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Children, isValidElement, type ReactElement } from "react";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { Check } from "@elevenhouse/design-system/icons/Check";
import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import { describe, expect, it, vi } from "vitest";
import {
  ReferenceEntryModalView,
  type ReferenceEntryModalCopy,
  type ReferenceEntryModalDraft
} from "./ReferenceEntryModalView";
import styles from "./ReferenceEntryModal.module.css";

const modalCss = readFileSync(
  fileURLToPath(new URL("./ReferenceEntryModal.module.css", import.meta.url)),
  "utf8"
);

const copy = {
  title: "Новая трактовка",
  closeLabel: "Закрыть",
  createTitle: "Новая трактовка",
  editTitle: "Редактировать трактовку",
  createCloseLabel: "Закрыть модалку добавления трактовки",
  editCloseLabel: "Закрыть модалку редактирования трактовки",
  categoryLabel: "Категория",
  titleLabel: "Название",
  titlePlaceholder: "Напр. Солнце в Овне",
  contentLabel: "Текст трактовки",
  contentPlaceholder: "Ваша трактовка...",
  aiDraftLabel: "AI-черновик",
  aiDraftTitle: "AI набросает черновик по заголовку — отредактируйте под свой стиль",
  cancelLabel: "Отмена",
  saveLabel: "Сохранить",
  savingLabel: "Сохраняем",
  genericError: "Не удалось сохранить трактовку",
  aiDraftTemplate: "Черновик для «{title}»: опишите проявления положения.",
  validation: {
    categoryRequired: "Выберите категорию",
    titleRequired: "Введите название",
    titleMaxLength: "Название не должно быть длиннее {max} символов",
    contentRequired: "Введите текст трактовки",
    contentMaxLength: "Текст не должен быть длиннее {max} символов"
  }
} satisfies ReferenceEntryModalCopy;

const categories = [
  {
    id: "8e14390f-3db1-4d1c-9344-55679c778427",
    code: "planets_in_signs",
    name: "Планеты в знаках",
    order: 10,
    count: 4,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z"
  },
  {
    id: "3f925316-1b0e-47c8-a41e-91796f321acb",
    code: "planets_in_houses",
    name: "Планеты в домах",
    order: 20,
    count: 3,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z"
  }
];

describe("ReferenceEntryModalView", () => {
  it("renders a controlled add-entry form inside the shared modal", () => {
    const draft = {
      categoryId: categories[0]?.id ?? "",
      title: "Венера в Близнецах",
      content: "Любовь становится легкой, живой и связанной с общением."
    } satisfies ReferenceEntryModalDraft;
    const onClose = vi.fn();
    const onDraftChange = vi.fn();
    const onSubmit = vi.fn();
    const onCreateAiDraft = vi.fn();

    const view = ReferenceEntryModalView({
      copy,
      categories,
      draft,
      isCategoryEditable: true,
      canSubmit: true,
      isSaving: false,
      fieldErrors: {},
      errorMessage: null,
      onClose,
      onDraftChange,
      onSubmit,
      onCreateAiDraft
    });

    expect(view.type).toBe(Modal);
    expect(view.props.title).toBe("Новая трактовка");
    expect(view.props.closeLabel).toBe("Закрыть");
    expect(view.props.onClose).toBe(onClose);

    const form = findRequiredElementByDataAttribute(view, "data-reference-entry-modal-form");
    expect(form.props.onSubmit).toBeDefined();
    form.props.onSubmit({ preventDefault: vi.fn() });
    expect(onSubmit).toHaveBeenCalled();

    const categoryButtons = findElementsByDataAttribute(
      view,
      "data-reference-entry-modal-category-id"
    );
    expect(categoryButtons.map((button) => button.type)).toEqual([Chip, Chip]);
    expect(categoryButtons.map((button) => button.props.label)).toEqual([
      "Планеты в знаках",
      "Планеты в домах"
    ]);
    expect(categoryButtons.map((button) => button.props.active)).toEqual([true, false]);
    expect(categoryButtons.map((button) => button.props.disabled)).toEqual([false, false]);
    categoryButtons[1]?.props.onClick();
    expect(onDraftChange).toHaveBeenCalledWith(
      {
        ...draft,
        categoryId: categories[1]?.id
      },
      "categoryId"
    );

    const titleInput = findRequiredElementByDataAttribute(view, "data-reference-entry-modal-title");
    expect(titleInput.props.value).toBe("Венера в Близнецах");
    expect(titleInput.props.placeholder).toBe("Напр. Солнце в Овне");
    titleInput.props.onChange({ currentTarget: { value: "Марс в Овне" } });
    expect(onDraftChange).toHaveBeenCalledWith(
      {
        ...draft,
        title: "Марс в Овне"
      },
      "title"
    );

    const contentInput = findRequiredElementByDataAttribute(
      view,
      "data-reference-entry-modal-content"
    );
    expect(contentInput.props.value).toBe(
      "Любовь становится легкой, живой и связанной с общением."
    );
    contentInput.props.onChange({ currentTarget: { value: "Новый текст" } });
    expect(onDraftChange).toHaveBeenCalledWith(
      {
        ...draft,
        content: "Новый текст"
      },
      "content"
    );

    const aiButton = findRequiredElementByDataAttribute(view, "data-reference-entry-modal-ai");
    expect(aiButton.type).toBe("button");
    expect(aiButton.props.className).toBe(styles.aiDraftButton);
    expect(aiButton.props.title).toBe(
      "AI набросает черновик по заголовку — отредактируйте под свой стиль"
    );
    expect(findRequiredElementByType(aiButton, Sparkle).props.width).toBe(12);
    expect(JSON.stringify(aiButton.props.children)).toContain("AI-черновик");
    aiButton.props.onClick();
    expect(onCreateAiDraft).toHaveBeenCalled();

    const cancelButton = findRequiredElementByDataAttribute(
      view,
      "data-reference-entry-modal-cancel"
    );
    cancelButton.props.onClick();
    expect(onClose).toHaveBeenCalled();

    const submitButton = findRequiredElementByDataAttribute(
      view,
      "data-reference-entry-modal-submit"
    );
    expect(submitButton.props.disabled).toBe(false);
    expect(submitButton.props.title).toBe("Сохранить");
    expect(submitButton.props.className).toBe(styles.submitButton);
    expect(submitButton.props.startIcon.type).toBe(Check);
  });

  it("matches the design footer layout with a flexible primary action", () => {
    const footerRule = getCssRule(".footer");
    const submitButtonRule = getCssRule(".submitButton");

    expect(footerRule).toContain("display: flex;");
    expect(footerRule).toContain("gap: 9px;");
    expect(footerRule).not.toContain("justify-content: flex-end;");
    expect(submitButtonRule).toContain("flex: 1;");
    expect(submitButtonRule).toContain("min-width: 0;");
  });

  it("disables category chips when the category is not editable", () => {
    const draft = {
      categoryId: categories[0]?.id ?? "",
      title: "Венера в Близнецах",
      content: "Любовь становится легкой, живой и связанной с общением."
    } satisfies ReferenceEntryModalDraft;
    const onDraftChange = vi.fn();

    const view = ReferenceEntryModalView({
      copy,
      categories,
      draft,
      isCategoryEditable: false,
      canSubmit: true,
      isSaving: false,
      fieldErrors: {},
      errorMessage: null,
      onClose: vi.fn(),
      onDraftChange,
      onSubmit: vi.fn(),
      onCreateAiDraft: vi.fn()
    });

    const categoryButtons = findElementsByDataAttribute(
      view,
      "data-reference-entry-modal-category-id"
    );

    expect(categoryButtons.map((button) => button.props.disabled)).toEqual([true, true]);
    categoryButtons[1]?.props.onClick();
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("keeps the AI draft action outside the textarea label boundary", () => {
    const view = ReferenceEntryModalView({
      copy,
      categories,
      draft: {
        categoryId: categories[0]?.id ?? "",
        title: "Луна в Раке",
        content: ""
      },
      isCategoryEditable: true,
      canSubmit: false,
      isSaving: false,
      fieldErrors: {},
      errorMessage: null,
      onClose: vi.fn(),
      onDraftChange: vi.fn(),
      onSubmit: vi.fn(),
      onCreateAiDraft: vi.fn()
    });

    const contentPath = findRequiredElementPathByDataAttribute(
      view,
      "data-reference-entry-modal-content"
    );
    const contentInput = contentPath.at(-1);
    const contentLabel =
      [...contentPath].reverse().find((element) => element.type === "label") ??
      findAllElements(view).find(
        (element) => element.type === "label" && element.props.htmlFor === contentInput?.props.id
      );

    expect(contentLabel).toBeDefined();
    expect(findElementsByDataAttribute(contentLabel, "data-reference-entry-modal-ai")).toHaveLength(
      0
    );
  });

  it("disables submit while the draft is invalid or saving", () => {
    const view = ReferenceEntryModalView({
      copy,
      categories,
      draft: {
        categoryId: "",
        title: "",
        content: ""
      },
      isCategoryEditable: true,
      canSubmit: false,
      isSaving: true,
      fieldErrors: {},
      errorMessage: "Сервер недоступен",
      onClose: vi.fn(),
      onDraftChange: vi.fn(),
      onSubmit: vi.fn(),
      onCreateAiDraft: vi.fn()
    });

    expect(JSON.stringify(view.props.children)).toContain("Сервер недоступен");

    const submitButton = findRequiredElementByDataAttribute(
      view,
      "data-reference-entry-modal-submit"
    );
    expect(submitButton.props.disabled).toBe(true);
    expect(submitButton.props.title).toBe("Сохраняем");
  });

  it("renders localized validation helper text and exposes it to assistive technology", () => {
    const view = ReferenceEntryModalView({
      copy,
      categories,
      draft: {
        categoryId: "",
        title: "",
        content: ""
      },
      isCategoryEditable: true,
      canSubmit: false,
      isSaving: false,
      fieldErrors: {
        categoryId: "Выберите категорию",
        title: "Введите название",
        content: "Введите текст трактовки"
      },
      errorMessage: null,
      onClose: vi.fn(),
      onDraftChange: vi.fn(),
      onSubmit: vi.fn(),
      onCreateAiDraft: vi.fn()
    });

    expect(JSON.stringify(view.props.children)).toContain("Выберите категорию");
    expect(JSON.stringify(view.props.children)).toContain("Введите название");
    expect(JSON.stringify(view.props.children)).toContain("Введите текст трактовки");

    const titleInput = findRequiredElementByDataAttribute(view, "data-reference-entry-modal-title");
    const contentInput = findRequiredElementByDataAttribute(
      view,
      "data-reference-entry-modal-content"
    );

    expect(titleInput.props["aria-invalid"]).toBe(true);
    expect(titleInput.props["aria-describedby"]).toBe("reference-entry-modal-title-error");
    expect(contentInput.props["aria-invalid"]).toBe(true);
    expect(contentInput.props["aria-describedby"]).toBe("reference-entry-modal-content-error");
  });

  it("keeps validation helper text hidden until the container decides errors are visible", () => {
    const view = ReferenceEntryModalView({
      copy,
      categories,
      draft: {
        categoryId: "",
        title: "",
        content: ""
      },
      isCategoryEditable: true,
      canSubmit: false,
      isSaving: false,
      fieldErrors: {},
      errorMessage: null,
      onClose: vi.fn(),
      onDraftChange: vi.fn(),
      onSubmit: vi.fn(),
      onCreateAiDraft: vi.fn()
    });

    expect(JSON.stringify(view.props.children)).not.toContain("Введите название");

    const titleInput = findRequiredElementByDataAttribute(view, "data-reference-entry-modal-title");
    const contentInput = findRequiredElementByDataAttribute(
      view,
      "data-reference-entry-modal-content"
    );

    expect(titleInput.props["aria-invalid"]).toBeUndefined();
    expect(titleInput.props["aria-describedby"]).toBeUndefined();
    expect(contentInput.props["aria-invalid"]).toBeUndefined();
    expect(contentInput.props["aria-describedby"]).toBeUndefined();
  });
});

type TestElementProps = {
  "aria-pressed"?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  children?: unknown;
  closeLabel?: string;
  disabled?: boolean;
  className?: string;
  htmlFor?: string;
  id?: string;
  "data-reference-entry-modal-ai"?: string;
  "data-reference-entry-modal-cancel"?: string;
  "data-reference-entry-modal-category-id"?: string;
  "data-reference-entry-modal-content"?: string;
  "data-reference-entry-modal-form"?: string;
  "data-reference-entry-modal-submit"?: string;
  "data-reference-entry-modal-title"?: string;
  active?: boolean;
  label?: string;
  onChange: (event: { currentTarget: { value: string } }) => void;
  onClick: () => void;
  onClose?: () => void;
  onSubmit: (event: { preventDefault: () => void }) => void;
  placeholder?: string;
  startIcon: { type: unknown };
  title?: string;
  value?: string;
  width?: number;
};

function findRequiredElementByType(root: unknown, type: unknown) {
  const element = findAllElements(root).find((candidate) => candidate.type === type);
  if (!element) {
    throw new Error("Expected matching element type");
  }

  return element;
}

function findAllElements(root: unknown) {
  const matches: Array<ReactElement<TestElementProps>> = [];

  visitElements(root, (element) => matches.push(element));

  return matches;
}

function findRequiredElementByDataAttribute(root: unknown, attribute: keyof TestElementProps) {
  const element = findElementsByDataAttribute(root, attribute)[0];
  if (!element) {
    throw new Error(`Expected element with ${attribute}`);
  }

  return element;
}

function findRequiredElementPathByDataAttribute(root: unknown, attribute: keyof TestElementProps) {
  const path = findElementPathByDataAttribute(root, attribute);
  if (!path) {
    throw new Error(`Expected element path with ${attribute}`);
  }

  return path;
}

function findElementPathByDataAttribute(
  root: unknown,
  attribute: keyof TestElementProps,
  path: Array<ReactElement<TestElementProps>> = []
): Array<ReactElement<TestElementProps>> | null {
  if (!isValidElement<TestElementProps>(root)) {
    return null;
  }

  const nextPath = [...path, root];

  if (root.props[attribute]) {
    return nextPath;
  }

  let result: Array<ReactElement<TestElementProps>> | null = null;
  Children.forEach(root.props.children, (child) => {
    if (!result) {
      result = findElementPathByDataAttribute(child, attribute, nextPath);
    }
  });

  return result;
}

function findElementsByDataAttribute(root: unknown, attribute: keyof TestElementProps) {
  const matches: Array<ReactElement<TestElementProps>> = [];

  visitElements(root, (element) => {
    if (element.props[attribute]) {
      matches.push(element);
    }
  });

  return matches;
}

function visitElements(root: unknown, visitor: (element: ReactElement<TestElementProps>) => void) {
  if (!isValidElement<TestElementProps>(root)) {
    return;
  }

  visitor(root);
  Children.forEach(root.props.children, (child) => visitElements(child, visitor));
}

function getCssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`).exec(modalCss);

  if (!match?.groups?.body) {
    throw new Error(`Expected CSS rule for ${selector}`);
  }

  return match.groups.body;
}
