/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Icon } from "../../icons/Icon/index.js";
import { Button } from "../Button/index.js";
import { OtpCodeForm } from "./OtpCodeForm.js";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: (callback: unknown) => callback
}));

const otpCodeFormCss = readFileSync(new URL("./OtpCodeForm.css", import.meta.url), "utf8");

describe("OtpCodeForm", () => {
  it("renders challenge copy and submits the controlled code", () => {
    const onCodeChange = vi.fn();
    const onSubmit = vi.fn();
    const onBack = vi.fn();
    const onResend = vi.fn();
    const form = OtpCodeForm({
      code: "123456",
      maskedIdentifier: "c***@example.com",
      copy: {
        title: "Введите код",
        description: "Мы отправили код на c***@example.com",
        codeLabel: "Код",
        codePlaceholder: "000000",
        submitLabel: "Продолжить",
        backLabel: "Изменить данные",
        changeIdentifierLabel: "Изменить email",
        resendLabel: "Отправить повторно",
        deliveryHint: "Проверьте SMS или сообщения в приложении"
      },
      onBack,
      onCodeChange,
      onResend,
      onSubmit
    });

    const serializedForm = JSON.stringify(form.props.children);
    const codeInput = findElementByProp(form, "name", "otp-code");
    const digitGroup = findElementByClassName(form, "ehOtpCodeForm__digitGroup");
    const digitCells = findElementsByClassName(form, "ehOtpCodeForm__digitCell");
    const backButton = findElementByClassName(form, "ehOtpCodeForm__back");
    const changeIdentifierButton = findElementByClassName(
      form,
      "ehOtpCodeForm__changeIdentifier"
    );
    const title = findElementByClassName(form, "ehOtpCodeForm__title");
    const resendButton = findElementByClassName(form, "ehOtpCodeForm__resend");
    const submitButton = findElementByClassName(form, "ehOtpCodeForm__submit");

    expect(serializedForm).toContain("Введите код");
    expect(serializedForm).toContain("c***@example.com");
    expect(serializedForm).toContain("Проверьте SMS или сообщения в приложении");
    expect(serializedForm).not.toContain("Код обычно приходит в течение 30 секунд");
    expect(title?.type).toBe("p");
    expect(codeInput?.props?.value).toBe("123456");
    expect(digitGroup).not.toBeNull();
    expect(digitCells).toHaveLength(6);
    expect(digitCells.map((cell) => cell.props?.children)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6"
    ]);
    codeInput?.props?.onChange?.({ currentTarget: { value: "987654" } });
    backButton?.props?.onClick?.();
    changeIdentifierButton?.props?.onClick?.();
    resendButton?.props?.onClick?.();
    submitButton?.props?.onClick?.();

    expect(onCodeChange).toHaveBeenCalledWith("987654");
    expect(backButton?.type).toBe(Button);
    expect(backButton?.props?.title).toBe("Изменить данные");
    expect(backButton?.props?.variant).toBe("default");
    expect(backButton?.props?.size).toBe("medium");
    expect(backButton?.props?.startIcon).toMatchObject({
      type: Icon,
      props: {
        iconName: "arrowLeft",
        className: "ehOtpCodeForm__backIcon",
        width: 18,
        height: 18,
        "aria-hidden": true
      }
    });
    expect(changeIdentifierButton?.type).toBe(Button);
    expect(changeIdentifierButton?.props?.title).toBe("Изменить email");
    expect(changeIdentifierButton?.props?.variant).toBe("default");
    expect(changeIdentifierButton?.props?.size).toBe("medium");
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(resendButton?.type).toBe(Button);
    expect(resendButton?.props?.title).toBe("Отправить повторно");
    expect(resendButton?.props?.variant).toBe("default");
    expect(resendButton?.props?.size).toBe("medium");
    expect(resendButton?.props?.startIcon).toMatchObject({
      type: Icon,
      props: {
        iconName: "refresh",
        className: "ehOtpCodeForm__resendIcon",
        width: 20,
        height: 20,
        "aria-hidden": true
      }
    });
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(submitButton?.type).toBe(Button);
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });

  it("submits automatically when code input reaches six digits", () => {
    const onSubmit = vi.fn();
    const form = OtpCodeForm({
      code: "12345",
      maskedIdentifier: "c***@example.com",
      onBack: vi.fn(),
      onCodeChange: vi.fn(),
      onResend: vi.fn(),
      onSubmit
    });

    const codeInput = findElementByProp(form, "name", "otp-code");

    codeInput?.props?.onChange?.({ currentTarget: { value: "123456" } });

    expect(onSubmit).toHaveBeenCalledWith("123456");
  });

  it("renders error and disables actions while submitting", () => {
    const form = OtpCodeForm({
      code: "123",
      maskedIdentifier: "+7******22",
      error: "Неверный код",
      isSubmitting: true,
      onBack: vi.fn(),
      onCodeChange: vi.fn(),
      onResend: vi.fn(),
      onSubmit: vi.fn()
    });

    const serializedForm = JSON.stringify(form.props.children);
    const submitButton = findElementByClassName(form, "ehOtpCodeForm__submit");
    const resendButton = findElementByClassName(form, "ehOtpCodeForm__resend");

    expect(serializedForm).toContain("Неверный код");
    expect(submitButton?.props?.disabled).toBe(true);
    expect(resendButton?.props?.disabled).toBe(true);
  });

  it("renders resend cooldown text on the right side of the resend row", () => {
    const form = OtpCodeForm({
      code: "",
      maskedIdentifier: "c***@example.com",
      resendCooldownLabel: "Повторно через 0:42",
      onBack: vi.fn(),
      onCodeChange: vi.fn(),
      onResend: vi.fn(),
      onSubmit: vi.fn()
    });

    const cooldown = findElementByClassName(form, "ehOtpCodeForm__resendCooldown");

    expect(cooldown?.props?.children).toBe("Повторно через 0:42");
    expect(getCssRule(".ehOtpCodeForm__resendCooldown")).toContain(
      "font-size: var(--eh-font-size-13);"
    );
  });

  it("omits resend cooldown text when there is no cooldown", () => {
    const form = OtpCodeForm({
      code: "",
      maskedIdentifier: "c***@example.com",
      onBack: vi.fn(),
      onCodeChange: vi.fn(),
      onResend: vi.fn(),
      onSubmit: vi.fn()
    });

    expect(findElementByClassName(form, "ehOtpCodeForm__resendCooldown")).toBeNull();
  });

  it("renders empty digit cells without placeholder zeroes", () => {
    const form = OtpCodeForm({
      code: "",
      maskedIdentifier: "c***@example.com",
      onBack: vi.fn(),
      onCodeChange: vi.fn(),
      onResend: vi.fn(),
      onSubmit: vi.fn()
    });

    const digitCells = findElementsByClassName(form, "ehOtpCodeForm__digitCell");

    expect(digitCells).toHaveLength(6);
    expect(digitCells.map((cell) => cell.props?.children)).toEqual([
      "",
      "",
      "",
      "",
      "",
      ""
    ]);
  });

  it("allows the back icon size to be increased while keeping the default size", () => {
    const defaultForm = OtpCodeForm({
      code: "",
      maskedIdentifier: "c***@example.com",
      onBack: vi.fn(),
      onCodeChange: vi.fn(),
      onResend: vi.fn(),
      onSubmit: vi.fn()
    });
    const largerForm = OtpCodeForm({
      code: "",
      maskedIdentifier: "c***@example.com",
      backIconSize: 24,
      onBack: vi.fn(),
      onCodeChange: vi.fn(),
      onResend: vi.fn(),
      onSubmit: vi.fn()
    });

    const defaultBackButton = findElementByClassName(defaultForm, "ehOtpCodeForm__back");
    const largerBackButton = findElementByClassName(largerForm, "ehOtpCodeForm__back");

    expect(defaultBackButton?.props?.startIcon).toMatchObject({
      type: Icon,
      props: {
        iconName: "arrowLeft",
        width: 18,
        height: 18
      }
    });
    expect(defaultBackButton?.props?.style).toBeUndefined();
    expect(largerBackButton?.props?.startIcon).toMatchObject({
      type: Icon,
      props: {
        iconName: "arrowLeft",
        width: 24,
        height: 24
      }
    });
    expect(largerBackButton?.props?.style).toEqual({
      "--eh-otp-code-form-back-icon-size": "24px"
    });
    expect(getCssRule(".ehOtpCodeForm__back")).toContain(
      "--eh-otp-code-form-back-icon-size: 18px;"
    );
    expect(getCssRule(".ehOtpCodeForm__backIcon")).toContain(
      "width: var(--eh-otp-code-form-back-icon-size);"
    );
    expect(getCssRule(".ehOtpCodeForm__back .ehButton__icon svg")).toContain(
      "width: var(--eh-otp-code-form-back-icon-size);"
    );
  });

  it("uses muted reference typography for the resend action", () => {
    expect(getCssRule(".ehOtpCodeForm__resend")).toContain("color: var(--eh-color-moon-500);");
    expect(getCssRule(".ehOtpCodeForm__resend")).toContain(
      "font-size: var(--eh-font-size-15);"
    );
    expect(getCssRule(".ehOtpCodeForm__resend")).toContain("font-weight: 400;");
    expect(getCssRule(".ehOtpCodeForm__resend")).toContain(
      "line-height: var(--eh-line-height-120);"
    );
    expect(getCssRule(".ehOtpCodeForm__resend.ehButton")).toContain("gap: var(--eh-space-10);");
    expect(getCssRule(".ehOtpCodeForm__resendIcon")).toContain("width: 20px;");
    expect(getCssRule(".ehOtpCodeForm__resend .ehButton__icon svg")).toContain("width: 20px;");
    expect(getCssRule(".ehOtpCodeForm__resend.ehButton:hover:not(:disabled)")).toContain(
      "color: var(--eh-color-moon-300);"
    );
  });

  it("uses the registration form title styling for the code form title", () => {
    expect(getCssRule(".ehOtpCodeForm__title")).toContain("margin: 0 0 var(--eh-space-6);");
    expect(getCssRule(".ehOtpCodeForm__title")).toContain("color: var(--eh-color-moon-100);");
    expect(getCssRule(".ehOtpCodeForm__title")).toContain(
      "font-size: var(--eh-font-size-23);"
    );
    expect(getCssRule(".ehOtpCodeForm__title")).toContain(
      "font-weight: var(--eh-font-weight-bold);"
    );
    expect(getCssRule(".ehOtpCodeForm__title")).toContain(
      "line-height: var(--eh-line-height-120);"
    );
    expect(otpCodeFormCss).not.toContain("font-size: 22px;");
  });

  it("uses the registration form description typography for code form helper copy", () => {
    expect(getCssRule(".ehOtpCodeForm__description")).toContain(
      "color: var(--eh-color-muted);"
    );
    expect(getCssRule(".ehOtpCodeForm__description")).toContain(
      "font-size: var(--eh-font-size-13-5);"
    );
    expect(getCssRule(".ehOtpCodeForm__description")).toContain(
      "line-height: var(--eh-line-height-140);"
    );
  });
});

