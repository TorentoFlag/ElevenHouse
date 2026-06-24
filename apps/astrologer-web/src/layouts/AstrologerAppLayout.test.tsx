import { Outlet } from "react-router";
import { describe, expect, it } from "vitest";
import { AstrologerAppLayout } from "./AstrologerAppLayout";
import styles from "./AstrologerAppLayout.module.css";

describe("AstrologerAppLayout", () => {
  it("provides a persistent app shell main region for protected pages", () => {
    const layout = AstrologerAppLayout();

    expect(layout.type).toBe("div");
    expect(layout.props.className).toBe(styles.shell);

    const main = layout.props.children;

    expect(main.type).toBe("main");
    expect(main.props.className).toBe(styles.main);
    expect(main.props["aria-label"]).toBe("Astrologer workspace");
    expect(main.props.children.type).toBe(Outlet);
  });
});
