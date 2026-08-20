import type { AstroDiaryMediaUploadPurpose } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import type { AstroDiaryActionError } from "../model/astroDiaryErrorModel";
import type { AstroDiaryReplyDraftState } from "../model/useAstroDiaryReplyMutations";
import styles from "./AstroDiaryReplyComposer.module.css";

export type AstroDiaryReplyComposerAttachment = Readonly<{
  mediaId: string;
  fileName: string;
  purpose: AstroDiaryMediaUploadPurpose;
}>;

type AstroDiaryReplyComposerProps = Readonly<{
  copy: AstrologerCopy["astroDiary"];
  draft: AstroDiaryReplyDraftState | null;
  body: string;
  attachments: readonly AstroDiaryReplyComposerAttachment[];
  attachmentError: boolean;
  isUploadingAttachment: boolean;
  error: AstroDiaryActionError | null;
  isSaving: boolean;
  isPublishing: boolean;
  onOpen?: () => void;
  onBodyChange: (body: string) => void;
  onAttachFile: (file: File, purpose: AstroDiaryMediaUploadPurpose) => void;
  onRemoveAttachment: (mediaId: string) => void;
  onReloadLatest: () => void;
  onSave: (body: string, attachmentIds: readonly string[]) => void;
  onPublish: () => void;
}>;

export function AstroDiaryReplyComposer({
  copy,
  draft,
  body,
  attachments,
  attachmentError,
  isUploadingAttachment,
  error,
  isSaving,
  isPublishing,
  onOpen,
  onBodyChange,
  onAttachFile,
  onRemoveAttachment,
  onReloadLatest,
  onSave,
  onPublish
}: AstroDiaryReplyComposerProps) {
  const [isOpen, setIsOpen] = useState(Boolean(draft || body || attachments.length > 0));
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
            onOpen?.();
          }}
        >
          <Icon iconName="chat" width={16} height={16} aria-hidden="true" />
          {copy.reply.writeLabel}
        </button>
      </div>
    );
  }

  const isBusy = isSaving || isPublishing || isUploadingAttachment;
  const attachmentIds = attachments.map((attachment) => attachment.mediaId);
  const saved = Boolean(
    draft && body === draft.body && sameIds(attachmentIds, draft.attachmentIds)
  );
  const canSave = body.trim().length > 0 && body.length <= 20_000 && !isBusy && !saved;
  const canPublish = Boolean(draft) && saved && !isBusy;

  return (
    <section className={styles.composer} aria-labelledby="astro-diary-reply-title">
      <div className={styles.composerHeader}>
        <div>
          <p className={styles.modeLabel}>{copy.reply.modeLabel}</p>
          <h3 id="astro-diary-reply-title" className={styles.title}>
            {copy.reply.title}
          </h3>
        </div>
        <span className={styles.saveStatus} aria-live="polite">
          {isUploadingAttachment
            ? copy.reply.uploadingAttachmentLabel
            : isSaving
              ? copy.reply.savingLabel
              : saved
                ? copy.reply.savedLabel
                : copy.reply.unsavedLabel}
        </span>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          <p>{copy.reply.errors[error]}</p>
          {error === "stale" || error === "no_cycle" || error === "no_obligation" ? (
            <span className={styles.errorActions}>
              {error === "stale" ? (
                <button type="button" onClick={() => textareaRef.current?.focus()}>
                  {copy.reply.reviewDraftLabel}
                </button>
              ) : null}
              <button type="button" onClick={onReloadLatest}>
                <Icon iconName="refresh" width={14} height={14} aria-hidden="true" />
                {copy.reply.reloadLatestLabel}
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
      {attachmentError ? (
        <p className={styles.attachmentError} role="alert">
          {copy.reply.attachmentErrorLabel}
        </p>
      ) : null}

      <label className={styles.textareaLabel} htmlFor="astro-diary-reply-body">
        {copy.reply.bodyLabel}
      </label>
      <textarea
        ref={textareaRef}
        id="astro-diary-reply-body"
        className={styles.textarea}
        maxLength={20_000}
        value={body}
        placeholder={copy.reply.placeholder}
        disabled={isBusy}
        onChange={(event) => onBodyChange(event.target.value)}
      />
      <div className={styles.attachmentBar}>
        <AttachmentInput
          id="astro-diary-reply-file"
          label={copy.reply.attachFileLabel}
          iconName="doc"
          accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
          disabled={isBusy}
          onFile={(file) => onAttachFile(file, "astro_diary_attachment")}
        />
        <AttachmentInput
          id="astro-diary-reply-voice"
          label={copy.reply.attachVoiceLabel}
          iconName="mic"
          accept="audio/ogg,audio/mpeg,audio/mp4"
          disabled={isBusy}
          onFile={(file) => onAttachFile(file, "astro_diary_voice")}
        />
      </div>
      {attachments.length > 0 ? (
        <ul className={styles.attachmentList} aria-label={copy.reply.attachFileLabel}>
          {attachments.map((attachment) => (
            <li key={attachment.mediaId} className={styles.attachmentChip}>
              <span>{attachment.fileName}</span>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onRemoveAttachment(attachment.mediaId)}
              >
                {copy.reply.removeAttachmentLabel(attachment.fileName)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.actions}>
        <span className={styles.characterCount}>
          {copy.reply.characterCountLabel(body.length, 20_000)}
        </span>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={!canSave}
          onClick={() => onSave(body, attachmentIds)}
        >
          {isSaving ? copy.reply.savingLabel : copy.reply.saveLabel}
        </button>
        <button
          className={styles.publishButton}
          type="button"
          disabled={!canPublish}
          onClick={onPublish}
        >
          <Icon iconName="check" width={15} height={15} aria-hidden="true" />
          {isPublishing ? copy.reply.publishingLabel : copy.reply.publishLabel}
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
