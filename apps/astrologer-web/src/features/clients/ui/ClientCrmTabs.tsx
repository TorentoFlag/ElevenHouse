import type { KeyboardEvent } from "react";
import type { ClientsCrmCopy } from "../../../common/i18n/astrologerCopy";
import styles from "./ClientsCrm.module.css";

export type ClientCrmTabId = "overview" | "birthData" | "relatedProfiles" | "activity";

type ClientCrmTabsProps = {
  readonly activeTab: ClientCrmTabId;
  readonly copy: ClientsCrmCopy;
  readonly onTabChange: (tab: ClientCrmTabId) => void;
};

const tabIds = ["overview", "birthData", "relatedProfiles", "activity"] as const;

export function ClientCrmTabs({ activeTab, copy, onTabChange }: ClientCrmTabsProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: ClientCrmTabId) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    const currentIndex = tabIds.indexOf(tab);
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % tabIds.length
        : (currentIndex - 1 + tabIds.length) % tabIds.length;

    const nextTab = tabIds[nextIndex] ?? tabIds[0];
    onTabChange(nextTab);
    event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelector<HTMLButtonElement>(`#clients-crm-tab-${nextTab}`)
      ?.focus();
  };

  return (
    <div className={styles.tabs} role="tablist" aria-label={copy.facts.relationship}>
      {tabIds.map((tab) => (
        <button
          aria-controls={`clients-crm-panel-${tab}`}
          aria-selected={activeTab === tab}
          className={styles.tab}
          id={`clients-crm-tab-${tab}`}
          key={tab}
          onClick={() => onTabChange(tab)}
          onKeyDown={(event) => handleKeyDown(event, tab)}
          role="tab"
          tabIndex={activeTab === tab ? 0 : -1}
          type="button"
        >
          {copy.tabs[tab]}
        </button>
      ))}
    </div>
  );
}
