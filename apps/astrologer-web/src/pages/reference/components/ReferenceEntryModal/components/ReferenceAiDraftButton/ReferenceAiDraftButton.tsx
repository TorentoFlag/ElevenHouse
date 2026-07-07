import type { ButtonHTMLAttributes, MouseEvent } from "react";
import styles from "./ReferenceAiDraftButton.module.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

export type ReferenceAiDraftButtonState = "active" | "loading" | "error";

export type ReferenceAiDraftButtonCopy = {
  readonly label: string;
  readonly title: string;
  readonly loadingLabel: string;
  readonly loadingAnnouncement: string;
  readonly errorLabel: string;
  readonly errorTitle: string;
  readonly errorAnnouncement: string;
};

export type ReferenceAiDraftButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-disabled" | "children" | "onClick"
> & {
  readonly copy: ReferenceAiDraftButtonCopy;
  readonly state: ReferenceAiDraftButtonState;
  readonly onClick: () => void;
};

export function ReferenceAiDraftButton({
  copy,
  state,
  className,
  disabled,
  onClick,
  type = "button",
  ...buttonProps
}: ReferenceAiDraftButtonProps) {
  const isLoading = state === "loading";
  const isDisabled = disabled === true;
  const stateClassName =
    state === "loading" ? styles.buttonLoading : state === "error" ? styles.buttonError : "";
  const label = state === "loading" ? copy.loadingLabel : state === "error" ? copy.errorLabel : copy.label;
  const statusMessage =
    state === "loading"
      ? copy.loadingAnnouncement
      : state === "error"
        ? copy.errorAnnouncement
        : "";

  return (
    <button
      {...buttonProps}
      className={[styles.button, stateClassName, className].filter(Boolean).join(" ")}
      type={type}
      title={state === "error" ? copy.errorTitle : copy.title}
      data-state={state}
      {...(isDisabled ? { disabled: true } : {})}
      aria-disabled={isLoading ? true : undefined}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (isLoading || isDisabled) {
          event.preventDefault();
          return;
        }

        onClick();
      }}
    >
      <span className={styles.visual} aria-hidden="true">
        {isLoading ? (
          <span
            className={styles.spinner}
            aria-hidden="true"
            data-reference-ai-draft-spinner="true"
          />
        ) : (
          <Icon iconName="sparkle" width={12} height={12} aria-hidden="true" />
        )}
      </span>
      <span className={styles.label}>{label}</span>
      <span className={styles.status} aria-live="polite">
        {statusMessage}
      </span>
    </button>
  );
}
