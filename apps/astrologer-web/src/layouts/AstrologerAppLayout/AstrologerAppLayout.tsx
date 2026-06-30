import { Outlet } from "react-router";
import { AstrologerHeader } from "../AstrologerHeader";
import styles from "./AstrologerAppLayout.module.css";

export function AstrologerAppLayout() {
  return (
    <div className={styles.shell}>
      <AstrologerHeader />
      <main className={styles.main} aria-label="Astrologer workspace">
        <Outlet />
      </main>
    </div>
  );
}
