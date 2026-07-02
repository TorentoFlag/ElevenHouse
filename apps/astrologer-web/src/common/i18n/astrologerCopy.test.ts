import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale, type ReferenceEntryModalCopy } from "./astrologerCopy";

type RequiredReferenceEntryModalEditLabels = {
  readonly createTitle: string;
  readonly editTitle: string;
  readonly createCloseLabel: string;
  readonly editCloseLabel: string;
};

const assertRequiredReferenceEntryModalEditLabels = (
  copy: ReferenceEntryModalCopy
): RequiredReferenceEntryModalEditLabels => copy;

describe("astrologerCopy", () => {
  it("requires reference entry modal create and edit labels", () => {
    expect(assertRequiredReferenceEntryModalEditLabels(astrologerCopyByLocale.ru.reference.entryModal)).toEqual(
      expect.objectContaining({
        createTitle: "Новая трактовка",
        editTitle: "Редактировать трактовку",
        createCloseLabel: "Закрыть модалку добавления трактовки",
        editCloseLabel: "Закрыть модалку редактирования трактовки"
      })
    );
    expect(assertRequiredReferenceEntryModalEditLabels(astrologerCopyByLocale.en.reference.entryModal)).toEqual(
      expect.objectContaining({
        createTitle: "New interpretation",
        editTitle: "Edit interpretation",
        createCloseLabel: "Close add interpretation modal",
        editCloseLabel: "Close edit interpretation modal"
      })
    );
  });

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
