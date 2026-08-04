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

  it("contains translated visual pane copy for the auth screen", () => {
    expect(clientCopyByLocale.ru.auth.visual.backLinkTitle).toBe("На страницу астролога");
    expect(clientCopyByLocale.en.auth.visual.backLinkTitle).toBe("Astrologer's page");
    expect(clientCopyByLocale.ru.auth.visual.heroTitleLine1).toBe("Ваш кабинет");
    expect(clientCopyByLocale.en.auth.visual.heroTitleLine1).toBe("Your space");
    expect(clientCopyByLocale.ru.auth.visual.highlights[0]?.label).toBe(
      "Записи и онлайн консультации"
    );
    expect(clientCopyByLocale.en.auth.visual.highlights[0]?.label).toBe(
      "Sessions and online consultations"
    );
    expect(clientCopyByLocale.ru.auth.visual.joinedInfoPrefix).toBe("Уже с астрологами");
    expect(clientCopyByLocale.en.auth.visual.joinedInfoPrefix).toBe(
      "Already connected with astrologers"
    );
  });

  it("contains complete birth place search states for both launch locales", () => {
    expect(clientCopyByLocale.ru.birthPlaceSearch.searching).toBe("Ищем место…");
    expect(clientCopyByLocale.en.birthPlaceSearch.searching).toBe("Searching for a place…");
    expect(clientCopyByLocale.ru.birthPlaceSearch.selectionRequired).not.toBe(
      clientCopyByLocale.en.birthPlaceSearch.selectionRequired
    );
  });

  it("contains explicit repeated-hour choices and guidance for both launch locales", () => {
    expect(clientCopyByLocale.ru.birthTimeOccurrence).toEqual({
      label: "Повторный час",
      none: "Не выбрано",
      first: "Первое вхождение",
      second: "Второе вхождение",
      helper: "Выберите вариант только если местное время повторялось при переводе часов."
    });
    expect(clientCopyByLocale.en.birthTimeOccurrence).toEqual({
      label: "Repeated hour",
      none: "Not selected",
      first: "First occurrence",
      second: "Second occurrence",
      helper: "Choose only when the local clock time occurred twice during a DST change."
    });
  });
});
