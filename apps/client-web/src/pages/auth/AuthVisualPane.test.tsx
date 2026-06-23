import { MotionText } from "@elevenhouse/design-system/motion";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { clientCopyByLocale } from "../../common/i18n/clientCopy";
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
  it("renders localized English visual pane copy", () => {
    const pane = AuthVisualPane({
      copy: clientCopyByLocale.en.auth.visual,
      motionKey: "en"
    });
    const serializedPane = JSON.stringify(pane.props.children);

    expect(serializedPane).toContain("Astrologer's page");
    expect(serializedPane).toContain("Your space");
    expect(serializedPane).toContain("with your astrologer");
    expect(serializedPane).toContain("Sessions and online consultations");
    expect(serializedPane).toContain("Session history, recordings, and materials");
    expect(serializedPane).toContain("Already connected with astrologers");
    expect(serializedPane).not.toContain("На страницу астролога");
    expect(serializedPane).not.toContain("Ваш кабинет");
    expect(serializedPane).not.toContain("Уже с астрологами");
  });

  it("animates visible localized copy with the locale transition key", () => {
    const pane = AuthVisualPane({
      copy: clientCopyByLocale.en.auth.visual,
      motionKey: "en"
    });

    expect(findElementByTransitionKey(pane, "en:backLinkTitle:Astrologer's page")?.type).toBe(
      MotionText
    );
    expect(findElementByTransitionKey(pane, "en:heroTitleLine1:Your space")?.type).toBe(
      MotionText
    );
    expect(
      findElementByTransitionKey(pane, "en:highlight:sessions:Sessions and online consultations")
        ?.type
    ).toBe(MotionText);
    expect(
      findElementByTransitionKey(pane, "en:joinedInfoPrefix:Already connected with astrologers")
        ?.type
    ).toBe(MotionText);
  });
});
