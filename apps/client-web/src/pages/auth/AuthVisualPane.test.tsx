import { describe, expect, it } from "vitest";
import { clientCopyByLocale } from "../../common/i18n/clientCopy";
import { AuthVisualPane } from "./AuthVisualPane";

describe("AuthVisualPane", () => {
  it("renders localized English visual pane copy", () => {
    const pane = AuthVisualPane({
      copy: clientCopyByLocale.en.auth.visual
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
});
