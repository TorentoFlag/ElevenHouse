import type { DictionaryEffectiveEntryResponse } from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Card } from "@elevenhouse/design-system/components/Card";
import "@elevenhouse/design-system/components/Card.css";
import { IconButton } from "@elevenhouse/design-system/components/IconButton";
import "@elevenhouse/design-system/components/IconButton.css";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import styles from "../ReferencePage.module.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

type ReferenceCopy = AstrologerCopy["reference"];

export type ReferenceEntryCardProps = {
  readonly entry: DictionaryEffectiveEntryResponse;
  readonly sourceBadges: ReferenceCopy["sourceBadges"];
  readonly entryActions: ReferenceCopy["entryActions"];
  readonly onEditEntry: (entry: DictionaryEffectiveEntryResponse) => void;
  readonly onDeleteEntry: (entry: DictionaryEffectiveEntryResponse) => void;
};

export function ReferenceEntryCard({
  entry,
  sourceBadges,
  entryActions,
  onEditEntry,
  onDeleteEntry
}: ReferenceEntryCardProps) {
  return (
    <Card as="article" className={styles.entryCard} padding="medium" variant="elevated">
      <div className={styles.entryTitleRow}>
        <h2 className={styles.entryTitle}>{entry.title}</h2>
        <span className={styles.entryBadge}>{sourceBadges[entry.source]}</span>
      </div>
      <p className={styles.entryContent}>{entry.content}</p>
      <div className={styles.entryActions}>
        <Button
          className={styles.entryEditButton}
          type="button"
          variant="glass"
          size="small"
          title={entryActions.editLabel}
          startIcon={
            <Icon iconName="edit" className={styles.buttonIcon} width={13} height={13} aria-hidden="true" />
          }
          data-reference-entry-action="edit"
          onClick={() => onEditEntry(entry)}
        />
        {entry.astrologerEntryId ? (
          <IconButton
            type="button"
            variant="quiet"
            size="small"
            label={`${entryActions.deleteLabel}: ${entry.title}`}
            icon={<Icon iconName="trash" aria-hidden="true" />}
            data-reference-entry-action="delete"
            onClick={() => onDeleteEntry(entry)}
          />
        ) : null}
      </div>
    </Card>
  );
}
