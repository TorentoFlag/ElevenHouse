import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { toNavigationDrawerItem } from "./navigationDrawerItems";

describe("clients navigation item", () => {
  it("exposes the localized clients item in both drawer dictionaries", () => {
    expect(findClientsItem("ru")).toMatchObject({ title: "Клиенты", href: "/clients" });
    expect(findClientsItem("en")).toMatchObject({ title: "Clients", href: "/clients" });
  });

  it("keeps the existing clients navigation identity renderable by the drawer", () => {
    expect(toNavigationDrawerItem(findClientsItem("ru")).icon).toBeTruthy();
  });
});

function findClientsItem(locale: "ru" | "en") {
  const item = astrologerCopyByLocale[locale].appShell.navigation.items.find(
    (candidate) => candidate.id === "clients"
  );

  if (!item) throw new Error("Clients navigation item is required");
  return item;
}
