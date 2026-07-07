import { cssVars } from "../common/cssVars";

type AvatarProps = {
  readonly initials: string;
  readonly size?: number;
};

export function Avatar({ initials, size = 36 }: AvatarProps) {
  return (
    <span className="avatar" style={cssVars({ "--avatar-size": `${size}px` })}>
      {initials}
    </span>
  );
}
