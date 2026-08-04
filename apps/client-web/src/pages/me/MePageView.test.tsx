import { renderToStaticMarkup } from "react-dom/server";
import { canonicalChartAiConsentNotices } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { clientCopyByLocale } from "../../common/i18n/clientCopy";
import { MePageView, type BirthProfileFormState } from "./MePageView";

const clientUserId = "11111111-1111-4111-8111-111111111111";

const defaultForm: BirthProfileFormState = {
  birthDate: "1990-03-14",
  birthPlaceText: "Москва, Россия",
  birthCity: "Москва",
  birthCountryCode: "RU",
  birthLatitude: 55.7558,
  birthLongitude: 37.6173,
  birthRegion: "Москва",
  birthTime: "08:25",
  birthTimeDstOccurrence: null,
  birthTimePrecision: "exact",
  birthTimezone: "Europe/Moscow",
  selectedBirthPlaceText: "Москва, Россия",
  label: "Я"
};

const defaultBirthPlaceSearch = {
  copy: clientCopyByLocale.ru.birthPlaceSearch,
  onSearch: vi.fn(async () => [])
};

const defaultConsentSection = {
  cards: [],
  copy: clientCopyByLocale.ru.chartAiConsent,
  notice: canonicalChartAiConsentNotices.ru,
  noticeSha256: "sha256:ru",
  pendingAction: null,
  status: "ready" as const,
  onGrant: vi.fn(),
  onRetry: vi.fn(),
  onRevoke: vi.fn()
};

describe("MePageView", () => {
  it("renders a direct-link-only cabinet without discovery affordances", () => {
    const markup = renderToStaticMarkup(
      <MePageView
        activeSection="home"
        birthPlaceSearch={defaultBirthPlaceSearch}
        birthTimeOccurrenceCopy={clientCopyByLocale.ru.birthTimeOccurrence}
        consentSection={defaultConsentSection}
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
    expect(markup).toContain(
      "Новые астрологи появляются здесь после входа по личной ссылке астролога."
    );
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
        birthPlaceSearch={defaultBirthPlaceSearch}
        birthTimeOccurrenceCopy={clientCopyByLocale.ru.birthTimeOccurrence}
        consentSection={{
          ...defaultConsentSection,
          cards: [
            {
              astrologerUserId: "22222222-2222-4222-8222-222222222222",
              publicName: "Алиса Вега",
              publicHandle: "alisa-vega",
              state: "missing",
              consentId: null,
              grantedAt: null,
              revokedAt: null,
              canGrant: true,
              canRevoke: false
            }
          ]
        }}
        form={defaultForm}
        overview={{
          astrologers: [],
          birthProfiles: [
            birthProfile({ label: "Я", isPrimary: true }),
            birthProfile({
              id: "66666666-6666-4666-8666-666666666666",
              label: "Партнёр",
              isPrimary: false
            })
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
    expect(markup).toContain('name="birthTimeDstOccurrence"');
    expect(markup).toContain("Повторный час");
    expect(markup).toContain(
      "Выберите вариант только если местное время повторялось при переводе часов."
    );
    expect(markup).toContain('name="birthPlaceText"');
    expect(markup).toContain('id="client-birth-profile-birth-place"');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain("Место подтверждено: Europe/Moscow");
    expect(markup).toContain(canonicalChartAiConsentNotices.ru.title);
    expect(markup).toContain("Алиса Вега");
    expect(markup).toContain(clientCopyByLocale.ru.chartAiConsent.acceptanceLabel);
  });

  it("enables booking entry only for explicitly linked astrologers", () => {
    const markup = renderToStaticMarkup(
      <MePageView
        activeSection="booking"
        birthPlaceSearch={defaultBirthPlaceSearch}
        birthTimeOccurrenceCopy={clientCopyByLocale.ru.birthTimeOccurrence}
        consentSection={defaultConsentSection}
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

    expect(markup).toContain("Выберите связанного астролога");
    expect(markup).toContain("Алиса Вега");
    expect(markup).toContain("Расписание пока не опубликовано");
    expect(markup).toContain("Данные для записи");
    expect(markup).toMatch(
      /<button class="[^"]*primaryButton[^"]*" type="button"><svg[\s\S]* Записаться<\/button>/
    );
    expect(markup).not.toContain("Найти астролога");
    expect(markup).not.toContain("Каталог");
    expect(markup).not.toContain("Рекомендации");
  });

  it("keeps booking unavailable until the client has a direct relationship", () => {
    const markup = renderToStaticMarkup(
      <MePageView
        activeSection="booking"
        birthPlaceSearch={defaultBirthPlaceSearch}
        birthTimeOccurrenceCopy={clientCopyByLocale.ru.birthTimeOccurrence}
        consentSection={defaultConsentSection}
        form={defaultForm}
        overview={{
          astrologers: [],
          birthProfiles: [],
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

    expect(markup).toContain("Откройте ссылку астролога, чтобы записаться");
    expect(markup).toContain(
      "В кабинете доступны только астрологи, с которыми уже есть явная связь."
    );
    expect(markup).toContain("disabled");
  });

  it("renders an explicit validation error for an unverified place", () => {
    const markup = renderToStaticMarkup(
      <MePageView
        activeSection="data"
        birthPlaceSearch={defaultBirthPlaceSearch}
        birthTimeOccurrenceCopy={clientCopyByLocale.ru.birthTimeOccurrence}
        consentSection={defaultConsentSection}
        form={{
          ...defaultForm,
          birthPlaceText: "произвольный текст",
          selectedBirthPlaceText: null
        }}
        overview={{
          astrologers: [],
          birthProfiles: [],
          summary: {
            directLinkOnly: true,
            upcomingBookingCount: 0,
            availableMaterialCount: 0,
            unreadNotificationCount: 0,
            activeSubscriptionCount: 0
          }
        }}
        status="validation-error"
        onFormChange={vi.fn()}
        onRetry={vi.fn()}
        onSectionChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(markup).toContain(clientCopyByLocale.ru.birthPlaceSearch.selectionRequired);
  });
});

function birthProfile(overrides: Partial<{ id: string; label: string; isPrimary: boolean }> = {}) {
  return {
    id: overrides.id ?? "55555555-5555-4555-8555-555555555555",
    clientUserId,
    label: overrides.label ?? "Я",
    birthDate: "1990-03-14",
    birthTime: "08:25",
    birthTimePrecision: "exact" as const,
    birthPlaceText: "Москва, Россия",
    birthCountryCode: "RU",
    birthCity: "Москва",
    birthRegion: "Москва",
    birthTimezone: "Europe/Moscow",
    birthTimeDstOccurrence: null,
    birthLatitude: 55.7558,
    birthLongitude: 37.6173,
    source: "client_profile" as const,
    isPrimary: overrides.isPrimary ?? true,
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z"
  };
}
