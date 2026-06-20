import { describe, expect, it } from "vitest";
import { clientCopyByLocale } from "./clientCopy";

describe("clientCopyByLocale", () => {
  it("contains translated auth copy for launch locales", () => {
    expect(clientCopyByLocale.ru.auth.documentTitle).toBe("ElevenHouse | Авторизация");
    expect(clientCopyByLocale.en.auth.documentTitle).toBe("ElevenHouse | Sign in");
    expect(clientCopyByLocale.ru.auth.form.registerTitle).toBe("Создать аккаунт");
    expect(clientCopyByLocale.en.auth.form.registerTitle).toBe("Create account");
    expect(clientCopyByLocale.ru.auth.validation.email).toBe("Введите корректный email");
    expect(clientCopyByLocale.en.auth.validation.email).toBe("Enter a valid email");
  });

  it("contains language switcher labels for the auth screen", () => {
    expect(clientCopyByLocale.ru.auth.languageSwitcher.ariaLabel).toBe("Язык интерфейса");
    expect(clientCopyByLocale.en.auth.languageSwitcher.ariaLabel).toBe("Interface language");
  });
});
