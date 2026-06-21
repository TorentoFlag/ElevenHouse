import { describe, expect, it, vi } from "vitest";
import { Button } from "../Button/index.js";
import { OtpCodeForm } from "./OtpCodeForm.js";

describe("OtpCodeForm", () => {
  it("renders challenge copy and submits the controlled code", () => {
    const onCodeChange = vi.fn();
    const onSubmit = vi.fn();
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
        resendLabel: "Отправить повторно"
      },
      onBack: vi.fn(),
      onCodeChange,
      onResend: vi.fn(),
      onSubmit
    });

    const serializedForm = JSON.stringify(form.props.children);
    const codeInput = findElementByProp(form, "name", "otp-code");
    const submitButton = findElementByClassName(form, "ehOtpCodeForm__submit");

    expect(serializedForm).toContain("Введите код");
    expect(serializedForm).toContain("c***@example.com");
    expect(codeInput?.props?.value).toBe("123456");
    codeInput?.props?.onChange?.({ currentTarget: { value: "987654" } });
    submitButton?.props?.onClick?.();

    expect(onCodeChange).toHaveBeenCalledWith("987654");
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
