import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function Logo({ sub = "Кабинет астролога" }: { readonly sub?: ReactNode }) {
  return (
    <a className="logo" href="#top" aria-label="ElevenHouse">
      <span className="logo__mark">
        <Icon name="moon" size={34} />
      </span>
      <span className="logo__copy">
        <span className="logo__text">
          Eleven<span>House</span>
        </span>
        <span className="logo__sub">{sub}</span>
      </span>
    </a>
  );
}
