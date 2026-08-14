import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useAstroDiaryJournalListQuery } from "../../features/astro-diary/model/useAstroDiaryJournalListQuery";
import { useAstroDiaryTimelineQuery } from "../../features/astro-diary/model/useAstroDiaryTimelineQuery";
import styles from "./AstroDiaryPage.module.css";

export function AstroDiaryPage() {
  const { dictionary } = useI18n<AstrologerCopy>();
  const copy = dictionary.astroDiary;
  const journalsQuery = useAstroDiaryJournalListQuery();
  const primaryJournal = journalsQuery.data?.journals[0];
  const timelineQuery = useAstroDiaryTimelineQuery(primaryJournal?.journal.id);

  useDocumentTitle(copy.documentTitle);

  return (
    <section className={styles.page} aria-labelledby="astro-diary-title">
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <span className={styles.titleIcon} aria-hidden="true">
            ◌
          </span>
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1 id="astro-diary-title" className={styles.title}>
              {copy.title}
            </h1>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <article className={styles.connectionCard} aria-labelledby="astro-diary-connection-title">
          <p className={styles.badge}>AstroDiary</p>
          <h2 id="astro-diary-connection-title" className={styles.connectionTitle}>
            {copy.connectionTitle}
          </h2>
          <p className={styles.connectionDescription}>{copy.connectionDescription}</p>
          <div className={styles.journalStatus} aria-live="polite">
            {journalsQuery.isLoading ? (
              <p className={styles.statusText}>{copy.loadingLabel}</p>
            ) : journalsQuery.isError ? (
              <>
                <p className={styles.statusTitle}>{copy.errorTitle}</p>
                <p className={styles.statusText}>{copy.errorDescription}</p>
              </>
            ) : journalsQuery.data && journalsQuery.data.total > 0 && primaryJournal ? (
              <>
                <p className={styles.statusTitle}>
                  {copy.journalCountLabel(journalsQuery.data.total)}
                </p>
                <p className={styles.statusText}>
                  {copy.accessModeLabel(primaryJournal.access.mode)}
                </p>
              </>
            ) : (
              <>
                <p className={styles.statusTitle}>{copy.emptyTitle}</p>
                <p className={styles.statusText}>{copy.emptyDescription}</p>
              </>
            )}
          </div>
        </article>

        {journalsQuery.data && journalsQuery.data.journals.length > 0 ? (
          <section className={styles.journalList} aria-labelledby="astro-diary-journal-list-title">
            <h2 id="astro-diary-journal-list-title" className={styles.sectionTitle}>
              {copy.journalListTitle}
            </h2>
            <div className={styles.journalCards}>
              {journalsQuery.data.journals.map((summary) => (
                <article className={styles.journalCard} key={summary.journal.id}>
                  <h3 className={styles.journalCardTitle}>
                    {copy.clientLabel(summary.journal.clientUserId.slice(0, 8))}
                  </h3>
                  <dl className={styles.journalMeta}>
                    <div>
                      <dt>{copy.unreadLabel(summary.unreadCount)}</dt>
                      <dd>{copy.cursorLabel(summary.visibleMaxCursor)}</dd>
                    </div>
                    <div>
                      <dt>{copy.accessLabel(summary.access.mode)}</dt>
                      <dd>{copy.accessModeLabel(summary.access.subscriptionState)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {primaryJournal ? (
          <section className={styles.timelinePanel} aria-labelledby="astro-diary-timeline-title">
            <h2 id="astro-diary-timeline-title" className={styles.sectionTitle}>
              {copy.timelineTitle}
            </h2>
            {timelineQuery.isLoading ? (
              <p className={styles.sectionDescription}>{copy.timelineLoadingLabel}</p>
            ) : timelineQuery.isError ? (
              <p className={styles.sectionDescription}>{copy.timelineErrorLabel}</p>
            ) : timelineQuery.data && timelineQuery.data.items.length > 0 ? (
              <div className={styles.timelineItems}>
                {timelineQuery.data.items.map((item) => (
                  <article className={styles.timelineItem} key={item.id}>
                    <p className={styles.timelineMeta}>
                      {copy.timelineItemMetaLabel(item.kind, item.cursor)}
                    </p>
                    {"body" in item ? (
                      <p className={styles.timelineBody}>{item.body}</p>
                    ) : (
                      <p className={styles.timelineBody}>{item.reason}</p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.sectionDescription}>{copy.timelineEmptyLabel}</p>
            )}
          </section>
        ) : null}

        <div className={styles.sectionGrid}>
          {copy.sections.map((section) => (
            <article className={styles.sectionCard} key={section.title}>
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              <p className={styles.sectionDescription}>{section.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
