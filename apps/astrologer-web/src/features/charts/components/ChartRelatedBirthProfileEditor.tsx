import { useMemo, useState } from "react";
import type {
  ClientBirthDataUpsertRequest,
  ClientBirthPlaceCandidate,
  ClientRelatedBirthProfileUpsertRequest,
  DictionaryLocale
} from "@elevenhouse/contracts";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import { ChartBirthDataEditor } from "./ChartBirthDataEditor";
import styles from "./ChartEnginePage.module.css";

export function ChartRelatedBirthProfileEditor({
  copy,
  disabled,
  errorMessage,
  isSaving,
  locale,
  onCancel,
  onCreate,
  onSearchBirthPlaces
}: {
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly errorMessage: string | null;
  readonly isSaving: boolean;
  readonly locale: DictionaryLocale;
  readonly onCancel: () => void;
  readonly onCreate: (data: ClientRelatedBirthProfileUpsertRequest) => void | Promise<void>;
  readonly onSearchBirthPlaces?: (query: string) => Promise<readonly ClientBirthPlaceCandidate[]>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [relationshipLabel, setRelationshipLabel] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const draftClient = useMemo<ClientSelectOption>(
    () => ({
      value: "new-related-birth-profile",
      label: displayName.trim() || copy.client.relatedFormTitle,
      initials: "П",
      subtitle: copy.client.chooseRelatedProfile,
      birthDateDisplay: "—",
      hasBirthDate: false,
      birthData: null
    }),
    [copy, displayName]
  );

  const createProfile = async (birthData: ClientBirthDataUpsertRequest) => {
    const normalizedDisplayName = displayName.trim();
    const normalizedRelationshipLabel = relationshipLabel.trim();
    if (!normalizedDisplayName || !normalizedRelationshipLabel) {
      setLocalError(copy.client.relatedRequired);
      return;
    }
    setLocalError(null);
    await onCreate({
      ...birthData,
      expectedRevision: null,
      label: null,
      displayName: normalizedDisplayName,
      relationshipLabel: normalizedRelationshipLabel
    });
  };

  return (
    <section className={styles.relatedProfileEditor} aria-label={copy.client.relatedFormTitle}>
      <header className={styles.relatedProfileHeader}>
        <div>
          <strong>{copy.client.relatedFormTitle}</strong>
          <span>{copy.client.relatedFormDescription}</span>
        </div>
        <button
          aria-label={copy.birthData.close}
          className={styles.relatedProfileCloseButton}
          type="button"
          onClick={onCancel}
        >
          ×
        </button>
      </header>
      <div className={styles.relatedProfileMetaGrid}>
        <label>
          <span>{copy.client.relatedDisplayName}</span>
          <input
            value={displayName}
            disabled={disabled || isSaving}
            maxLength={200}
            placeholder={copy.client.relatedDisplayNamePlaceholder}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label>
          <span>{copy.client.relationshipLabel}</span>
          <input
            value={relationshipLabel}
            disabled={disabled || isSaving}
            maxLength={100}
            placeholder={copy.client.relationshipLabelPlaceholder}
            onChange={(event) => setRelationshipLabel(event.target.value)}
          />
        </label>
      </div>
      {localError ? <p className={styles.relatedProfileError}>{localError}</p> : null}
      <ChartBirthDataEditor
        client={draftClient}
        copy={copy}
        disabled={disabled || isSaving}
        errorMessage={errorMessage}
        isSaving={isSaving}
        layout="workspace"
        locale={locale}
        onClose={onCancel}
        onSave={createProfile}
        onSearchBirthPlaces={onSearchBirthPlaces}
      />
    </section>
  );
}
