import type { HTMLAttributes } from "react";

export type InfiniteScrollTriggerProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  readonly enabled: boolean;
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  readonly loadingLabel: string;
  readonly rootMargin?: string;
  readonly onLoadMore: () => void;
};

export type InfiniteScrollIntersectionState = {
  readonly enabled: boolean;
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  readonly isIntersecting: boolean;
};
