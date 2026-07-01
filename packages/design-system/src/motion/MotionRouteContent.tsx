import type { CSSProperties, ReactNode } from "react";
import { classNames } from "../helpers/classNames.js";

const defaultViewTransitionName = "eh-page";

export type MotionRouteContentProps = {
  transitionKey: string | number;
  children: ReactNode;
  className?: string;
  viewTransitionName?: string;
};

export function MotionRouteContent({
  transitionKey,
  children,
  className,
  viewTransitionName = defaultViewTransitionName
}: MotionRouteContentProps) {
  const resolvedClassName = classNames(
    "ehMotionRouteContent",
    { "ehMotionRouteContent--fallback": !supportsDocumentViewTransitions() },
    className
  );
  const routeTransitionStyle: CSSProperties = {
    viewTransitionName
  };

  return (
    <div className={resolvedClassName} key={transitionKey} style={routeTransitionStyle}>
      {children}
    </div>
  );
}

function supportsDocumentViewTransitions() {
  return typeof document !== "undefined" && "startViewTransition" in document;
}
