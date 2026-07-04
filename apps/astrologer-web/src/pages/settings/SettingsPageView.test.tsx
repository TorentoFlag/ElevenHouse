import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { AstrologerProfileResponse } from "@elevenhouse/contracts";
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
      isLoading: false,
      isError: false,
      isSavingProfile: false,
      saveStatus: null,
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
          description: "Появится после PlatformPlans/Billing",
          iconName: "wallet",
          disabled: true
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

    expect(collectText(view)).not.toContain("Тариф");
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
      isLoading: false,
      isError: false,
      isSavingProfile: false,
      saveStatus: "saved",
      onSaveProfile: vi.fn()
    });

    expect(collectText(view)).toContain("Профиль сохранён");
    expect(findRequiredElementByType(view, ProfileSettingsForm).props.profile).toBe(profile);
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

const profile = {
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  publicHandle: "astro-anna",
  publicName: "Анна Вега",
  headline: "Натальная астрология",
  bio: "Описание практики",
  timezone: "Europe/Moscow",
  locale: "ru",
  avatarMediaId: null,
  coverMediaId: null,
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
