import styles from "./ClientsCrm.module.css";

type ClientCrmAvatarProps = {
  readonly name: string;
  readonly size?: number;
};

export function ClientCrmAvatar({ name, size = 42 }: ClientCrmAvatarProps) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.34)) }}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "CL";
}
