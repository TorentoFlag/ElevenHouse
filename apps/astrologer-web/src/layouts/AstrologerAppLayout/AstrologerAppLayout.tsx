import { AstrologerHeader } from "../AstrologerHeader";
import { AstrologerNavigationDrawer } from "../AstrologerNavigationDrawer";
import styles from "./AstrologerAppLayout.module.css";
import { AstrologerRouteOutlet } from "./AstrologerRouteOutlet";

export function AstrologerAppLayout() {
  return (
    <div className={styles.shell}>
      <AstrologerNavigationDrawer />
      <div className={styles.workspace}>
        <AstrologerHeader />
        <main className={styles.main} aria-label="Astrologer workspace">
          <AstrologerRouteOutlet />
        </main>
      </div>
    </div>
  );
}
