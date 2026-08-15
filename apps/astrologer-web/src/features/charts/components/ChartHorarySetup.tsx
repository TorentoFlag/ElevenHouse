import type { ReactNode } from "react";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import styles from "./ChartHorarySetup.module.css";

export function ChartHorarySetup({
  calculateAction,
  children,
  copy,
  readinessMessage
}: {
  readonly calculateAction: ReactNode;
  readonly children: ReactNode;
  readonly copy: ChartEngineCopy;
  readonly readinessMessage: string;
}) {
  return (
    <aside className={styles.setupPanel} aria-label={copy.horary.setupTitle}>
      <header className={styles.header}>
        <p>{copy.modes.horary.title}</p>
        <h2>{copy.horary.setupTitle}</h2>
        <span>{copy.horary.preparationDetail}</span>
      </header>
      <div className={styles.controls}>{children}</div>
      <footer className={styles.footer}>
        <p className={styles.readinessMessage}>{readinessMessage}</p>
        <div className={styles.actions}>{calculateAction}</div>
      </footer>
    </aside>
  );
}
