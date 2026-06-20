import type { ReactNode } from "react";

export type MotionContentProps = {
  transitionKey: string | number;
  children: ReactNode;
  className?: string;
};

export function MotionContent({ transitionKey, children, className }: MotionContentProps) {
  const resolvedClassName = ["ehMotionContent", className].filter(Boolean).join(" ");

  return (
    <div className={resolvedClassName} key={transitionKey}>
      {children}
    </div>
  );
}
