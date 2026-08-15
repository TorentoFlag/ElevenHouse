import type { ReactNode } from "react";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import styles from "./ChartHorarySetup.module.css";

export function ChartHorarySetup({
  calculateAction,
  children,
  copy
}: {
  readonly calculateAction: ReactNode;
  readonly children: ReactNode;
  readonly copy: ChartEngineCopy;
}) {
  return (
    <aside className={styles.setupPanel} aria-label={copy.horary.setupTitle}>
      <header className={styles.header}>
        <p>{copy.modes.horary.title}</p>
        <h2>{copy.horary.setupTitle}</h2>
      </header>
      <div className={styles.controls}>{children}</div>
      <footer className={styles.footer}>{calculateAction}</footer>
    </aside>
  );
}
