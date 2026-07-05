import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { AstrologerProfileResponse, BillingOverviewResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { ProfileSettingsForm } from "../../features/astrologer-profile/ui/ProfileSettingsForm";
import { SettingsNavigation } from "./components/SettingsNavigation";
import { SettingsPageView } from "./SettingsPageView";
import styles from "./SettingsPage.module.css";

describe("SettingsPageView", () => {
  it("renders settings as a backend-backed shell with only the supported profile section", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      billingOverview,
      selectedBillingCycle: null,
      activeSectionId: "profile",
      isLoading: false,
      isError: false,
      isBillingLoading: false,
      isBillingError: false,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    expect(view.type).toBe("section");
    expect(view.props.className).toBe(styles.settingsPage);
    expect(view.props["aria-labelledby"]).toBe("settings-page-title");

    const navigation = findRequiredElementByType(view, SettingsNavigation);
    expect(navigation.props.sections).toEqual(
      expect.arrayContaining([
        {
          id: "profile",
          title: "Профиль",
          description: "Публичные данные, ссылка и видимость страницы",
          iconName: "layoutGrid",
          disabled: false
        },
        {
          id: "billing",
          title: "Тариф и оплата",
          description: "План, комиссия и платежные документы",
          iconName: "wallet",
          disabled: false
        },
        {
          id: "security",
          title: "Безопасность",
          description: "Появится после security settings API",
          iconName: "verified",
          disabled: true
        }
      ])
    );

    const form = findRequiredElementByType(view, ProfileSettingsForm);
    expect(form.props.profile).toBe(profile);
    expect(form.props.locale).toBe("ru");
    expect(form.props.isSaving).toBe(false);

    expect(collectText(view)).not.toContain("Текущий тариф");
    expect(collectText(view)).not.toContain("Инвойс");
    expect(collectText(view)).not.toContain("Лояльность");
    expect(collectText(view)).not.toContain("Рефералы");
    expect(collectText(view)).not.toContain("4 470 ₽");
  });

  it("announces successful profile saves without hiding the form", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      billingOverview,
      selectedBillingCycle: null,
      activeSectionId: "profile",
      isLoading: false,
      isError: false,
      isBillingLoading: false,
      isBillingError: false,
      isSavingProfile: false,
      saveStatus: "saved",
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    expect(collectText(view)).toContain("Профиль сохранён");
    expect(findRequiredElementByType(view, ProfileSettingsForm).props.profile).toBe(profile);
  });

  it("renders the backend-backed billing section without fake payment data", () => {
    const handleBillingCycleChange = vi.fn();
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      billingOverview,
      selectedBillingCycle: null,
      activeSectionId: "billing",
      isLoading: false,
      isError: false,
      isBillingLoading: false,
      isBillingError: false,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: handleBillingCycleChange,
      onSaveProfile: vi.fn()
    });

    const text = collectText(view);
    expect(text).toContain("Текущий тариф");
    expect(text).toContain("Старт");
    expect(text).toContain("Комиссия 8%");
    expect(text).toContain("Способ оплаты не добавлен");
    expect(text).toContain("Платежный провайдер пока не настроен");
    expect(text).not.toContain("4521");

    const yearCycleButton = findRequiredElementByText(view, "Год · -20%");
    expect(yearCycleButton.type).toBe("button");
    expect(yearCycleButton.props["aria-pressed"]).toBe(false);

    (yearCycleButton.props.onClick as () => void)();
    expect(handleBillingCycleChange).toHaveBeenCalledWith("year");
  });

  it("uses the selected yearly billing cycle for plan prices", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      billingOverview,
      selectedBillingCycle: "year",
      activeSectionId: "billing",
      isLoading: false,
      isError: false,
      isBillingLoading: false,
      isBillingError: false,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    const text = normalizeText(collectText(view));
    expect(text).toContain("Старт · год");
    expect(text).toContain("1 592 ₽");
  });
});

function findRequiredElementByType<TProps>(
  node: ReactNode,
  type: (props: TProps) => ReactNode
): ReactElement<TProps> {
  const element = findFirstElementByType(node, type);

  if (!element) {
    throw new Error(`Expected element ${type.name} to be rendered`);
  }

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

  if (!isValidElement(node)) {
    return null;
  }

  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === type) {
    return element as ReactElement<TProps>;
  }

  let result: ReactElement<TProps> | null = null;
  Children.forEach(element.props.children, (child) => {
    if (!result) {
      result = findFirstElementByType(child as ReactNode, type);
    }
  });

  return result;
}

function findRequiredElementByText(
  node: ReactNode,
  text: string
): ReactElement<Record<string, unknown>> {
  const element = findFirstElementByText(node, text);

  if (!element) {
    throw new Error(`Expected element with text ${text} to be rendered`);
  }

  return element;
}

function findFirstElementByText(
  node: ReactNode,
  text: string
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const element = findFirstElementByText(child, text);
      if (element) return element;
    }
    return null;
  }

  if (!isValidElement(node)) {
    return null;
  }

  const element = node as ReactElement<Record<string, unknown>>;
  if (collectText(element) === text) {
    return element;
  }

  let result: ReactElement<Record<string, unknown>> | null = null;
  Children.forEach(element.props.children, (child) => {
    if (!result) {
      result = findFirstElementByText(child as ReactNode, text);
    }
  });

  return result;
}

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(collectText).join(" ");
  }

  if (!isValidElement(node)) {
    return "";
  }

  const element = node as ReactElement<Record<string, unknown>>;
  return collectText(element.props.children as ReactNode);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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
      features: ["engine", "pdf", "natal", "page", "calendar", "crm", "refs"]
    },
    {
      id: "pro",
      code: "pro",
      name: "Pro",
      tagline: "Для активной практики",
      monthlyPriceMinor: 199000,
      yearlyPriceMinor: 1910000,
      currency: "RUB",
      platformFeeBps: 400,
      seatsLimit: 1,
      bookingsLimit: null,
      aiRequestsLimit: null,
      automationLimit: null,
      isPopular: true,
      isActive: true,
      features: ["engine", "pdf", "natal", "products", "analytics"]
    }
  ],
  paymentMethod: null,
  invoices: []
} satisfies BillingOverviewResponse;
