import { NavigationDrawer } from "@elevenhouse/design-system/navigation";
import "@elevenhouse/design-system/navigation/NavigationDrawer.css";
import { LogoMoon } from "@elevenhouse/design-system/icons/LogoMoon";
import type { AppShellNavigationCopy } from "../../../common/i18n/astrologerCopy";
import { toNavigationDrawerItem } from "../helpers/navigationDrawerItems";
import { AstrologerNavigationDrawerBrandTitle } from "./AstrologerNavigationDrawerBrandTitle";
import { AstrologerNavigationDrawerFooter } from "./AstrologerNavigationDrawerFooter";
import "./AstrologerNavigationDrawerFooter/AstrologerNavigationDrawerFooter.css";
import { renderNavigationLink } from "./renderNavigationLink";

type AstrologerNavigationDrawerViewProps = {
  copy: AppShellNavigationCopy;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export function AstrologerNavigationDrawerView({
  copy,
  collapsed,
  onCollapsedChange
}: AstrologerNavigationDrawerViewProps) {
  return (
    <NavigationDrawer
      ariaLabel={copy.ariaLabel}
      brand={{
        title: <AstrologerNavigationDrawerBrandTitle title={copy.brandTitle} />,
        subtitle: copy.brandSubtitle,
        logo: <LogoMoon aria-hidden="true" />
      }}
      collapseLabel={copy.collapseLabel}
      expandLabel={copy.expandLabel}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      items={copy.items.map(toNavigationDrawerItem)}
      footer={<AstrologerNavigationDrawerFooter copy={copy} />}
      renderLink={renderNavigationLink}
    />
  );
}
