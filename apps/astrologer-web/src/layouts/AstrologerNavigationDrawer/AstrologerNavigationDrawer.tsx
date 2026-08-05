import { useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useAstrologerTariffEntitlementsQuery } from "../../features/platform-tariffs/model/useAstrologerTariffEntitlementsQuery";
import { AstrologerNavigationDrawerView } from "./components/AstrologerNavigationDrawerView";

export function AstrologerNavigationDrawer() {
  const { dictionary } = useI18n<AstrologerCopy>();
  const [collapsed, setCollapsed] = useState(false);
  const entitlementsQuery = useAstrologerTariffEntitlementsQuery();
  const canReadProducts =
    entitlementsQuery.data?.products.read === "allow" ||
    entitlementsQuery.data?.products.read === "read_only";

  return (
    <AstrologerNavigationDrawerView
      copy={dictionary.appShell.navigation}
      canReadProducts={canReadProducts}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
    />
  );
}
