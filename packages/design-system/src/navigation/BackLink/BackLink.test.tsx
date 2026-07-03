import { describe, expect, it, vi } from "vitest";
import { Button } from "../../components/Button/index.js";
import { Icon } from "../../icons/Icon/index.js";
import { BackLink } from "./BackLink.js";

const navigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => navigate
}));

describe("BackLink", () => {
  it("renders a button that navigates to the configured path", () => {
    const element = BackLink({
      title: "На главную",
      path: "/",
      className: "auth-back"
    });

    expect(element.type).toBe(Button);
    expect(element.props.type).toBe("button");
    expect(element.props.className).toBe("auth-back");
    expect(element.props["aria-label"]).toBe("На главную");
    expect(element.props.title).toBe("На главную");
    expect(element.props.variant).toBe("default");
    expect(element.props.size).toBe("medium");
    expect(element.props.startIcon.type).toBe(Icon);
    expect(element.props.startIcon.props.iconName).toBe("arrowLeft");

    element.props.onClick();

    expect(navigate).toHaveBeenCalledWith("/");
  });
});
