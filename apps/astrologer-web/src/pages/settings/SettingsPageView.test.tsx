import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type {
  AstrologerProfileResponse,
  AstrologerTariffCatalogResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { ProfileSettingsForm } from "../../features/astrologer-profile/ui/ProfileSettingsForm";
import { TariffSettingsPanel } from "../../features/platform-tariffs/ui/TariffSettingsPanel";
import { SettingsNavigation } from "./components/SettingsNavigation";
import { SettingsPageView } from "./SettingsPageView";
import styles from "./SettingsPage.module.css";

describe("SettingsPageView", () => {
  it("keeps profile settings app-owned and mounts tariffs only in the billing section", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      profileIntegrityIssues: [],
      tariffCatalog: catalog,
      tariffSelectionResult: null,
      selectedBillingCycle: "month",
      activeSectionId: "profile",
      isLoading: false,
      isError: false,
      isTariffLoading: false,
      isTariffError: false,
      isSelectingTariff: false,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onSelectTariff: vi.fn(),
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    expect(view.type).toBe("section");
    expect(view.props.className).toBe(styles.settingsPage);
    expect(findRequiredElementByType(view, ProfileSettingsForm).props.profile).toBe(profile);
    expect(findFirstElementByType(view, TariffSettingsPanel)).toBeNull();

    const navigation = findRequiredElementByType(view, SettingsNavigation);
    expect(navigation.props.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "billing", title: "Тариф и оплата", disabled: false })
      ])
    );
  });

  it("does not render an empty profile form after a profile read failure", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile: null,
      profileIntegrityIssues: [],
      tariffCatalog: catalog,
      tariffSelectionResult: null,
      selectedBillingCycle: "month",
      activeSectionId: "profile",
      isLoading: false,
      isError: true,
      isTariffLoading: false,
      isTariffError: false,
      isSelectingTariff: false,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onSelectTariff: vi.fn(),
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    expect(collectText(view)).toContain("Не удалось синхронизировать профиль");
    expect(findFirstElementByType(view, ProfileSettingsForm)).toBeNull();
  });

  it("passes only real tariff state to the billing panel", () => {
    const onSelectTariff = vi.fn();
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      profileIntegrityIssues: [],
      tariffCatalog: catalog,
      tariffSelectionResult: selectionResult,
      selectedBillingCycle: "year",
      activeSectionId: "billing",
      isLoading: false,
      isError: false,
      isTariffLoading: false,
      isTariffError: false,
      isSelectingTariff: true,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onSelectTariff,
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    const panel = findRequiredElementByType(view, TariffSettingsPanel);
    expect(panel.props).toEqual(
      expect.objectContaining({
        catalog,
        billingCycle: "year",
        selectionResult,
        isLoading: false,
        isError: false,
        isSelecting: true,
        onSelectTariff
      })
    );
    expect(collectText(view)).not.toContain("Скачать чек");
  });

  it("announces tariff retrieval errors outside the profile form", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      profileIntegrityIssues: [],
      tariffCatalog: null,
      tariffSelectionResult: null,
      selectedBillingCycle: "month",
      activeSectionId: "billing",
      isLoading: false,
      isError: false,
      isTariffLoading: false,
      isTariffError: true,
      isSelectingTariff: false,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onSelectTariff: vi.fn(),
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    expect(findRequiredElementByType(view, TariffSettingsPanel).props.isError).toBe(true);
  });
});

function findRequiredElementByType<TProps>(
  node: ReactNode,
  type: (props: TProps) => ReactNode
): ReactElement<TProps> {
  const element = findFirstElementByType(node, type);
  if (!element) throw new Error(`Expected element ${type.name} to be rendered`);
  return element;
}

function findFirstElementByType<TProps>(
  node: ReactNode,
  type: (props: TProps) => ReactNode
): ReactElement<TProps> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const element = findFirstElementByType(child, type);
      if (element) return element;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === type) return element as ReactElement<TProps>;
  let result: ReactElement<TProps> | null = null;
  Children.forEach(element.props.children, (child) => {
    if (!result) result = findFirstElementByType(child as ReactNode, type);
  });
  return result;
}

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (!isValidElement(node)) return "";
  return collectText((node as ReactElement<Record<string, unknown>>).props.children as ReactNode);
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

const catalog = {
  tariffs: [
    {
      tariffSeriesId: "pro",
      version: 1,
      name: "Pro",
      tagline: "Для активной практики",
      monthlyPriceMinor: 199_000,
      yearlyPriceMinor: 1_910_400,
      monthlyRecurringFrequencyDays: 31,
      yearlyRecurringFrequencyDays: 365,
      clientSaleCommissionBps: 400,
      seatsLimit: 1,
      bookingsLimit: null,
      aiRequestsLimit: null,
      automationLimit: null,
      isPopular: true,
      displayOrder: 1,
      features: ["products", "analytics"],
      lifecycle: "published"
    }
  ],
  currentSubscription: null,
  recentInvoices: [],
  paymentMethod: null
} satisfies AstrologerTariffCatalogResponse;

const selectionResult = {
  subscription: {
    subscriptionId: "22222222-2222-4222-8222-222222222222",
    tariffSeriesId: "pro",
    tariffVersion: 1,
    billingCycle: "month",
    state: "incomplete_setup",
    commissionBpsSnapshot: 400,
    startsAt: null,
    endsAt: null
  },
  billingCycle: "year",
  nextAction: "saved_card_setup_required"
} as const;
