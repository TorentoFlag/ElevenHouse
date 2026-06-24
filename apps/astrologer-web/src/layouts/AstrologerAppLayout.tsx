import { Outlet } from "react-router";
import styles from "./AstrologerAppLayout.module.css";

export function AstrologerAppLayout() {
  return (
    <div className={styles.shell}>
      <main className={styles.main} aria-label="Astrologer workspace">
        <Outlet />
      </main>
    </div>
  );
}
