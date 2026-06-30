import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../../../common/i18n/astrologerCopy";
import { AstrologerNavigationDrawerFooter } from "./AstrologerNavigationDrawerFooter";

describe("AstrologerNavigationDrawerFooter", () => {
  it("renders from the component directory", () => {
    const element = AstrologerNavigationDrawerFooter({
      copy: astrologerCopyByLocale.ru.appShell.navigation
    });

    expect(JSON.stringify(element)).toContain("Личная страница");
    expect(JSON.stringify(element)).toContain("settings");
  });
});
