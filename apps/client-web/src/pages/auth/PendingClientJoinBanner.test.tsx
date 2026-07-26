import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PendingClientJoinBanner } from "./PendingClientJoinBanner";

describe("PendingClientJoinBanner", () => {
  it("explains which astrologer will be linked after auth", () => {
    const markup = renderToStaticMarkup(
      <PendingClientJoinBanner
        context={{
          token: "join_1234567890abcdef",
          astrologer: {
            userId: "22222222-2222-4222-8222-222222222222",
            publicHandle: "alisa-vega",
            publicName: "Алиса Вега"
          },
          expiresAt: "2026-07-06T11:00:00.000Z"
        }}
      />
    );

    expect(markup).toContain("Вы присоединяетесь к астрологу");
    expect(markup).toContain("Алиса Вега");
    expect(markup).toContain("@alisa-vega");
  });
});
