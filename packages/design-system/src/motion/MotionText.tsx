import type { ReactNode } from "react";
import { classNames } from "../helpers/classNames.js";

export type MotionTextProps = {
  transitionKey: string | number;
  children: ReactNode;
  className?: string;
};

export function MotionText({ transitionKey, children, className }: MotionTextProps) {
  return (
    <span className={classNames("ehMotionText", className)} key={transitionKey}>
      {children}
    </span>
  );
}