type TestElement = {
  type?: unknown;
  props?: {
    children?: unknown;
    className?: string;
    disabled?: boolean;
    name?: string;
    onChange?: (event: { currentTarget: { value: string } }) => void;
    onClick?: () => void;
    value?: string;
    [key: string]: unknown;
  };
};

function findElementByClassName(node: unknown, className: string): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByClassName(child, className);
      if (match) {
        return match;
      }
    }
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  const element = node as TestElement;
  if (
    typeof element.props?.className === "string" &&
    element.props.className.split(" ").includes(className)
  ) {
    return element;
  }

  const children = element.props?.children;
  const childList = Array.isArray(children) ? children : [children];

  for (const child of childList) {
    const match = findElementByClassName(child, className);
    if (match) {
      return match;
    }
  }

  return null;
}

function findElementsByClassName(node: unknown, className: string): TestElement[] {
  const matches: TestElement[] = [];

  collectElementsByClassName(node, className, matches);

  return matches;
}

function collectElementsByClassName(
  node: unknown,
  className: string,
  matches: TestElement[]
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectElementsByClassName(child, className, matches);
    }
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  const element = node as TestElement;
  if (
    typeof element.props?.className === "string" &&
    element.props.className.split(" ").includes(className)
  ) {
    matches.push(element);
  }

  const children = element.props?.children;
  const childList = Array.isArray(children) ? children : [children];

  for (const child of childList) {
    collectElementsByClassName(child, className, matches);
  }
}

function findElementByProp(node: unknown, propName: string, value: unknown): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByProp(child, propName, value);
      if (match) {
        return match;
      }
    }
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  const element = node as TestElement;
  if (element.props?.[propName] === value) {
    return element;
  }

  const children = element.props?.children;
  const childList = Array.isArray(children) ? children : [children];

  for (const child of childList) {
    const match = findElementByProp(child, propName, value);
    if (match) {
      return match;
    }
  }

  return null;
}

function getCssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, "u").exec(
    otpCodeFormCss
  );

  return match?.groups?.body ?? "";
}
