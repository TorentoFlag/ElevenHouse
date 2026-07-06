import { useEffect, useRef } from "react";
import { classNames } from "../../helpers/classNames.js";
import type { InfiniteScrollIntersectionState, InfiniteScrollTriggerProps } from "./types.js";

export function shouldLoadMoreOnIntersect({
  enabled,
  hasMore,
  isLoading,
  isIntersecting
}: InfiniteScrollIntersectionState) {
  return enabled && hasMore && !isLoading && isIntersecting;
}

export function InfiniteScrollTrigger({
  enabled,
  hasMore,
  isLoading,
  loadingLabel,
  rootMargin = "240px 0px",
  className,
  onLoadMore,
  ...triggerProps
}: InfiniteScrollTriggerProps) {
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !hasMore || isLoading) {
      return undefined;
    }

    const node = triggerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) =>
            shouldLoadMoreOnIntersect({
              enabled,
              hasMore,
              isLoading,
              isIntersecting: entry.isIntersecting
            })
          )
        ) {
          onLoadMore();
        }
      },
      { rootMargin }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [enabled, hasMore, isLoading, onLoadMore, rootMargin]);

  return (
    <div
      {...triggerProps}
      ref={triggerRef}
      className={classNames("ehInfiniteScrollTrigger", className)}
      aria-hidden={!isLoading}
    >
      {isLoading ? <span className="ehInfiniteScrollTrigger__label">{loadingLabel}</span> : null}
    </div>
  );
}
