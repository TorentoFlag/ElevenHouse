import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MePageView, type BirthProfileFormState } from "./MePageView";

const clientUserId = "11111111-1111-4111-8111-111111111111";

const defaultForm: BirthProfileFormState = {
  birthDate: "1990-03-14",
  birthPlaceText: "Москва",
  birthTime: "08:25",
  label: "Я"
};

describe("MePageView", () => {
  it("renders a direct-link-only cabinet without discovery affordances", () => {
    const markup = renderToStaticMarkup(
      <MePageView
        activeSection="home"
        form={defaultForm}
        overview={{
          astrologers: [
            {
              astrologerUserId: "22222222-2222-4222-8222-222222222222",
              publicHandle: "alisa-vega",
              publicName: "Алиса Вега",
              relationshipStatus: "active",
              firstLinkedAt: "2026-07-06T10:00:00.000Z",
              lastLinkedAt: "2026-07-06T10:00:00.000Z"
            }
          ],
          birthProfiles: [birthProfile()],
          summary: {
            directLinkOnly: true,
            upcomingBookingCount: 0,
            availableMaterialCount: 0,
            unreadNotificationCount: 0,
            activeSubscriptionCount: 0
          }
        }}
        status="ready"
        onFormChange={vi.fn()}
        onRetry={vi.fn()}
        onSectionChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(markup).toContain("Кабинет клиента");
    expect(markup).toContain("Связанные астрологи");
    expect(markup).toContain("Алиса Вега");
    expect(markup).toContain("Новые астрологи появляются здесь после входа по личной ссылке астролога.");
    expect(markup).toContain("Предстоящие консультации");
    expect(markup).toContain("Мои данные");
    expect(markup).not.toContain("Найти астролога");
    expect(markup).not.toContain("Каталог");
    expect(markup).not.toContain("Рекомендации");
  });

  it("renders birth profile management with the saved profile list", () => {
    const markup = renderToStaticMarkup(
      <MePageView
        activeSection="data"
        form={defaultForm}
        overview={{
          astrologers: [],
          birthProfiles: [
            birthProfile({ label: "Я", isPrimary: true }),
            birthProfile({ id: "66666666-6666-4666-8666-666666666666", label: "Партнёр", isPrimary: false })
          ],
          summary: {
            directLinkOnly: true,
            upcomingBookingCount: 0,
            availableMaterialCount: 0,
            unreadNotificationCount: 0,
            activeSubscriptionCount: 0
          }
        }}
        status="ready"
        onFormChange={vi.fn()}
        onRetry={vi.fn()}
        onSectionChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(markup).toContain("Данные рождения");
    expect(markup).toContain("Основной профиль");
    expect(markup).toContain("Партнёр");
    expect(markup).toContain("Сохранить основной профиль");
    expect(markup).toContain('name="birthDate"');
    expect(markup).toContain('name="birthTime"');
  });
});

function birthProfile(
  overrides: Partial<{ id: string; label: string; isPrimary: boolean }> = {}
) {
  return {
    id: overrides.id ?? "55555555-5555-4555-8555-555555555555",
    clientUserId,
    label: overrides.label ?? "Я",
    birthDate: "1990-03-14",
    birthTime: "08:25",
    birthTimePrecision: "exact" as const,
    birthPlaceText: "Москва",
    birthCountryCode: null,
    birthCity: null,
    birthRegion: null,
    birthTimezone: null,
    birthTimeDstOccurrence: null,
    birthLatitude: null,
    birthLongitude: null,
    source: "client_profile" as const,
    isPrimary: overrides.isPrimary ?? true,
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z"
  };
}
