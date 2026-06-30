import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "./astrologerCopy";

describe("astrologerCopy", () => {
  it("contains the astrologer registration copy from the selected design", () => {
    expect(astrologerCopyByLocale.ru.auth.visual.backLinkTitle).toBe("На главную");
    expect(astrologerCopyByLocale.ru.auth.visual.heroTitleLine1).toBe("Кабинет, который");
    expect(astrologerCopyByLocale.ru.auth.visual.heroTitleLine2).toBe("продаёт за вас");
    expect(astrologerCopyByLocale.ru.auth.form.registerTitle).toBe("Создать кабинет");
    expect(astrologerCopyByLocale.ru.auth.form.registerDescription).toBe(
      "Бесплатно, без карты. 10 минут до первой продажи."
    );
    expect(astrologerCopyByLocale.ru.auth.form.emailLabel).toBe("Email");
    expect(astrologerCopyByLocale.ru.auth.form.phoneLabel).toBe("Или телефон");
  });

  it("contains app shell header copy from the selected cabinet design", () => {
    expect(astrologerCopyByLocale.ru).toHaveProperty(
      "appShell.header.searchPlaceholder",
      "Поиск клиентов, заказов, карт…"
    );
    expect(astrologerCopyByLocale.ru).toHaveProperty("appShell.header.createLabel", "Создать");
    expect(astrologerCopyByLocale.ru).toHaveProperty("appShell.header.profileName", "Алиса Вега");
    expect(astrologerCopyByLocale.ru).toHaveProperty("appShell.header.profileTimezone", "GMT+3, Москва");
  });
});
