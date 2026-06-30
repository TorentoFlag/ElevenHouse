import { NavLink } from "react-router";
import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../../../common/i18n/astrologerCopy";
import { toNavigationDrawerItem } from "../../helpers/navigationDrawerItems";
import { AstrologerNavigationDrawerFooterItem } from "./AstrologerNavigationDrawerFooterItem";

describe("AstrologerNavigationDrawerFooterItem", () => {
  it("renders a footer navigation item through NavLink", () => {
    const referenceItem = toNavigationDrawerItem(
      astrologerCopyByLocale.ru.appShell.navigation.items[1]!
    );
    const element = AstrologerNavigationDrawerFooterItem({
      item: referenceItem
    });

    expect(element.type).toBe(NavLink);
    expect(element.props.to).toBe("/reference");
    expect(JSON.stringify(element.props.children)).toContain("Справочники");
    expect(JSON.stringify(element.props.children)).toContain("ehNavigationDrawer__itemIcon");
  });
});
