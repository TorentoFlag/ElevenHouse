import type { ReactNode } from "react";
import { classNames } from "../helpers/classNames.js";

export type MotionContentProps = {
  transitionKey: string | number;
  children: ReactNode;
  className?: string;
};

export function MotionContent({ transitionKey, children, className }: MotionContentProps) {
  const resolvedClassName = classNames("ehMotionContent", className);

  return (
    <div className={resolvedClassName} key={transitionKey}>
      {children}
    </div>
  );
}
