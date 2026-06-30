import { useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { AstrologerNavigationDrawerView } from "./components/AstrologerNavigationDrawerView";

export function AstrologerNavigationDrawer() {
  const { dictionary } = useI18n<AstrologerCopy>();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <AstrologerNavigationDrawerView
      copy={dictionary.appShell.navigation}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
    />
  );
}
