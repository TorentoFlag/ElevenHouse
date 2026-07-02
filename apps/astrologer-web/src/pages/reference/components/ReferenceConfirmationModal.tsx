import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import styles from "../ReferencePage.module.css";

export type ReferenceConfirmationActionAttribute =
  | "data-reference-reset-confirmation-action"
  | "data-reference-delete-confirmation-action";

export type ReferenceConfirmationModalProps = {
  readonly title: string;
  readonly closeLabel: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly isPending: boolean;
  readonly actionDataAttribute: ReferenceConfirmationActionAttribute;
  readonly onConfirm: () => void | Promise<void>;
  readonly onCancel: () => void;
};

export function ReferenceConfirmationModal({
  title,
  closeLabel,
  description,
  confirmLabel,
  cancelLabel,
  isPending,
  actionDataAttribute,
  onConfirm,
  onCancel
}: ReferenceConfirmationModalProps) {
  return (
    <Modal title={title} closeLabel={closeLabel} onClose={onCancel}>
      <div className={styles.resetConfirmation}>
        <p className={styles.resetConfirmationDescription}>{description}</p>
        <div className={styles.resetConfirmationActions}>
          <Button
            className={styles.resetConfirmationButton}
            type="button"
            variant="brand"
            size="medium"
            title={confirmLabel}
            disabled={isPending}
            {...{ [actionDataAttribute]: "confirm" }}
            onClick={onConfirm}
          />
          <Button
            type="button"
            variant="glass"
            size="medium"
            title={cancelLabel}
            disabled={isPending}
            {...{ [actionDataAttribute]: "cancel" }}
            onClick={onCancel}
          />
        </div>
      </div>
    </Modal>
  );
}
