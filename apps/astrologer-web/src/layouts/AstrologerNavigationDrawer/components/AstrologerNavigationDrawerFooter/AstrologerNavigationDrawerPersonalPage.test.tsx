import { describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../../common/i18n/astrologerCopy";
import { AstrologerNavigationDrawerPersonalPage } from "./AstrologerNavigationDrawerPersonalPage";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("react-router", () => ({
  useNavigate: () => navigate
}));

describe("AstrologerNavigationDrawerPersonalPage", () => {
  it("navigates to the personal page from a button", () => {
    const personalPage = astrologerCopyByLocale.ru.appShell.navigation.personalPage;
    const element = AstrologerNavigationDrawerPersonalPage({
      personalPage
    });

    expect(element.type).toBe("button");
    expect(element.props.href).toBeUndefined();
    expect(JSON.stringify(element)).toContain("Личная страница");

    element.props.onClick();

    expect(navigate).toHaveBeenCalledWith(personalPage.href);
  });
});
