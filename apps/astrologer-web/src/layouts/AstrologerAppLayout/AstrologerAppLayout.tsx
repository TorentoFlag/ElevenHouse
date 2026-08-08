import { AstrologerHeader } from "../AstrologerHeader";
import { AstrologerNavigationDrawer } from "../AstrologerNavigationDrawer";
import { AstrologerMobileNavigation } from "../AstrologerMobileNavigation";
import styles from "./AstrologerAppLayout.module.css";
import { AstrologerRouteOutlet } from "./AstrologerRouteOutlet";

export function AstrologerAppLayout() {
  return (
    <div className={styles.shell}>
      <div className={styles.desktopNavigation}>
        <AstrologerNavigationDrawer />
      </div>
      <div className={styles.workspace}>
        <AstrologerHeader />
        <main className={styles.main} aria-label="Astrologer workspace">
          <AstrologerRouteOutlet />
        </main>
        <div className={styles.mobileNavigation}>
          <AstrologerMobileNavigation />
        </div>
      </div>
    </div>
  );
}
