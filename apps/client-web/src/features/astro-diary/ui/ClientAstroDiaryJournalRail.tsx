import type { AstroDiaryJournalSummaryResponse } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { ClientCopy } from "../../../common/i18n/clientCopy";
import styles from "./ClientAstroDiaryWorkspaceView.module.css";

export function ClientAstroDiaryJournalRail(props: {
  readonly copy: ClientCopy["astroDiary"];
  readonly locale: SupportedLocale;
  readonly journals: readonly AstroDiaryJournalSummaryResponse[];
  readonly selectedJournalId: string;
  readonly onSelectJournal: (journalId: string) => void;
}) {
  return (
    <aside className={styles.rail} aria-label={props.copy.journalListTitle}>
      <header className={styles.railHeader}>
        <h2>{props.copy.journalListTitle}</h2>
        <span>{props.journals.length}</span>
      </header>
      <div className={styles.journalRows}>
        {props.journals.map((summary) => {
          const selected = summary.journal.id === props.selectedJournalId;
          return (
            <button
              className={styles.journalRow}
              data-selected={selected ? "true" : "false"}
              key={summary.journal.id}
              type="button"
              aria-pressed={selected}
              aria-label={props.copy.journalRowLabel(summary)}
              onClick={() => props.onSelectJournal(summary.journal.id)}
            >
              <span className={styles.avatar} aria-hidden="true">
                {summary.access.mode === "active" ? "✦" : "·"}
              </span>
              <span className={styles.journalRowText}>
                <strong>{props.copy.journalStateLabel(summary)}</strong>
                <span>{formatJournalDate(summary.journal.createdAt, props.locale)}</span>
              </span>
              {summary.unreadCount > 0 ? (
                <span className={styles.unreadBadge} aria-label={props.copy.unreadLabel(summary.unreadCount)}>
                  {summary.unreadCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function formatJournalDate(instant: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(instant)
  );
}
