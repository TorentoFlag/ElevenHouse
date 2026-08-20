import type {
  AstrologerClientCrmDetail,
  AstrologerClientCrmPrivateProfileUpdateRequest,
  AstrologerClientCrmPrivateProfileUpdateResponse
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useEffect, useState, type ReactNode } from "react";
import type { ClientsCrmCopy } from "../../../common/i18n/astrologerCopy";
import { formatClientCrmLifecycle } from "../model/clientsCrmPresentation";
import styles from "./ClientsCrm.module.css";

type ClientCrmPrivatePanelProps = {
  readonly client: AstrologerClientCrmDetail;
  readonly copy: ClientsCrmCopy;
  readonly lifecycle: ReturnType<typeof formatClientCrmLifecycle>;
  readonly isSaving: boolean;
  readonly isError: boolean;
  readonly onSave: (
    input: AstrologerClientCrmPrivateProfileUpdateRequest
  ) => Promise<AstrologerClientCrmPrivateProfileUpdateResponse>;
};

export function ClientCrmPrivatePanel({
  client,
  copy,
  lifecycle,
  isSaving,
  isError,
  onSave
}: ClientCrmPrivatePanelProps) {
  const [savedProfile, setSavedProfile] = useState(client.privateCrm);
  const displayProfile = savedProfile;
  const [isEditing, setIsEditing] = useState(false);
  const [note, setNote] = useState(client.privateCrm.note ?? "");
  const [tags, setTags] = useState(client.privateCrm.tags.join(", "));

  useEffect(() => {
    setSavedProfile(client.privateCrm);
    setIsEditing(false);
    setNote(client.privateCrm.note ?? "");
    setTags(client.privateCrm.tags.join(", "));
  }, [client.clientUserId, client.privateCrm.note, client.privateCrm.tags]);

  const submit = async () => {
    const response = await onSave({
      note,
      tags: tags.split(",")
    });
    setSavedProfile(response.privateCrm);
    setNote(response.privateCrm.note ?? "");
    setTags(response.privateCrm.tags.join(", "));
    setIsEditing(false);
  };

  return (
    <section className={styles.card}>
      <div className={styles.crmCardHeader}>
        <div>
          <div className={styles.kicker}>{copy.privateCrm.title}</div>
          <div className={styles.privateHint}>{copy.privateCrm.privateHint}</div>
        </div>
        {!isEditing ? (
          <button type="button" className={styles.iconButton} onClick={() => setIsEditing(true)}>
            <Icon iconName="edit" size={15} aria-hidden="true" />
            {copy.privateCrm.editLabel}
          </button>
        ) : null}
      </div>

      {!isEditing ? (
        <div className={styles.factList}>
          <PrivateCrmFact
            label={copy.facts.lifecycle}
            value={
              <span className={styles.badge} data-tone={lifecycle.tone}>
                {lifecycle.label}
              </span>
            }
          />
          <PrivateCrmFact
            label={copy.privateCrm.tagsLabel}
            value={
              displayProfile.tags.length > 0 ? (
                <span className={styles.tagList}>
                  {displayProfile.tags.map((tag) => (
                    <span className={styles.tag} key={tag}>
                      {tag}
                    </span>
                  ))}
                </span>
              ) : (
                copy.privateCrm.emptyTags
              )
            }
          />
          <PrivateCrmFact
            label={copy.privateCrm.noteLabel}
            value={displayProfile.note ?? copy.privateCrm.emptyNote}
          />
        </div>
      ) : (
        <div className={styles.crmEditor}>
          <label className={styles.fieldLabel}>
            <span>{copy.privateCrm.tagsLabel}</span>
            <input
              aria-label={copy.privateCrm.tagsLabel}
              className={styles.input}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </label>
          <label className={styles.fieldLabel}>
            <span>{copy.privateCrm.noteLabel}</span>
            <textarea
              aria-label={copy.privateCrm.noteLabel}
              className={styles.textarea}
              value={note}
              rows={5}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {isError ? <div className={styles.inlineError}>{copy.privateCrm.saveError}</div> : null}
          <div className={styles.editorActions}>
            <button type="button" className={styles.button} onClick={submit} disabled={isSaving}>
              <Icon iconName="check" size={15} aria-hidden="true" />
              {isSaving ? copy.privateCrm.savingLabel : copy.privateCrm.saveLabel}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
              {copy.privateCrm.cancelLabel}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PrivateCrmFact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className={styles.factRow}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{value}</span>
    </div>
  );
}
