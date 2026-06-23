/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../Button/index.js";
import { Refresh } from "../../icons/Refresh/index.js";
import { OtpCodeForm } from "./OtpCodeForm.js";

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
        helpText: "Код обычно приходит в течение 30 секунд",
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
    const changeIdentifierButton = findElementByClassName(
      form,
      "ehOtpCodeForm__changeIdentifier"
    );
    const resendButton = findElementByClassName(form, "ehOtpCodeForm__resend");
    const submitButton = findElementByClassName(form, "ehOtpCodeForm__submit");

    expect(serializedForm).toContain("Введите код");
    expect(serializedForm).toContain("c***@example.com");
    expect(serializedForm).toContain("Код обычно приходит в течение 30 секунд");
    expect(serializedForm).toContain("Проверьте SMS или сообщения в приложении");
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
    changeIdentifierButton?.props?.onClick?.();
    resendButton?.props?.onClick?.();
    submitButton?.props?.onClick?.();

    expect(onCodeChange).toHaveBeenCalledWith("987654");
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(resendButton?.type).toBe(Button);
    expect(resendButton?.props?.title).toBe("Отправить повторно");
    expect(resendButton?.props?.variant).toBe("default");
    expect(resendButton?.props?.size).toBe("small");
    expect(resendButton?.props?.startIcon).toMatchObject({
      type: Refresh,
      props: {
        className: "ehOtpCodeForm__resendIcon",
        width: 26,
        height: 26,
        "aria-hidden": true
      }
    });
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(submitButton?.type).toBe(Button);
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });

  it("renders error and disables actions while submitting", () => {
    const form = OtpCodeForm({
      code: "123",
      maskedIdentifier: "+79***22",
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

  it("uses muted reference typography for the resend action", () => {
    expect(getCssRule(".ehOtpCodeForm__resend")).toContain("color: var(--eh-color-moon-500);");
    expect(getCssRule(".ehOtpCodeForm__resend")).toContain(
      "font-size: var(--eh-font-size-23);"
    );
    expect(getCssRule(".ehOtpCodeForm__resend")).toContain("font-weight: 400;");
    expect(getCssRule(".ehOtpCodeForm__resend")).toContain(
      "line-height: var(--eh-line-height-120);"
    );
    expect(getCssRule(".ehOtpCodeForm__resend.ehButton")).toContain("gap: var(--eh-space-16);");
    expect(getCssRule(".ehOtpCodeForm__resend.ehButton:hover:not(:disabled)")).toContain(
      "color: var(--eh-color-moon-300);"
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
