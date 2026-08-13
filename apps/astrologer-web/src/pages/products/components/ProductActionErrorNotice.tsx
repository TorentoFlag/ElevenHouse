import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import styles from "../ProductsPage.module.css";

export type ProductActionErrorNoticeProps = {
  readonly message: string;
  readonly reloadLabel: string;
  readonly onReload: () => Promise<void> | void;
};

export function ProductActionErrorNotice({
  message,
  reloadLabel,
  onReload
}: ProductActionErrorNoticeProps) {
  return (
    <div className={styles.productActionErrorNotice} role="alert">
      <p>{message}</p>
      <Button
        type="button"
        variant="glass"
        size="small"
        title={reloadLabel}
        onClick={() => void onReload()}
      />
    </div>
  );
}
