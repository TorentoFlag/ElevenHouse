import { Children, isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AstrologerProfileResponse, BillingOverviewResponse } from "@elevenhouse/contracts";
import { SettingsPage } from "./SettingsPage";

const mocks = vi.hoisted(() => ({
  useI18n: vi.fn(),
  useDocumentTitle: vi.fn(),
  useState: vi.fn(),
  useCurrentAstrologerProfileQuery: vi.fn(),
  useCurrentBillingOverviewQuery: vi.fn(),
  useCurrentAstrologerVerificationQuery: vi.fn(),
  useSubmitAstrologerVerificationMutation: vi.fn(),
  useUpsertAstrologerProfileMutation: vi.fn(),
  settingsPageView: vi.fn()
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useState: mocks.useState
  };
});

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: mocks.useI18n
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));

vi.mock("../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery", () => ({
  useCurrentAstrologerProfileQuery: mocks.useCurrentAstrologerProfileQuery
}));

vi.mock("../../features/astrologer-profile/model/useUpsertAstrologerProfileMutation", () => ({
  useUpsertAstrologerProfileMutation: mocks.useUpsertAstrologerProfileMutation
}));

vi.mock("../../features/platform-billing/model/useCurrentBillingOverviewQuery", () => ({
  useCurrentBillingOverviewQuery: mocks.useCurrentBillingOverviewQuery
}));

vi.mock("../../features/verification/model/useCurrentAstrologerVerificationQuery", () => ({
  useCurrentAstrologerVerificationQuery: mocks.useCurrentAstrologerVerificationQuery
}));

vi.mock("../../features/verification/model/useSubmitAstrologerVerificationMutation", () => ({
  useSubmitAstrologerVerificationMutation: mocks.useSubmitAstrologerVerificationMutation
}));

vi.mock("./SettingsPageView", () => ({
  SettingsPageView: mocks.settingsPageView
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    mocks.settingsPageView.mockImplementation(() => null);
    mocks.useI18n.mockReturnValue({
      dictionary: {
        settings: {
          documentTitle: "ElevenHouse | Настройки",
          title: "Настройки"
        }
      },
      locale: "ru"
    });
    mocks.useCurrentAstrologerProfileQuery.mockReturnValue({
      data: { profile, integrityIssues: [] },
      isLoading: false,
      isError: false
    });
    mocks.useCurrentBillingOverviewQuery.mockReturnValue({
      data: billingOverview,
      isLoading: false,
      isError: false
    });
    mocks.useCurrentAstrologerVerificationQuery.mockReturnValue({
      data: verification,
      isLoading: false,
      isError: false
    });
    mocks.useSubmitAstrologerVerificationMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false
    });
    mocks.useUpsertAstrologerProfileMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false
    });
  });

  it("loads profile data and passes page state to the settings view", () => {
    renderElement(<SettingsPage />);

    expect(mocks.useDocumentTitle).toHaveBeenCalledWith("ElevenHouse | Настройки");
    expect(getLatestMockProps(mocks.settingsPageView)).toEqual(
      expect.objectContaining({
        locale: "ru",
        profile,
        profileIntegrityIssues: [],
        billingOverview,
        verification,
        selectedBillingCycle: null,
        activeSectionId: "profile",
        isLoading: false,
        isError: false,
        isBillingLoading: false,
        isBillingError: false,
        isVerificationLoading: false,
        isVerificationError: false,
        isSubmittingVerification: false,
        isSavingProfile: false
      })
    );
  });

  it("submits verification applications through the mutation hook", () => {
    const mutate = vi.fn();
    mocks.useSubmitAstrologerVerificationMutation.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      isSuccess: false
    });

    renderElement(<SettingsPage />);
    const props = getLatestMockProps(mocks.settingsPageView) as {
      onSubmitVerification: (body: unknown) => void;
    };
    props.onSubmitVerification({
      identityDocumentMediaId: "33333333-3333-4333-8333-333333333333",
      qualificationDocumentMediaIds: ["44444444-4444-4444-8444-444444444444"]
    });

    expect(mutate).toHaveBeenCalledWith({
      identityDocumentMediaId: "33333333-3333-4333-8333-333333333333",
      qualificationDocumentMediaIds: ["44444444-4444-4444-8444-444444444444"]
    });
  });

  it("passes a saved status after the profile mutation succeeds", () => {
    mocks.useUpsertAstrologerProfileMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: true
    });

    renderElement(<SettingsPage />);

    expect(getLatestMockProps(mocks.settingsPageView)).toEqual(
      expect.objectContaining({
        saveStatus: "saved"
      })
    );
  });

  it("clears the saved status once the profile form becomes dirty again", () => {
    mocks.useState
      .mockImplementationOnce((initial: unknown) => [initial, vi.fn()])
      .mockImplementationOnce((initial: unknown) => [initial, vi.fn()])
      .mockImplementationOnce(() => [true, vi.fn()]);
    mocks.useUpsertAstrologerProfileMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: true
    });

    renderElement(<SettingsPage />);

    expect(getLatestMockProps(mocks.settingsPageView)).toEqual(
      expect.objectContaining({
        saveStatus: null
      })
    );
  });
});

