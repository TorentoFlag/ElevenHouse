import { NavigationDrawer } from "@elevenhouse/design-system/navigation";
import "@elevenhouse/design-system/navigation/NavigationDrawer.css";
import type { AppShellNavigationCopy } from "../../../common/i18n/astrologerCopy";
import type { AstrologerPersonalPageLink } from "../model/personalPageLink";
import { toNavigationDrawerItem } from "../helpers/navigationDrawerItems";
import { AstrologerNavigationDrawerBrandTitle } from "./AstrologerNavigationDrawerBrandTitle";
import { AstrologerNavigationDrawerFooter } from "./AstrologerNavigationDrawerFooter";
import "./AstrologerNavigationDrawerFooter/AstrologerNavigationDrawerFooter.css";
import { renderNavigationLink } from "./renderNavigationLink";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

type AstrologerNavigationDrawerViewProps = {
  copy: AppShellNavigationCopy;
  personalPage: AstrologerPersonalPageLink;
  /** Products is hidden until the server confirms that its read surface is available. */
  canReadProducts?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export function AstrologerNavigationDrawerView({
  copy,
  personalPage,
  canReadProducts = true,
  collapsed,
  onCollapsedChange
}: AstrologerNavigationDrawerViewProps) {
  return (
    <NavigationDrawer
      ariaLabel={copy.ariaLabel}
      brand={{
        title: <AstrologerNavigationDrawerBrandTitle title={copy.brandTitle} />,
        subtitle: copy.brandSubtitle,
        logo: <Icon iconName="logoMoon" aria-hidden="true" />
      }}
      collapseLabel={copy.collapseLabel}
      expandLabel={copy.expandLabel}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      items={copy.items
        .filter((item) => item.id !== "products" || canReadProducts)
        .map(toNavigationDrawerItem)}
      footer={<AstrologerNavigationDrawerFooter copy={copy} personalPage={personalPage} />}
      renderLink={renderNavigationLink}
    />
  );
}
