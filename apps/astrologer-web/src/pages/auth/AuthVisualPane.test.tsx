import { MotionText } from "@elevenhouse/design-system/motion";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AuthVisualPane } from "./AuthVisualPane";

function findElementByTransitionKey(node: unknown, transitionKey: string): ReactElement | null {
  if (!isValidElement(node)) {
    return null;
  }

  const props = node.props as { children?: unknown; transitionKey?: unknown };

  if (props.transitionKey === transitionKey) {
    return node;
  }

  const children = Array.isArray(props.children) ? props.children : [props.children];
  const title = (props as { title?: unknown }).title;
  const nodes = title === undefined ? children : [...children, title];

  for (const child of nodes) {
    const match = findElementByTransitionKey(child, transitionKey);

    if (match) {
      return match;
    }
  }

  return null;
}

describe("AuthVisualPane", () => {
  it("animates visible localized copy with the locale transition key", () => {
    const pane = AuthVisualPane({
      copy: astrologerCopyByLocale.en.auth.visual,
      motionKey: "en"
    });

    expect(findElementByTransitionKey(pane, "en:backLinkTitle:Home")?.type).toBe(MotionText);
    expect(findElementByTransitionKey(pane, "en:heroTitleLine1:A workspace that")?.type).toBe(
      MotionText
    );
    expect(
      findElementByTransitionKey(pane, "en:highlight:charts:Chart engine and all systems")?.type
    ).toBe(MotionText);
    expect(findElementByTransitionKey(pane, "en:joinedInfoPrefix:Already with us")?.type).toBe(
      MotionText
    );
  });
});
