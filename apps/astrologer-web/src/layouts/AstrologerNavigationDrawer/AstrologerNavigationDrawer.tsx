import { useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useCurrentAstrologerProfileQuery } from "../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery";
import { useAstrologerTariffEntitlementsQuery } from "../../features/platform-tariffs/model/useAstrologerTariffEntitlementsQuery";
import { AstrologerNavigationDrawerView } from "./components/AstrologerNavigationDrawerView";
import { createAstrologerPersonalPageLink } from "./model/personalPageLink";

export function AstrologerNavigationDrawer() {
  const { dictionary } = useI18n<AstrologerCopy>();
  const [collapsed, setCollapsed] = useState(false);
  const entitlementsQuery = useAstrologerTariffEntitlementsQuery();
  const profileQuery = useCurrentAstrologerProfileQuery();
  const canReadProducts =
    entitlementsQuery.data?.products.read === "allow" ||
    entitlementsQuery.data?.products.read === "read_only";
  const personalPage = createAstrologerPersonalPageLink({
    copy: dictionary.appShell.navigation.personalPage,
    profile: profileQuery.data?.profile ?? null
  });

  return (
    <AstrologerNavigationDrawerView
      copy={dictionary.appShell.navigation}
      canReadProducts={canReadProducts}
      personalPage={personalPage}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
    />
  );
}
