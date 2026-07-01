import { describe, expect, it } from "vitest";
import { Button } from "@elevenhouse/design-system/components/Button";
import { Bell } from "@elevenhouse/design-system/icons/Bell";
import { ChevronDown } from "@elevenhouse/design-system/icons/ChevronDown";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import { Search } from "@elevenhouse/design-system/icons/Search";
import { Verified } from "@elevenhouse/design-system/icons/Verified";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstrologerHeaderView } from "./AstrologerHeader";
import styles from "./AstrologerHeader.module.css";

describe("AstrologerHeaderView", () => {
  it("renders the cabinet header controls from the selected design copy", () => {
    const header = AstrologerHeaderView({ copy: astrologerCopyByLocale.ru.appShell.header });
    const [searchWrap, actions] = header.props.children;
    const [, searchInput] = searchWrap.props.children;
    const [createButton, notificationButton, profileButton] = actions.props.children;
    const [avatar, profileText] = profileButton.props.children;

    expect(header.type).toBe("header");
    expect(header.props.className).toBe(styles.header);
    expect(searchWrap.props.className).toBe(styles.searchWrap);
    expect(searchWrap.props.children[0].type).toBe(Search);
    expect(searchInput.props.placeholder).toBe("Поиск клиентов, заказов, карт…");
    expect(actions.props.className).toBe(styles.actions);
    expect(createButton.type).toBe(Button);
    expect(createButton.props.className).toBe(styles.createButton);
    expect(createButton.props.title).toBe("Создать");
    expect(createButton.props.variant).toBe("brand");
    expect(createButton.props.size).toBe("big");
    expect(createButton.props["aria-label"]).toBe("Открыть меню создания");
    expect(createButton.props.startIcon.type).toBe(Plus);
    expect(createButton.props.endIcon.type).toBe(ChevronDown);
    expect(notificationButton.props.className).toBe(styles.notificationButton);
    expect(notificationButton.props["aria-label"]).toBe("Открыть уведомления");
    expect(notificationButton.props.children[0].type).toBe(Bell);
    expect(avatar.props.children).toBe("АВ");
    expect(profileText.props.children[0].props.children[0]).toBe("Алиса Вега");
    expect(profileText.props.children[0].props.children[1].type).toBe(Verified);
    expect(profileText.props.children[1].props.children).toBe("GMT+3, Москва");
  });
});
