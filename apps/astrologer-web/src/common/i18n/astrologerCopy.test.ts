import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale, type AstrologerCopy } from "./astrologerCopy";

type RequiredReferenceEntryModalEditLabels = {
  readonly createTitle: string;
  readonly editTitle: string;
  readonly createCloseLabel: string;
  readonly editCloseLabel: string;
};

const assertRequiredReferenceEntryModalEditLabels = (
  copy: AstrologerCopy["reference"]["entryModal"]
): RequiredReferenceEntryModalEditLabels => copy;

type RequiredProductConstructorCopy = Pick<
  AstrologerCopy["products"]["editor"],
  | "title"
  | "formatLabel"
  | "paymentModelLabel"
  | "includedItemIconLabel"
  | "modifierPriceLabel"
  | "saveDraftLabel"
>;

const assertRequiredProductConstructorCopy = (
  copy: AstrologerCopy["products"]["editor"]
): RequiredProductConstructorCopy => copy;

const assertRequiredProductActionCopy = (
  copy: AstrologerCopy["products"]["actions"]
): AstrologerCopy["products"]["actions"] => copy;

describe("astrologerCopy", () => {
  it("contains locale-safe calendar navigation and page labels", () => {
    expect(astrologerCopyByLocale.ru.appShell.navigation.items).toContainEqual({
      id: "calendar",
      title: "Календарь",
      href: "/calendar"
    });
    expect(astrologerCopyByLocale.en.appShell.navigation.items).toContainEqual({
      id: "calendar",
      title: "Calendar",
      href: "/calendar"
    });
    expect(astrologerCopyByLocale.ru.calendar.views).toEqual({
      day: "День",
      week: "Неделя",
      month: "Месяц"
    });
    expect(astrologerCopyByLocale.en.calendar.views).toEqual({
      day: "Day",
      week: "Week",
      month: "Month"
    });
    expect(astrologerCopyByLocale.ru.calendar.bookingDetail).toMatchObject({
      panelLabel: "Детали записи",
      confirmedLabel: "Подтверждена",
      closeLabel: "Закрыть детали записи"
    });
    expect(astrologerCopyByLocale.en.calendar.bookingDetail).toMatchObject({
      panelLabel: "Booking details",
      confirmedLabel: "Confirmed",
      closeLabel: "Close booking details"
    });
  });

  it("requires reference entry modal create and edit labels", () => {
    expect(
      assertRequiredReferenceEntryModalEditLabels(astrologerCopyByLocale.ru.reference.entryModal)
    ).toEqual(
      expect.objectContaining({
        createTitle: "Новая трактовка",
        editTitle: "Редактировать трактовку",
        createCloseLabel: "Закрыть модалку добавления трактовки",
        editCloseLabel: "Закрыть модалку редактирования трактовки"
      })
    );
    expect(
      assertRequiredReferenceEntryModalEditLabels(astrologerCopyByLocale.en.reference.entryModal)
    ).toEqual(
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
    expect(astrologerCopyByLocale.ru).toHaveProperty(
      "appShell.header.profileLoadingName",
      "Загрузка профиля"
    );
    expect(astrologerCopyByLocale.ru).not.toHaveProperty("appShell.header.profileName");
    expect(astrologerCopyByLocale.ru).not.toHaveProperty("appShell.header.profileTimezone");
  });

  it("contains product constructor and action copy for both locales", () => {
    expect(assertRequiredProductConstructorCopy(astrologerCopyByLocale.ru.products.editor)).toEqual(
      expect.objectContaining({
        title: "Конструктор продукта",
        formatLabel: "Формат поставки",
        paymentModelLabel: "Оплата",
        includedItemIconLabel: "Иконка пункта",
        modifierPriceLabel: "Цена модификатора",
        saveDraftLabel: "Сохранить черновик"
      })
    );
    expect(assertRequiredProductActionCopy(astrologerCopyByLocale.ru.products.actions)).toEqual({
      menuLabel: "Действия продукта",
      editLabel: "Изменить",
      duplicateLabel: "Дублировать",
      publishLabel: "Опубликовать",
      draftLabel: "В черновик",
      archiveLabel: "В архив"
    });

    expect(assertRequiredProductConstructorCopy(astrologerCopyByLocale.en.products.editor)).toEqual(
      expect.objectContaining({
        title: "Product constructor",
        formatLabel: "Format",
        paymentModelLabel: "Payment",
        includedItemIconLabel: "Item icon",
        modifierPriceLabel: "Modifier price",
        saveDraftLabel: "Save draft"
      })
    );
    expect(assertRequiredProductActionCopy(astrologerCopyByLocale.en.products.actions)).toEqual({
      menuLabel: "Product actions",
      editLabel: "Edit",
      duplicateLabel: "Duplicate",
      publishLabel: "Publish",
      draftLabel: "Move to draft",
      archiveLabel: "Archive"
    });
  });
});
