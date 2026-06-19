import { describe, expect, it, vi } from "vitest";
import { OtpAuthForm } from "./OtpAuthForm.js";

describe("OtpAuthForm", () => {
  it("renders the shared otp auth form shell", () => {
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "", phone: "" },
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    expect(form.type).toBe("div");
    expect(form.props.className).toBe("ehOtpAuthForm");
    expect(JSON.stringify(form.props.children)).toContain("Создать аккаунт");
  });

  it("allows app-specific copy", () => {
    const form = OtpAuthForm({
      mode: "login",
      values: { email: "", name: "", phone: "" },
      copy: {
        loginTitle: "Войти в кабинет"
      },
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    expect(JSON.stringify(form.props.children)).toContain("Войти в кабинет");
  });

  it("renders name validation error", () => {
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "А", phone: "" },
      nameError: "Имя должно быть от 2 до 200 символов",
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    expect(JSON.stringify(form.props.children)).toContain("Имя должно быть от 2 до 200 символов");
  });

  it("submits controlled values", () => {
    const onSubmit = vi.fn();
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "user@example.com", name: "Анна", phone: "+7" },
      onModeChange: vi.fn(),
      onValuesChange: vi.fn(),
      onSubmit
    });

    const submitButton = findElementByClassName(form, "ehOtpAuthForm__submit");
    submitButton.props.onClick();

    expect(onSubmit).toHaveBeenCalledWith(
      { email: "user@example.com", name: "Анна", phone: "+7" },
      "register"
    );
  });
});

function findElementByClassName(node: unknown, className: string): any {
  if (!node || typeof node !== "object") {
    return null;
  }

  const element = node as any;
  if (element.props?.className === className) {
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
