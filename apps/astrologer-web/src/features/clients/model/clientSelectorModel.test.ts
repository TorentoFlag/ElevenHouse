import { describe, expect, it } from "vitest";
import {
  astrologerClientInfiniteQueryOptions,
  getAvailableClientSelectOptions,
  getClientSearchComboboxKeyAction,
  getNextActiveClientId,
  getSelectableClientOptions,
  resolveSelectedClientOption,
  toClientSelectOptions
} from "./clientSelectorModel";

describe("clientSelectorModel", () => {
  it("maps platform clients into selector options with initials and readable birth dates", () => {
    const options = toClientSelectOptions([
      {
        clientUserId: "c729d1b2-fa6c-4914-b91e-e614d1c65c3b",
        displayName: "Голубев Антон",
        relationshipStatus: "active",
        firstLinkedAt: "2026-07-06T00:00:00.000Z",
        lastLinkedAt: "2026-07-06T00:00:00.000Z",
        birthData: {
          id: "55555555-5555-4555-8555-555555555555",
          clientUserId: "c729d1b2-fa6c-4914-b91e-e614d1c65c3b",
          label: "Основные данные",
          birthDate: "2000-08-19",
          birthTime: "12:45",
          birthTimePrecision: "exact",
          birthPlaceText: "Калининск, Саратовская область, Россия",
          birthCountryCode: "RU",
          birthCity: "Калининск",
          birthRegion: "Саратовская область",
          birthTimezone: "Europe/Saratov",
          birthLatitude: 51.4996,
          birthLongitude: 44.4758,
          source: "manual",
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z"
        }
      }
    ]);

    expect(options[0]).toMatchObject({
      value: "c729d1b2-fa6c-4914-b91e-e614d1c65c3b",
      label: "Голубев Антон",
      initials: "ГА",
      birthDateDisplay: "19.08.2000",
      subtitle: "19.08.2000 · Калининск, Саратовская область, Россия",
      hasBirthDate: true
    });
  });

  it("describes paginated client queries for infinite scrolling", () => {
    const options = astrologerClientInfiniteQueryOptions({ query: "антон", limit: 30 });
    const firstPage = {
      clients: [],
      total: 75
    };

    expect(options.initialPageParam).toBe(0);
    expect(options.getNextPageParam(firstPage, [firstPage], 0)).toBe(30);
    expect(
      options.getNextPageParam(
        { clients: [], total: 75 },
        [firstPage, firstPage, firstPage],
        60
      )
    ).toBeUndefined();
  });

  it("resolves selector navigation state without disabled or excluded clients", () => {
    const marina = clientOption("client-marina", "Марина Краснова", true);
    const anton = clientOption("client-anton", "Голубев Антон", true);
    const withoutBirthDate = clientOption("client-disabled", "Клиент без даты", false);

    expect(getSelectableClientOptions([marina, anton, withoutBirthDate])).toEqual([marina, anton]);
    expect(
      getAvailableClientSelectOptions({
        options: [marina, anton],
        excludeClientIds: ["client-anton"],
        currentValue: "client-marina"
      })
    ).toEqual([marina]);
    expect(getNextActiveClientId([marina, anton], null, 1)).toBe("client-marina");
    expect(getNextActiveClientId([marina, anton], "client-marina", -1)).toBe("client-anton");
    expect(resolveSelectedClientOption([anton], "client-marina", marina)).toBe(marina);
    expect(resolveSelectedClientOption([anton], "client-anton", marina)).toBe(anton);
  });

  it("describes combobox keyboard actions without React event state", () => {
    const marina = clientOption("client-marina", "Марина Краснова", true);
    const withoutBirthDate = clientOption("client-disabled", "Клиент без даты", false);

    expect(
      getClientSearchComboboxKeyAction({
        key: "ArrowDown",
        clients: [withoutBirthDate, marina],
        activeClientId: null,
        hasNextPage: false
      })
    ).toEqual({ kind: "activate", clientId: "client-marina" });
    expect(
      getClientSearchComboboxKeyAction({
        key: "Enter",
        clients: [withoutBirthDate, marina],
        activeClientId: "client-disabled",
        hasNextPage: false
      })
    ).toEqual({ kind: "select", client: marina });
    expect(
      getClientSearchComboboxKeyAction({
        key: "Enter",
        clients: [withoutBirthDate],
        activeClientId: null,
        hasNextPage: true
      })
    ).toEqual({ kind: "load-more" });
    expect(
      getClientSearchComboboxKeyAction({
        key: "Tab",
        clients: [marina],
        activeClientId: null,
        hasNextPage: true
      })
    ).toEqual({ kind: "ignore" });
  });
});

function clientOption(value: string, label: string, hasBirthDate: boolean) {
  return {
    value,
    label,
    initials: label
      .split(/\s+/)
      .map((part) => part[0])
      .join(""),
    subtitle: hasBirthDate ? "01.01.2000" : "Дата рождения не заполнена",
    birthDateDisplay: hasBirthDate ? "01.01.2000" : "—",
    hasBirthDate,
    birthData: null
  };
}
