import type { AppShellNavigationCopy } from "../../../../common/i18n/astrologerCopy";
import { toNavigationDrawerItem } from "../../helpers/navigationDrawerItems";
import { AstrologerNavigationDrawerFooterItem } from "./AstrologerNavigationDrawerFooterItem";
import { AstrologerNavigationDrawerPersonalPage } from "./AstrologerNavigationDrawerPersonalPage";

type AstrologerNavigationDrawerFooterProps = {
  copy: AppShellNavigationCopy;
};

export function AstrologerNavigationDrawerFooter({
  copy
}: AstrologerNavigationDrawerFooterProps) {
  return (
    <>
      <AstrologerNavigationDrawerPersonalPage personalPage={copy.personalPage} />
      {copy.footerItems.map((item) => (
        <AstrologerNavigationDrawerFooterItem
          key={item.id}
          item={toNavigationDrawerItem(item)}
        />
      ))}
    </>
  );
}
