import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useEffect, useRef, useState } from "react";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import type { AstroDiaryActionError } from "../model/astroDiaryErrorModel";
import type { AstroDiaryReplyDraftState } from "../model/useAstroDiaryReplyMutations";
import styles from "./AstroDiaryReplyComposer.module.css";

type AstroDiaryReplyComposerProps = Readonly<{
  copy: AstrologerCopy["astroDiary"];
  draft: AstroDiaryReplyDraftState | null;
  error: AstroDiaryActionError | null;
  isSaving: boolean;
  isPublishing: boolean;
  onOpen?: () => void;
  onReloadLatest: () => void;
  onSave: (body: string) => void;
  onPublish: () => void;
}>;

export function AstroDiaryReplyComposer({
  copy,
  draft,
  error,
  isSaving,
  isPublishing,
  onOpen,
  onReloadLatest,
  onSave,
  onPublish
}: AstroDiaryReplyComposerProps) {
  const [isOpen, setIsOpen] = useState(Boolean(draft));
  const [body, setBody] = useState(draft?.body ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    textareaRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (draft) setBody(draft.body);
  }, [draft]);

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

  const isBusy = isSaving || isPublishing;
  const canSave = body.trim().length > 0 && body.length <= 20_000 && !isBusy;
  const canPublish = Boolean(draft) && body === draft?.body && !isBusy;

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
          {isSaving
            ? copy.reply.savingLabel
            : draft && body === draft.body
              ? copy.reply.savedLabel
              : copy.reply.unsavedLabel}
        </span>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          <p>{copy.reply.errors[error]}</p>
          {error === "stale" ? (
            <span className={styles.errorActions}>
              <button type="button" onClick={() => textareaRef.current?.focus()}>
                {copy.reply.reviewDraftLabel}
              </button>
              <button type="button" onClick={onReloadLatest}>
                <Icon iconName="refresh" width={14} height={14} aria-hidden="true" />
                {copy.reply.reloadLatestLabel}
              </button>
            </span>
          ) : null}
        </div>
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
        onChange={(event) => setBody(event.target.value)}
      />
      <div className={styles.actions}>
        <span className={styles.characterCount}>
          {copy.reply.characterCountLabel(body.length, 20_000)}
        </span>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={!canSave || body === draft?.body}
          onClick={() => onSave(body)}
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
