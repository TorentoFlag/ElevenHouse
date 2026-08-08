import { useState } from "react";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useI18n } from "@elevenhouse/i18n";
import { NavLink, useLocation } from "react-router";
import type {
  AppShellNavigationCopy,
  AppShellNavigationItemCopy,
  AstrologerCopy
} from "../../common/i18n/astrologerCopy";
import { useAstrologerTariffEntitlementsQuery } from "../../features/platform-tariffs/model/useAstrologerTariffEntitlementsQuery";
import { toNavigationDrawerItem } from "../AstrologerNavigationDrawer/helpers/navigationDrawerItems";
import styles from "./AstrologerMobileNavigation.module.css";

const primaryItemIds = ["dashboard", "calendar", "funnels", "inbox"] as const;

export function AstrologerMobileNavigation() {
  const { dictionary } = useI18n<AstrologerCopy>();
  const entitlementsQuery = useAstrologerTariffEntitlementsQuery();
  const canReadProducts =
    entitlementsQuery.data?.products.read === "allow" ||
    entitlementsQuery.data?.products.read === "read_only";

  return (
    <AstrologerMobileNavigationView
      copy={dictionary.appShell.navigation}
      canReadProducts={canReadProducts}
    />
  );
}

export function AstrologerMobileNavigationView({
  copy,
  canReadProducts = true
}: {
  readonly copy: AppShellNavigationCopy;
  readonly canReadProducts?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const allItems = [...copy.items, ...copy.footerItems].filter(
    (item) => item.id !== "products" || canReadProducts
  );
  const primaryItems = primaryItemIds.flatMap((id) => {
    const item = allItems.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
  const moreItems = allItems.filter((item) => !primaryItemIds.includes(item.id as never));
  const isMoreActive = moreItems.some((item) => location.pathname === item.href);

  return (
    <>
      <nav className={styles.navigation} aria-label={copy.mobile.ariaLabel}>
        {primaryItems.map((item) => (
          <MobileNavigationLink key={item.id} item={item} />
        ))}
        <button
          className={styles.item}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          data-active={isMoreActive ? "true" : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <Icon iconName="dots" width={20} height={20} aria-hidden="true" />
          <span>{copy.mobile.moreLabel}</span>
        </button>
      </nav>
      <Modal
        title={copy.mobile.moreDialogTitle}
        closeLabel={copy.mobile.closeLabel}
        open={moreOpen}
        className={styles.moreDialog}
        contentClassName={styles.moreContent}
        onClose={() => setMoreOpen(false)}
      >
        <nav className={styles.moreList} aria-label={copy.mobile.moreDialogTitle}>
          {moreItems.map((item) => (
            <MobileNavigationLink key={item.id} item={item} onNavigate={() => setMoreOpen(false)} />
          ))}
        </nav>
      </Modal>
    </>
  );
}

function MobileNavigationLink({
  item,
  onNavigate
}: {
  readonly item: AppShellNavigationItemCopy;
  readonly onNavigate?: () => void;
}) {
  const icon = toNavigationDrawerItem(item).icon;

  return (
    <NavLink
      to={item.href}
      viewTransition
      className={({ isActive }) => `${styles.item}${isActive ? ` ${styles.itemActive}` : ""}`}
      onClick={onNavigate}
    >
      {icon}
      <span>{item.title}</span>
    </NavLink>
  );
}
