import { NavLink } from "react-router";
import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../../../common/i18n/astrologerCopy";
import { toNavigationDrawerItem } from "../../helpers/navigationDrawerItems";
import { AstrologerNavigationDrawerFooterItem } from "./AstrologerNavigationDrawerFooterItem";

describe("AstrologerNavigationDrawerFooterItem", () => {
  it("renders a footer navigation item through NavLink", () => {
    const referenceCopy = astrologerCopyByLocale.ru.appShell.navigation.items.find(
      (item) => item.id === "reference"
    );
    if (!referenceCopy) {
      throw new Error("Expected reference navigation copy");
    }

    const referenceItem = toNavigationDrawerItem(referenceCopy);
    const element = AstrologerNavigationDrawerFooterItem({
      item: referenceItem
    });

    expect(element.type).toBe(NavLink);
    expect(element.props.to).toBe("/reference");
    expect(JSON.stringify(element.props.children)).toContain("Справочники");
    expect(JSON.stringify(element.props.children)).toContain("ehNavigationDrawer__itemIcon");
  });
});
