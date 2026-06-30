import type { AnchorHTMLAttributes, ReactNode } from "react";

export type NavigationDrawerBrand = {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly logo?: ReactNode;
};

export type NavigationDrawerItem = {
  readonly id: string;
  readonly title: ReactNode;
  readonly href?: string;
  readonly icon: ReactNode;
  readonly badge?: ReactNode;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly locked?: boolean;
  readonly external?: boolean;
  readonly ariaLabel?: string;
};

export type NavigationDrawerResolvedItem = {
  readonly id: string;
  readonly title: ReactNode;
  readonly href: string | undefined;
  readonly icon: ReactNode;
  readonly badge: ReactNode | null;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly locked: boolean;
  readonly external: boolean;
  readonly ariaLabel: string | undefined;
};

export type NavigationDrawerLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  readonly "data-navigation-drawer-item-id": string;
};

export type NavigationDrawerRenderLink = (
  item: NavigationDrawerResolvedItem,
  props: NavigationDrawerLinkProps,
  children: ReactNode
) => ReactNode;

export type NavigationDrawerProps = {
  readonly ariaLabel: string;
  readonly brand: NavigationDrawerBrand;
  readonly items: readonly NavigationDrawerItem[];
  readonly footer?: ReactNode;
  readonly collapsed?: boolean;
  readonly className?: string;
  readonly collapseLabel: string;
  readonly expandLabel: string;
  readonly renderLink: NavigationDrawerRenderLink;
  readonly onCollapsedChange?: (collapsed: boolean) => void;
};
