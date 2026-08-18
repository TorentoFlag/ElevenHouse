import type { AstroDiaryJournalSummaryResponse } from "@elevenhouse/contracts";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import styles from "./AstroDiaryWorkspaceView.module.css";

type AstroDiaryJournalRailProps = Readonly<{
  copy: AstrologerCopy["astroDiary"];
  journals: readonly AstroDiaryJournalSummaryResponse[];
  selectedJournalId: string;
  onSelectJournal: (journalId: string) => void;
}>;

export function AstroDiaryJournalRail({
  copy,
  journals,
  selectedJournalId,
  onSelectJournal
}: AstroDiaryJournalRailProps) {
  return (
    <aside className={styles.rail} aria-labelledby="astro-diary-journal-list-title">
      <div className={styles.railHeader}>
        <h2 id="astro-diary-journal-list-title">{copy.journalListTitle}</h2>
        <span>{journals.length}</span>
      </div>
      <div className={styles.journalRows}>
        {journals.map((summary) => {
          const selected = summary.journal.id === selectedJournalId;
          const clientLabel = copy.clientLabel(summary.journal.clientUserId.slice(0, 8));
          return (
            <button
              className={styles.journalRow}
              data-selected={selected ? "true" : undefined}
              type="button"
              aria-pressed={selected}
              aria-label={`${clientLabel}. ${copy.accessLabel(summary.access.mode)}`}
              key={summary.journal.id}
              onClick={() => onSelectJournal(summary.journal.id)}
            >
              <span className={styles.avatar} aria-hidden="true">
                {summary.journal.clientUserId.slice(0, 2).toUpperCase()}
              </span>
              <span className={styles.journalRowText}>
                <strong>{clientLabel}</strong>
                <span>{copy.journalStateLabel(summary)}</span>
              </span>
              {summary.unreadCount > 0 ? (
                <span className={styles.unreadBadge} aria-label={copy.unreadLabel(summary.unreadCount)}>
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
