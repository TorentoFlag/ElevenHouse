import { MotionContent, MotionHeight } from "@elevenhouse/design-system/motion";
import type { ReactNode } from "react";
import styles from "./AuthPage.module.css";

export type AuthStep = "credentials" | "code";

export type AuthStepMotionProps = {
  readonly step: AuthStep;
  readonly children: ReactNode;
};

export function AuthStepMotion({ step, children }: AuthStepMotionProps) {
  return (
    <MotionHeight className={styles.authStepMotionFrame} transitionKey={step}>
      <MotionContent className={styles.authStepMotionContent} transitionKey={step}>
        {children}
      </MotionContent>
    </MotionHeight>
  );
}
