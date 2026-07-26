import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicAstrologerPageView } from "./PublicAstrologerPageView";

describe("PublicAstrologerPageView", () => {
  it("renders a direct-link invitation without discovery affordances", () => {
    const markup = renderToStaticMarkup(
      <PublicAstrologerPageView
        state={{
          status: "ready",
          intent: {
            token: "join_1234567890abcdef",
            astrologer: {
              userId: "22222222-2222-4222-8222-222222222222",
              publicHandle: "alisa-vega",
              publicName: "Алиса Вега"
            },
            expiresAt: "2026-07-06T11:00:00.000Z"
          }
        }}
      />
    );

    expect(markup).toContain("Алиса Вега");
    expect(markup).toContain("@alisa-vega");
    expect(markup).toContain("Войти и привязать кабинет");
    expect(markup).toContain("личной ссылке");
    expect(markup).not.toContain("Каталог");
    expect(markup).not.toContain("Найти астролога");
    expect(markup).not.toContain("Рекомендации");
  });

  it("renders an unavailable state for invalid direct links", () => {
    const markup = renderToStaticMarkup(<PublicAstrologerPageView state={{ status: "error" }} />);

    expect(markup).toContain("Профиль недоступен");
    expect(markup).toContain("Проверьте ссылку");
  });
});
