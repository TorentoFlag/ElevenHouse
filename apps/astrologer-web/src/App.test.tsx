import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ASTROLOGER_WEB_APP_TITLE } from "./app-title";
import { App } from "./App";

vi.mock("./router", () => ({ router: {} }));

describe("astrologer web shell", () => {
  it("exposes the astrologer web app title", () => {
    expect(ASTROLOGER_WEB_APP_TITLE).toBe("ElevenHouse Astrologer Web");
  });

  it("lets the i18n provider resolve the initial workspace locale", () => {
    const appShell = App();
    const i18nProvider = getElementProps(appShell).children;

    expect(getElementProps(i18nProvider)).not.toHaveProperty("initialLocale");
  });
});

type TestElementProps = {
  children?: unknown;
};

function getElementProps(element: unknown) {
  if (!isValidElement<TestElementProps>(element)) {
    throw new Error("Expected a React element");
  }

  return element.props;
}
