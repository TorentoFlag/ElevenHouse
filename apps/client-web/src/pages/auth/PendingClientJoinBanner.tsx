import type { PendingClientJoinIntent } from "../../features/client-join/model/clientJoinStorage";
import styles from "./AuthPage.module.css";

export function PendingClientJoinBanner({
  context
}: {
  readonly context: PendingClientJoinIntent;
}) {
  return (
    <aside className={styles.joinBanner} aria-label="Привязка к астрологу">
      <span className={styles.joinBannerAvatar}>{getInitials(context.astrologer.publicName)}</span>
      <span>
        <strong>Вы присоединяетесь к астрологу</strong>
        <small>
          {context.astrologer.publicName} · @{context.astrologer.publicHandle}
        </small>
      </span>
    </aside>
  );
}

function getInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
