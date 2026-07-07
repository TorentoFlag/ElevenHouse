const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function useLandingReveal() {
  let observer: IntersectionObserver | null = null;

  return (node: HTMLElement | null) => {
    if (!node) {
      observer?.disconnect();
      observer = null;
      return;
    }

    if (shouldRevealImmediately()) {
      node.dataset.motionVisible = "true";
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          const target = entry.target as HTMLElement;
          target.dataset.motionVisible = "true";
          observer?.unobserve(target);
        }
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.16
      }
    );

    observer.observe(node);
  };
}

function shouldRevealImmediately() {
  if (typeof window === "undefined") {
    return true;
  }

  if (!("IntersectionObserver" in window)) {
    return true;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
