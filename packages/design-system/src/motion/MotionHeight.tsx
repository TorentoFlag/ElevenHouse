import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { classNames } from "../helpers/classNames.js";

const defaultMotionHeightDurationMs = 320;

export type MotionHeightProps = {
  transitionKey: string | number;
  children: ReactNode;
  className?: string;
  durationMs?: number;
};

export function MotionHeight({
  transitionKey,
  children,
  className,
  durationMs = defaultMotionHeightDurationMs
}: MotionHeightProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousTransitionKeyRef = useRef(transitionKey);
  const previousHeightRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [frameHeight, setFrameHeight] = useState<string | undefined>(undefined);
  const [isSwitching, setIsSwitching] = useState(false);
  const rootClassName = classNames(
    "ehMotionHeight",
    { "ehMotionHeight--switching": isSwitching },
    className
  );

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }

    const nextHeight = content.scrollHeight;
    const previousHeight = previousHeightRef.current;

    if (previousTransitionKeyRef.current === transitionKey || previousHeight === null) {
      previousTransitionKeyRef.current = transitionKey;
      previousHeightRef.current = nextHeight;
      return;
    }

    setIsSwitching(true);
    setFrameHeight(`${previousHeight}px`);
    clearPendingHeightTransition(animationFrameRef, resetTimeoutRef);

    animationFrameRef.current = window.requestAnimationFrame(() => {
      setFrameHeight(`${nextHeight}px`);
    });

    resetTimeoutRef.current = setTimeout(() => {
      setFrameHeight(undefined);
      setIsSwitching(false);
      previousHeightRef.current = content.scrollHeight;
    }, durationMs);

    previousTransitionKeyRef.current = transitionKey;
    previousHeightRef.current = nextHeight;
  }, [durationMs, transitionKey]);

  useEffect(
    () => () => {
      clearPendingHeightTransition(animationFrameRef, resetTimeoutRef);
    },
    []
  );

  return (
    <div className={rootClassName} style={frameHeight ? { height: frameHeight } : undefined}>
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

function clearPendingHeightTransition(
  animationFrameRef: { current: number | null },
  resetTimeoutRef: { current: ReturnType<typeof setTimeout> | null }
) {
  if (animationFrameRef.current !== null) {
    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }

  if (resetTimeoutRef.current !== null) {
    clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = null;
  }
}
