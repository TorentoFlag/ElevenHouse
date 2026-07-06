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
      profileIntegrityIssues: [],
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
      onProfileDirtyChange: vi.fn(),
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
    expect(collectText(view)).not.toContain("Превью глазами клиента");
    expect(collectText(view)).not.toContain("4 470 ₽");
  });

  it("announces successful profile saves without hiding the form", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      profileIntegrityIssues: [],
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
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    expect(collectText(view)).toContain("Профиль сохранён");
    expect(findRequiredElementByType(view, ProfileSettingsForm).props.profile).toBe(profile);
  });

  it("keeps the profile form closed while the initial profile state is loading", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile: null,
      profileIntegrityIssues: [],
      billingOverview,
      selectedBillingCycle: null,
      activeSectionId: "profile",
      isLoading: true,
      isError: false,
      isBillingLoading: false,
      isBillingError: false,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    expect(collectText(view)).toContain("Загружаем профиль");
    expect(findFirstElementByType(view, ProfileSettingsForm)).toBeNull();
  });

  it("does not render an empty profile form when the initial profile load failed", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile: null,
      profileIntegrityIssues: [],
      billingOverview,
      selectedBillingCycle: null,
      activeSectionId: "profile",
      isLoading: false,
      isError: true,
      isBillingLoading: false,
      isBillingError: false,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    expect(collectText(view)).toContain("Не удалось синхронизировать профиль");
    expect(findFirstElementByType(view, ProfileSettingsForm)).toBeNull();
  });

  it("shows profile media integrity issues without blocking profile editing", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      profileIntegrityIssues: [
        {
          code: "cover_media_unavailable",
          severity: "warning",
          field: "coverMediaId",
          mediaId: "44444444-4444-4444-8444-444444444444",
          message: "Profile cover media is missing, has wrong purpose or is not ready"
        }
      ],
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
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    expect(collectText(view)).toContain("Медиа профиля требует проверки");
    expect(findRequiredElementByType(view, ProfileSettingsForm).props.profile).toBe(profile);
  });

  it("renders the backend-backed billing section without fake payment data", () => {
    const handleBillingCycleChange = vi.fn();
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      profileIntegrityIssues: [],
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
      onProfileDirtyChange: vi.fn(),
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

  it("shows an unresolved billing plan instead of falling back to Start", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      profileIntegrityIssues: [],
      billingOverview: billingOverviewWithMissingPlan,
      selectedBillingCycle: null,
      activeSectionId: "billing",
      isLoading: false,
      isError: false,
      isBillingLoading: false,
      isBillingError: false,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    const text = collectText(view);
    expect(text).toContain("Тариф требует проверки");
    expect(text).toContain("Текущий тариф не определён");
    expect(text).toContain("Подписка ссылается на тариф, которого нет в активном каталоге");
    expect(text).not.toContain("Старт · месяц");
  });

  it("uses the selected yearly billing cycle for plan prices", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      profileIntegrityIssues: [],
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
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    const text = normalizeText(collectText(view));
    expect(text).toContain("Старт · год");
    expect(text).toContain("1 592 ₽");
  });

  it("renders provider billing URLs as real actions instead of disabled controls", () => {
    const view = SettingsPageView({
      locale: "ru",
      title: "Настройки",
      profile,
      profileIntegrityIssues: [],
      billingOverview: billingOverviewWithActions,
      selectedBillingCycle: null,
      activeSectionId: "billing",
      isLoading: false,
      isError: false,
      isBillingLoading: false,
      isBillingError: false,
      isSavingProfile: false,
      saveStatus: null,
      onSectionChange: vi.fn(),
      onBillingCycleChange: vi.fn(),
      onProfileDirtyChange: vi.fn(),
      onSaveProfile: vi.fn()
    });

    const choosePlanLink = findRequiredElementByText(view, "Выбрать");
    expect(choosePlanLink.type).toBe("a");
    expect(choosePlanLink.props.href).toBe("https://billing.example.com/checkout");

    const managePaymentLink = findRequiredElementByText(view, "Изменить");
    expect(managePaymentLink.type).toBe("a");
    expect(managePaymentLink.props.href).toBe("https://billing.example.com/payment-method");

    const receiptLink = findRequiredElementByText(view, "Скачать чек");
    expect(receiptLink.type).toBe("a");
    expect(receiptLink.props.href).toBe("https://billing.example.com/invoices/1");
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
    features: ["engine", "pdf", "natal", "page", "calendar", "crm", "refs"]
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

const billingOverviewWithActions = {
  ...billingOverview,
  provider: {
    ...billingOverview.provider,
    status: "ready",
    managePaymentMethodUrl: "https://billing.example.com/payment-method",
    checkoutUrl: "https://billing.example.com/checkout"
  },
  currentSubscription: {
    id: "22222222-2222-4222-8222-222222222222",
    planId: "start",
    status: "active",
    billingCycle: "month",
    currentPeriodEndsAt: "2026-08-03T00:00:00.000Z",
    cancelAtPeriodEnd: false
  },
  currentPlan: billingOverview.plans[0]!,
  currentPlanSource: "subscription",
  integrityIssues: [],
  paymentMethod: {
    id: "33333333-3333-4333-8333-333333333333",
    provider: "arc_pay",
    brand: "MIR",
    last4: "4521",
    expiresAt: "09/29"
  },
  plans: [
    billingOverview.plans[0]!,
    {
      id: "pro",
      code: "pro",
      name: "Pro",
      tagline: "Для плотной практики",
      monthlyPriceMinor: 199000,
      yearlyPriceMinor: 1910400,
      currency: "RUB",
      platformFeeBps: 500,
      seatsLimit: 1,
      bookingsLimit: 120,
      aiRequestsLimit: 300,
      automationLimit: 5,
      isPopular: true,
      isActive: true,
      features: ["engine", "page", "products", "calendar"]
    }
  ],
  invoices: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      provider: "arc_pay",
      status: "paid",
      planId: "start",
      billingCycle: "month",
      amountMinor: 0,
      currency: "RUB",
      issuedAt: "2026-07-03T00:00:00.000Z",
      paidAt: "2026-07-03T00:00:00.000Z",
      receiptUrl: "https://billing.example.com/invoices/1"
    }
  ]
} satisfies BillingOverviewResponse;

const billingOverviewWithMissingPlan = {
  ...billingOverview,
  currentPlan: null,
  currentPlanSource: "unresolved",
  integrityIssues: [
    {
      code: "subscription_plan_not_found",
      severity: "error",
      planId: "legacy-plan",
      message: "Current subscription references an inactive or missing plan"
    }
  ],
  currentSubscription: {
    id: "55555555-5555-4555-8555-555555555555",
    planId: "legacy-plan",
    status: "active",
    billingCycle: "month",
    currentPeriodEndsAt: "2026-08-03T00:00:00.000Z",
    cancelAtPeriodEnd: false
  }
} satisfies BillingOverviewResponse;
