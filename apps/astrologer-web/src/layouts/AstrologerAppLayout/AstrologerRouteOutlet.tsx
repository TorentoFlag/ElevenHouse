import { MotionRouteContent } from "@elevenhouse/design-system/motion";
import { useLayoutEffect, useRef } from "react";
import { useLocation, useOutlet } from "react-router";
import styles from "./AstrologerAppLayout.module.css";

export function AstrologerRouteOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const routeAnchorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scrollContainer = routeAnchorRef.current?.closest("main");

    if (scrollContainer instanceof HTMLElement) {
      scrollContainer.scrollTo({ left: 0, top: 0 });
    }
  }, [location.pathname]);

  return (
    <div className={styles.routeOutlet} ref={routeAnchorRef}>
      <MotionRouteContent className={styles.routeContent} transitionKey={location.pathname}>
        {outlet}
      </MotionRouteContent>
    </div>
  );
}
