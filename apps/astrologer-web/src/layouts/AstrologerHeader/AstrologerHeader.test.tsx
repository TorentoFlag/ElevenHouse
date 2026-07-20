import { describe, expect, it } from "vitest";
import { Button } from "@elevenhouse/design-system/components/Button";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstrologerHeaderView } from "./AstrologerHeader";
import styles from "./AstrologerHeader.module.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

describe("AstrologerHeaderView", () => {
  it("renders the cabinet header controls with real profile display data", () => {
    const header = AstrologerHeaderView({
      copy: astrologerCopyByLocale.ru.appShell.header,
      profile: {
        avatarInitials: "АВ",
        avatarUrl: "https://cdn.example/profile/avatar.png",
        displayName: "Анна Вега",
        isLoading: false,
        isVerified: true,
        timezoneLabel: "GMT+3 · Europe/Moscow"
      }
    });
    const [searchWrap, actions] = header.props.children;
    const [, searchInput] = searchWrap.props.children;
    const [createButton, notificationButton, profileButton] = actions.props.children;
    const [avatar, profileText] = profileButton.props.children;

    expect(header.type).toBe("header");
    expect(header.props.className).toBe(styles.header);
    expect(searchWrap.props.className).toBe(styles.searchWrap);
    expect(searchWrap.props.children[0].type).toBe(Icon);
    expect(searchWrap.props.children[0].props.iconName).toBe("search");
    expect(searchInput.props.id).toBe("astrologer-global-search");
    expect(searchInput.props.name).toBe("astrologer-global-search");
    expect(searchInput.props.placeholder).toBe("Поиск клиентов, заказов, карт…");
    expect(actions.props.className).toBe(styles.actions);
    expect(createButton.type).toBe(Button);
    expect(createButton.props.className).toBe(styles.createButton);
    expect(createButton.props.title).toBe("Создать");
    expect(createButton.props.variant).toBe("brand");
    expect(createButton.props.size).toBe("big");
    expect(createButton.props["aria-label"]).toBe("Открыть меню создания");
    expect(createButton.props.startIcon.type).toBe(Icon);
    expect(createButton.props.startIcon.props.iconName).toBe("plus");
    expect(createButton.props.endIcon.type).toBe(Icon);
    expect(createButton.props.endIcon.props.iconName).toBe("chevronDown");
    expect(notificationButton.props.className).toBe(styles.notificationButton);
    expect(notificationButton.props["aria-label"]).toBe("Открыть уведомления");
    expect(notificationButton.props.children[0].type).toBe(Icon);
    expect(notificationButton.props.children[0].props.iconName).toBe("bell");
    expect(avatar.props.children.type).toBe("img");
    expect(avatar.props.children.props.src).toBe("https://cdn.example/profile/avatar.png");
    expect(avatar.props.children.props.alt).toBe("");
    expect(profileText.props.children[0].props.children.props.children[0]).toBe("Анна Вега");
    expect(profileText.props.children[0].props.children.props.children[1].type).toBe(Icon);
    expect(profileText.props.children[0].props.children.props.children[1].props.iconName).toBe(
      "verified"
    );
    expect(profileText.props.children[1].props.children).toBe("GMT+3 · Europe/Moscow");
  });

  it("renders initials and hides the verified icon when real verification is not approved", () => {
    const header = AstrologerHeaderView({
      copy: astrologerCopyByLocale.ru.appShell.header,
      profile: {
        avatarInitials: "НК",
        avatarUrl: null,
        displayName: "Нина Ковалёва",
        isLoading: false,
        isVerified: false,
        timezoneLabel: "GMT+4 · Asia/Yerevan"
      }
    });
    const [, actions] = header.props.children;
    const [, , profileButton] = actions.props.children;
    const [avatar, profileText] = profileButton.props.children;

    expect(avatar.props.children).toBe("НК");
    expect(profileText.props.children[0].props.children).toBe("Нина Ковалёва");
  });
});
