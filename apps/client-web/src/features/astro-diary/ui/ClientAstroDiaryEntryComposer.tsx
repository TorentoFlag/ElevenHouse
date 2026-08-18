import type { AstroDiaryMoodId } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useEffect, useRef, useState } from "react";
import type { ClientCopy } from "../../../common/i18n/clientCopy";
import type { ClientAstroDiaryActionError } from "../model/astroDiaryErrorModel";
import type { ClientAstroDiaryEntryDraftState } from "../model/useClientAstroDiaryEntryMutations";
import styles from "./ClientAstroDiaryEntryComposer.module.css";

const moodIds: readonly AstroDiaryMoodId[] = ["inspired", "joy", "calm", "tired", "anxious", "sad"];

export function ClientAstroDiaryEntryComposer(props: {
  readonly copy: ClientCopy["astroDiary"];
  readonly draft: ClientAstroDiaryEntryDraftState | null;
  readonly body: string;
  readonly moodId: AstroDiaryMoodId | null;
  readonly error: ClientAstroDiaryActionError | null;
  readonly isSaving: boolean;
  readonly isPublishing: boolean;
  readonly onOpen: () => void;
  readonly onBodyChange: (body: string) => void;
  readonly onMoodChange: (moodId: AstroDiaryMoodId | null) => void;
  readonly onReloadLatest: () => void;
  readonly onSave: (body: string, moodId: AstroDiaryMoodId | null) => void;
  readonly onPublish: () => void;
}) {
  const [isOpen, setIsOpen] = useState(Boolean(props.draft || props.body));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (isOpen) textareaRef.current?.focus(); }, [isOpen]);

  if (!isOpen) {
    return <div className={styles.closedComposer}><button className={styles.openButton} type="button" onClick={() => { setIsOpen(true); props.onOpen(); }}><Icon iconName="edit" width={16} height={16} aria-hidden="true" />{props.copy.entry.writeLabel}</button></div>;
  }

  const busy = props.isSaving || props.isPublishing;
  const saved = Boolean(props.draft && props.body === props.draft.body && props.moodId === props.draft.moodId);
  const canSave = props.body.trim().length > 0 && props.body.length <= 20_000 && !busy && !saved;
  const canPublish = Boolean(props.draft) && saved && !busy;
  return (
    <section className={styles.composer} aria-labelledby="client-astro-diary-entry-title">
      <div className={styles.composerHeader}><div><p className={styles.modeLabel}>{props.copy.entry.modeLabel}</p><h3 id="client-astro-diary-entry-title" className={styles.title}>{props.copy.entry.title}</h3></div><span className={styles.saveStatus} aria-live="polite">{props.isSaving ? props.copy.entry.savingLabel : saved ? props.copy.entry.savedLabel : props.copy.entry.unsavedLabel}</span></div>
      {props.error ? <div className={styles.error} role="alert"><p>{props.copy.entry.errors[props.error]}</p>{props.error === "stale" || props.error === "state" ? <span className={styles.errorActions}>{props.error === "stale" ? <button type="button" onClick={() => textareaRef.current?.focus()}>{props.copy.entry.reviewDraftLabel}</button> : null}<button type="button" onClick={props.onReloadLatest}><Icon iconName="refresh" width={14} height={14} aria-hidden="true" />{props.copy.entry.reloadLatestLabel}</button></span> : null}</div> : null}
      <fieldset className={styles.moods}><legend>{props.copy.entry.moodLabel}</legend>{moodIds.map((moodId) => <button key={moodId} type="button" aria-pressed={props.moodId === moodId} disabled={busy} onClick={() => props.onMoodChange(props.moodId === moodId ? null : moodId)}>{props.copy.timeline.moodLabels[moodId]}</button>)}</fieldset>
      <label className={styles.textareaLabel} htmlFor="client-astro-diary-entry-body">{props.copy.entry.bodyLabel}</label>
      <textarea ref={textareaRef} id="client-astro-diary-entry-body" className={styles.textarea} maxLength={20_000} value={props.body} placeholder={props.copy.entry.placeholder} disabled={busy} onChange={(event) => props.onBodyChange(event.target.value)} />
      <div className={styles.actions}><span className={styles.characterCount}>{props.copy.entry.characterCountLabel(props.body.length, 20_000)}</span><button className={styles.secondaryButton} type="button" disabled={!canSave} onClick={() => props.onSave(props.body, props.moodId)}>{props.isSaving ? props.copy.entry.savingLabel : props.copy.entry.saveLabel}</button><button className={styles.publishButton} type="button" disabled={!canPublish} onClick={props.onPublish}><Icon iconName="check" width={15} height={15} aria-hidden="true" />{props.isPublishing ? props.copy.entry.publishingLabel : props.copy.entry.publishLabel}</button></div>
    </section>
  );
}
