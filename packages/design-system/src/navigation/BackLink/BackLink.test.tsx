import { describe, expect, it, vi } from "vitest";
import { Button } from "../../components/Button/index.js";
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
    expect(element.props.startIcon.type.name).toBe("ArrowLeft");

    element.props.onClick();

    expect(navigate).toHaveBeenCalledWith("/");
  });
});
