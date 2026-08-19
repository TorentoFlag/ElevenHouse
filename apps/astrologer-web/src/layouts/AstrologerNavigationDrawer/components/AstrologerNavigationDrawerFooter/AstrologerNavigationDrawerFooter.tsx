import type { AppShellNavigationCopy } from "../../../../common/i18n/astrologerCopy";
import type { AstrologerPersonalPageLink } from "../../model/personalPageLink";
import { toNavigationDrawerItem } from "../../helpers/navigationDrawerItems";
import { AstrologerNavigationDrawerFooterItem } from "./AstrologerNavigationDrawerFooterItem";
import { AstrologerNavigationDrawerPersonalPage } from "./AstrologerNavigationDrawerPersonalPage";

type AstrologerNavigationDrawerFooterProps = {
  copy: AppShellNavigationCopy;
  personalPage: AstrologerPersonalPageLink;
};

export function AstrologerNavigationDrawerFooter({
  copy,
  personalPage
}: AstrologerNavigationDrawerFooterProps) {
  return (
    <>
      <AstrologerNavigationDrawerPersonalPage personalPage={personalPage} />
      {copy.footerItems.map((item) => (
        <AstrologerNavigationDrawerFooterItem key={item.id} item={toNavigationDrawerItem(item)} />
      ))}
    </>
  );
}
