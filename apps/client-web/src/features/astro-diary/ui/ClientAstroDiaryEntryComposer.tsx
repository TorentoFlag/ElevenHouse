import type { AstroDiaryMediaUploadPurpose, AstroDiaryMoodId } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ClientCopy } from "../../../common/i18n/clientCopy";
import type { ClientAstroDiaryActionError } from "../model/astroDiaryErrorModel";
import type { ClientAstroDiaryEntryDraftState } from "../model/useClientAstroDiaryEntryMutations";
import styles from "./ClientAstroDiaryEntryComposer.module.css";

const moodIds: readonly AstroDiaryMoodId[] = ["inspired", "joy", "calm", "tired", "anxious", "sad"];

export type ClientAstroDiaryComposerAttachment = Readonly<{
  mediaId: string;
  fileName: string;
  purpose: AstroDiaryMediaUploadPurpose;
}>;

export function ClientAstroDiaryEntryComposer(props: {
  readonly copy: ClientCopy["astroDiary"];
  readonly draft: ClientAstroDiaryEntryDraftState | null;
  readonly body: string;
  readonly moodId: AstroDiaryMoodId | null;
  readonly attachments: readonly ClientAstroDiaryComposerAttachment[];
  readonly attachmentError: boolean;
  readonly isUploadingAttachment: boolean;
  readonly error: ClientAstroDiaryActionError | null;
  readonly isSaving: boolean;
  readonly isPublishing: boolean;
  readonly onOpen: () => void;
  readonly onBodyChange: (body: string) => void;
  readonly onMoodChange: (moodId: AstroDiaryMoodId | null) => void;
  readonly onAttachFile: (file: File, purpose: AstroDiaryMediaUploadPurpose) => void;
  readonly onRemoveAttachment: (mediaId: string) => void;
  readonly onReloadLatest: () => void;
  readonly onSave: (
    body: string,
    moodId: AstroDiaryMoodId | null,
    attachmentIds: readonly string[]
  ) => void;
  readonly onPublish: () => void;
}) {
  const [isOpen, setIsOpen] = useState(
    Boolean(props.draft || props.body || props.attachments.length > 0)
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    textareaRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) {
    return (
      <div className={styles.closedComposer}>
        <button
          className={styles.openButton}
          type="button"
          onClick={() => {
            setIsOpen(true);
            props.onOpen();
          }}
        >
          <Icon iconName="edit" width={16} height={16} aria-hidden="true" />
          {props.copy.entry.writeLabel}
        </button>
      </div>
    );
  }

  const busy = props.isSaving || props.isPublishing || props.isUploadingAttachment;
  const attachmentIds = props.attachments.map((attachment) => attachment.mediaId);
  const saved = Boolean(
    props.draft &&
    props.body === props.draft.body &&
    props.moodId === props.draft.moodId &&
    sameIds(attachmentIds, props.draft.attachmentIds)
  );
  const canSave = props.body.trim().length > 0 && props.body.length <= 20_000 && !busy && !saved;
  const canPublish = Boolean(props.draft) && saved && !busy;

  return (
    <section className={styles.composer} aria-labelledby="client-astro-diary-entry-title">
      <div className={styles.composerHeader}>
        <div>
          <p className={styles.modeLabel}>{props.copy.entry.modeLabel}</p>
          <h3 id="client-astro-diary-entry-title" className={styles.title}>
            {props.copy.entry.title}
          </h3>
        </div>
        <span className={styles.saveStatus} aria-live="polite">
          {props.isUploadingAttachment
            ? props.copy.entry.uploadingAttachmentLabel
            : props.isSaving
              ? props.copy.entry.savingLabel
              : saved
                ? props.copy.entry.savedLabel
                : props.copy.entry.unsavedLabel}
        </span>
      </div>

      {props.error ? (
        <div className={styles.error} role="alert">
          <p>{props.copy.entry.errors[props.error]}</p>
          {props.error === "stale" || props.error === "state" ? (
            <span className={styles.errorActions}>
              {props.error === "stale" ? (
                <button type="button" onClick={() => textareaRef.current?.focus()}>
                  {props.copy.entry.reviewDraftLabel}
                </button>
              ) : null}
              <button type="button" onClick={props.onReloadLatest}>
                <Icon iconName="refresh" width={14} height={14} aria-hidden="true" />
                {props.copy.entry.reloadLatestLabel}
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
      {props.attachmentError ? (
        <p className={styles.attachmentError} role="alert">
          {props.copy.entry.attachmentErrorLabel}
        </p>
      ) : null}

      <fieldset className={styles.moods}>
        <legend>{props.copy.entry.moodLabel}</legend>
        {moodIds.map((moodId) => (
          <button
            key={moodId}
            type="button"
            aria-pressed={props.moodId === moodId}
            disabled={busy}
            onClick={() => props.onMoodChange(props.moodId === moodId ? null : moodId)}
          >
            {props.copy.timeline.moodLabels[moodId]}
          </button>
        ))}
      </fieldset>
      <label className={styles.textareaLabel} htmlFor="client-astro-diary-entry-body">
        {props.copy.entry.bodyLabel}
      </label>
      <textarea
        ref={textareaRef}
        id="client-astro-diary-entry-body"
        className={styles.textarea}
        maxLength={20_000}
        value={props.body}
        placeholder={props.copy.entry.placeholder}
        disabled={busy}
        onChange={(event) => props.onBodyChange(event.target.value)}
      />
      <div className={styles.attachmentBar}>
        <AttachmentInput
          id="client-astro-diary-file"
          label={props.copy.entry.attachFileLabel}
          iconName="doc"
          accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
          disabled={busy}
          onFile={(file) => props.onAttachFile(file, "astro_diary_attachment")}
        />
        <AttachmentInput
          id="client-astro-diary-voice"
          label={props.copy.entry.attachVoiceLabel}
          iconName="mic"
          accept="audio/ogg,audio/mpeg,audio/mp4"
          disabled={busy}
          onFile={(file) => props.onAttachFile(file, "astro_diary_voice")}
        />
      </div>
      {props.attachments.length > 0 ? (
        <ul className={styles.attachmentList} aria-label={props.copy.entry.attachFileLabel}>
          {props.attachments.map((attachment) => (
            <li key={attachment.mediaId} className={styles.attachmentChip}>
              <span>{attachment.fileName}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => props.onRemoveAttachment(attachment.mediaId)}
              >
                {props.copy.entry.removeAttachmentLabel(attachment.fileName)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.actions}>
        <span className={styles.characterCount}>
          {props.copy.entry.characterCountLabel(props.body.length, 20_000)}
        </span>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={!canSave}
          onClick={() => props.onSave(props.body, props.moodId, attachmentIds)}
        >
          {props.isSaving ? props.copy.entry.savingLabel : props.copy.entry.saveLabel}
        </button>
        <button
          className={styles.publishButton}
          type="button"
          disabled={!canPublish}
          onClick={props.onPublish}
        >
          <Icon iconName="check" width={15} height={15} aria-hidden="true" />
          {props.isPublishing ? props.copy.entry.publishingLabel : props.copy.entry.publishLabel}
        </button>
      </div>
    </section>
  );
}

function AttachmentInput(props: {
  readonly id: string;
  readonly label: string;
  readonly iconName: "doc" | "mic";
  readonly accept: string;
  readonly disabled: boolean;
  readonly onFile: (file: File) => void;
}) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) props.onFile(file);
  };

  return (
    <label className={styles.attachmentButton} htmlFor={props.id} aria-disabled={props.disabled}>
      <Icon iconName={props.iconName} width={14} height={14} aria-hidden="true" />
      {props.label}
      <input
        id={props.id}
        className={styles.fileInput}
        type="file"
        accept={props.accept}
        disabled={props.disabled}
        onChange={onChange}
      />
    </label>
  );
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => right[index] === value);
}