function renderElement(element: unknown): void {
  if (Array.isArray(element)) {
    element.forEach(renderElement);
    return;
  }

  if (!isValidElement(element)) {
    return;
  }

  const typedElement = element as ReactElement<Record<string, unknown>>;

  if (typeof typedElement.type === "function") {
    const Component = typedElement.type as (props: Record<string, unknown>) => unknown;
    renderElement(Component(typedElement.props));
    return;
  }

  Children.forEach(typedElement.props.children, renderElement);
}

function getLatestMockProps(mock: { mock: { calls: unknown[][] } }): unknown {
  const lastCall = mock.mock.calls.at(-1);

  if (!lastCall?.[0]) {
    throw new Error("Expected mock to be called with props");
  }

  return lastCall[0];
}

const profile = {
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  publicHandle: "astro-anna",
  publicName: "Анна Вега",
  headline: "Натальная астрология",
  bio: "Описание практики",
  timezone: "Europe/Moscow",
  locale: "ru",
  avatarMediaId: null,
  avatarMedia: null,
  coverMediaId: null,
  coverMedia: null,
  consultationLanguages: ["Русский"],
  visibilityStatus: "published",
  professionalExperienceYears: 9,
  professionalSchool: "Психологическая астрология",
  specializations: ["Натальная карта"],
  methods: ["Натальная астрология"],
  socialLinks: {
    telegram: "alisa_astro",
    instagram: null,
    whatsapp: null,
    website: "alisavega.ru"
  },
  ownBirthData: {
    date: "1990-07-14",
    time: "08:30",
    place: "Санкт-Петербург",
    showOnPublicPage: true
  },
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z"
} satisfies AstrologerProfileResponse;

const billingOverview = {
  provider: {
    code: "arc_pay",
    status: "not_configured",
    managePaymentMethodUrl: null,
    checkoutUrl: null
  },
  billingCycle: "month",
  currentPlan: {
    id: "start",
    code: "start",
    name: "Старт",
    tagline: "Чтобы начать практику",
    monthlyPriceMinor: 0,
    yearlyPriceMinor: 0,
    currency: "RUB",
    platformFeeBps: 800,
    seatsLimit: 1,
    bookingsLimit: 30,
    aiRequestsLimit: 20,
    automationLimit: 1,
    isPopular: false,
    isActive: true,
    features: ["engine", "pdf", "natal", "page"]
  },
  currentPlanSource: "default",
  integrityIssues: [],
  currentSubscription: null,
  plans: [
    {
      id: "start",
      code: "start",
      name: "Старт",
      tagline: "Чтобы начать практику",
      monthlyPriceMinor: 0,
      yearlyPriceMinor: 0,
      currency: "RUB",
      platformFeeBps: 800,
      seatsLimit: 1,
      bookingsLimit: 30,
      aiRequestsLimit: 20,
      automationLimit: 1,
      isPopular: false,
      isActive: true,
      features: ["engine", "pdf", "natal", "page"]
    }
  ],
  paymentMethod: null,
  invoices: []
} satisfies BillingOverviewResponse;

const verification = {
  status: "none",
  application: null,
  requirements: {
    maxQualificationDocuments: 5,
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    maxSizeBytes: 20_000_000
  }
} as const;
