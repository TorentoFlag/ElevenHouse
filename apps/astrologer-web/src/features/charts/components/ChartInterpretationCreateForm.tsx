import { useEffect, useRef, useState } from "react";
import {
  createDictionaryCustomEntryRequestSchema,
  type DictionaryLocale
} from "@elevenhouse/contracts";
import { useCreateDictionaryCustomEntryMutation } from "../../dictionary/model/useCreateDictionaryCustomEntryMutation";
import { useDictionaryCategoriesQuery } from "../../dictionary/model/useDictionaryCategoriesQuery";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import type { ChartInterpretationAnchor } from "../model/chartInterpretations";
import styles from "./ChartEnginePage.module.css";

type ChartInterpretationCreateFormCopy = ChartEngineCopy["tables"]["interpretationEditor"];

export function ChartInterpretationCreateForm({
  anchor,
  copy,
  locale,
  onCancel,
  onSaved
}: {
  readonly anchor: ChartInterpretationAnchor;
  readonly copy: ChartInterpretationCreateFormCopy;
  readonly locale: DictionaryLocale;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}) {
  const categoriesQuery = useDictionaryCategoriesQuery({ locale });
  const createEntryMutation = useCreateDictionaryCustomEntryMutation();
  const [title, setTitle] = useState(anchor.label);
  const [content, setContent] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const category = categoriesQuery.data?.categories.find(
    (candidate) => candidate.code === anchor.categoryCode
  );
  const request = {
    categoryId: category?.id ?? "",
    locale,
    code: anchor.code,
    title: title.trim(),
    content: content.trim()
  };
  const canSave =
    Boolean(category) && createDictionaryCustomEntryRequestSchema.safeParse(request).success;

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  return (
    <section className={styles.interpretationEditor} aria-label={copy.ariaLabel(anchor.label)}>
      <header className={styles.interpretationEditorHeader}>
        <button
          aria-label={copy.backAriaLabel}
          className={styles.interpretationEditorBack}
          type="button"
          onClick={onCancel}
        >
          ←
        </button>
        <div>
          <p>{copy.kicker}</p>
          <h2>{anchor.label}</h2>
        </div>
      </header>
      <p className={styles.interpretationEditorDescription}>{copy.description}</p>
      {categoriesQuery.isLoading ? (
        <p className={styles.interpretationEditorStatus} role="status">
          {copy.categoriesLoading}
        </p>
      ) : null}
      {!categoriesQuery.isLoading && (categoriesQuery.isError || !category) ? (
        <p className={styles.interpretationEditorError} role="alert">
          {copy.categoriesError}
        </p>
      ) : null}
      {category ? (
        <form
          className={styles.interpretationEditorForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave || createEntryMutation.isPending) return;

            createEntryMutation
              .mutateAsync(request)
              .then(onSaved)
              .catch(() => undefined);
          }}
        >
          <p className={styles.interpretationEditorCategory}>
            <span>{copy.categoryLabel}</span>
            {category.name}
          </p>
          <label className={styles.interpretationEditorField}>
            <span>{copy.titleLabel}</span>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          <label className={styles.interpretationEditorField}>
            <span>{copy.contentLabel}</span>
            <textarea
              value={content}
              placeholder={copy.contentPlaceholder}
              rows={8}
              onChange={(event) => setContent(event.currentTarget.value)}
            />
          </label>
          {createEntryMutation.isError ? (
            <p className={styles.interpretationEditorError} role="alert">
              {copy.saveError}
            </p>
          ) : null}
          <div className={styles.interpretationEditorActions}>
            <button type="button" onClick={onCancel}>
              {copy.cancel}
            </button>
            <button type="submit" disabled={!canSave || createEntryMutation.isPending}>
              {createEntryMutation.isPending ? copy.saving : copy.save}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
