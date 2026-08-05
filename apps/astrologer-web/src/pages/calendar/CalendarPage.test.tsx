import { Button } from "@elevenhouse/design-system/components/Button";
import { describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { CalendarPage } from "./CalendarPage";

const navigate = vi.fn();
const refetchProfile = vi.fn();

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: () => ({ dictionary: astrologerCopyByLocale.ru, locale: "ru" })
}));

vi.mock("react-router", () => ({
  useLocation: () => ({ search: "" }),
  useNavigate: () => navigate
}));

vi.mock("../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery", () => ({
  useCurrentAstrologerProfileQuery: () => ({
    isLoading: false,
    isError: false,
    data: { profile: null },
    refetch: refetchProfile
  })
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: vi.fn()
}));

describe("CalendarPage", () => {
  it("explains the missing astrologer profile precondition and links to settings", () => {
    const page = CalendarPage();
    const [, body, action] = page.props.children;

    expect(body.props.children[0].props.children).toBe("Заполните профиль астролога");
    expect(body.props.children[1].props.children).toBe(
      "Календарю нужен часовой пояс, чтобы корректно показывать записи и доступность."
    );
    expect(action.type).toBe(Button);
    expect(action.props.title).toBe("Перейти в настройки");

    action.props.onClick();
    expect(navigate).toHaveBeenCalledWith("/settings");
    expect(refetchProfile).not.toHaveBeenCalled();
  });
});
