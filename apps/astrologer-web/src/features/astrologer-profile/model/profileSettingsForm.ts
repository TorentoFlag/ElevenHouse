import type {
  AstrologerProfileResponse,
  UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import { upsertAstrologerProfileRequestSchema } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";

export const PROFILE_VISIBILITY_OPTIONS = [
  {
    id: "published",
    label: "Опубликован",
    color: "#4EC8A0",
    description: "Доступен по прямой ссылке, принимает оплату"
  },
  {
    id: "paused",
    label: "Пауза",
    color: "#F4C430",
    description: "Временно скрыт - не принимает записи"
  },
  {
    id: "draft",
    label: "Черновик",
    color: "#A7A2C8",
    description: "Скрыт, виден только вам"
  }
] as const;

export const PROFILE_SPECIALIZATION_OPTIONS = [
  "Натальная карта",
  "Синастрия",
  "Прогнозы / транзиты",
  "Хорар",
  "Ректификация",
  "Ведическая",
  "Психологическая",
  "Соляры и дирекции"
] as const;

export const PROFILE_METHOD_OPTIONS = [
  "Натальная астрология",
  "Нумерология",
  "Матрица судьбы",
  "Дизайн человека",
  "Астрокартография",
  "Детские карты",
  "Таро"
] as const;

export const PROFILE_LANGUAGE_OPTIONS = ["Русский", "English", "Español", "中文"] as const;

export type AstrologerProfileSettingsDraft = {
  readonly publicHandle: string;
  readonly publicName: string;
  readonly headline: string;
  readonly bio: string;
  readonly timezone: string;
  readonly locale: string;
  readonly avatarMediaId: string;
  readonly coverMediaId: string;
  readonly consultationLanguages: string[];
  readonly visibilityStatus: UpsertAstrologerProfileRequest["visibilityStatus"];
  readonly professionalExperienceYears: number | null;
  readonly professionalSchool: string;
  readonly specializations: string[];
  readonly methods: string[];
  readonly socialLinks: {
    readonly telegram: string;
    readonly instagram: string;
    readonly whatsapp: string;
    readonly website: string;
  };
  readonly ownBirthData: {
    readonly date: string;
    readonly time: string;
    readonly place: string;
    readonly showOnPublicPage: boolean;
  };
};

export function createProfileSettingsDraft(
  profile: AstrologerProfileResponse | null,
  locale: SupportedLocale
): AstrologerProfileSettingsDraft {
  if (!profile) {
    return {
      publicHandle: "",
      publicName: "",
      headline: "",
      bio: "",
      timezone: "UTC",
      locale,
      avatarMediaId: "",
      coverMediaId: "",
      consultationLanguages: [getDefaultConsultationLanguage(locale)],
      visibilityStatus: "draft",
      professionalExperienceYears: null,
      professionalSchool: "",
      specializations: [],
      methods: [],
      socialLinks: {
        telegram: "",
        instagram: "",
        whatsapp: "",
        website: ""
      },
      ownBirthData: {
        date: "",
        time: "",
        place: "",
        showOnPublicPage: false
      }
    };
  }

  return {
    publicHandle: profile.publicHandle,
    publicName: profile.publicName,
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    timezone: profile.timezone,
    locale: profile.locale,
    avatarMediaId: profile.avatarMediaId ?? "",
    coverMediaId: profile.coverMediaId ?? "",
    consultationLanguages: [...profile.consultationLanguages],
    visibilityStatus: profile.visibilityStatus,
    professionalExperienceYears: profile.professionalExperienceYears,
    professionalSchool: profile.professionalSchool ?? "",
    specializations: [...profile.specializations],
    methods: [...profile.methods],
    socialLinks: {
      telegram: profile.socialLinks.telegram ?? "",
      instagram: profile.socialLinks.instagram ?? "",
      whatsapp: profile.socialLinks.whatsapp ?? "",
      website: profile.socialLinks.website ?? ""
    },
    ownBirthData: {
      date: profile.ownBirthData.date ?? "",
      time: profile.ownBirthData.time ?? "",
      place: profile.ownBirthData.place ?? "",
      showOnPublicPage: profile.ownBirthData.showOnPublicPage
    }
  };
}

export function createUpsertAstrologerProfileRequest(
  draft: AstrologerProfileSettingsDraft
): UpsertAstrologerProfileRequest {
  return upsertAstrologerProfileRequestSchema.parse({
    publicHandle: draft.publicHandle,
    publicName: draft.publicName,
    headline: draft.headline,
    bio: draft.bio,
    timezone: draft.timezone,
    locale: draft.locale,
    avatarMediaId: draft.avatarMediaId,
    coverMediaId: draft.coverMediaId,
    consultationLanguages: draft.consultationLanguages,
    visibilityStatus: draft.visibilityStatus,
    professionalExperienceYears: draft.professionalExperienceYears,
    professionalSchool: draft.professionalSchool,
    specializations: draft.specializations,
    methods: draft.methods,
    socialLinks: draft.socialLinks,
    ownBirthData: {
      date: draft.ownBirthData.date,
      time: draft.ownBirthData.time,
      place: draft.ownBirthData.place,
      showOnPublicPage: draft.ownBirthData.showOnPublicPage
    }
  });
}

export function getProfileSettingsDraftValidationMessage(
  draft: AstrologerProfileSettingsDraft
): string | null {
  const result = upsertAstrologerProfileRequestSchema.safeParse({
    publicHandle: draft.publicHandle,
    publicName: draft.publicName,
    headline: draft.headline,
    bio: draft.bio,
    timezone: draft.timezone,
    locale: draft.locale,
    avatarMediaId: draft.avatarMediaId,
    coverMediaId: draft.coverMediaId,
    consultationLanguages: draft.consultationLanguages,
    visibilityStatus: draft.visibilityStatus,
    professionalExperienceYears: draft.professionalExperienceYears,
    professionalSchool: draft.professionalSchool,
    specializations: draft.specializations,
    methods: draft.methods,
    socialLinks: draft.socialLinks,
    ownBirthData: draft.ownBirthData
  });

  if (result.success) {
    return null;
  }

  const issuePath = result.error.issues[0]?.path.join(".");

  if (issuePath === "publicName") {
    return "Введите имя профиля";
  }
  if (issuePath === "publicHandle") {
    return "Укажите корректную короткую ссылку";
  }
  if (issuePath === "consultationLanguages") {
    return "Выберите хотя бы один язык консультаций";
  }
  if (issuePath === "timezone") {
    return "Укажите часовой пояс в формате Europe/Moscow";
  }
  if (issuePath === "locale") {
    return "Укажите язык профиля";
  }

  return "Проверьте поля профиля";
}

export function isProfileSettingsDraftDirty(
  initialDraft: AstrologerProfileSettingsDraft,
  currentDraft: AstrologerProfileSettingsDraft
): boolean {
  return JSON.stringify(initialDraft) !== JSON.stringify(currentDraft);
}

export function reconcileProfileSettingsDraftAfterProfileChange(input: {
  readonly previousInitialDraft: AstrologerProfileSettingsDraft;
  readonly currentDraft: AstrologerProfileSettingsDraft;
  readonly nextInitialDraft: AstrologerProfileSettingsDraft;
}): {
  readonly draft: AstrologerProfileSettingsDraft;
  readonly shouldReplaceDraft: boolean;
} {
  if (!isProfileSettingsDraftDirty(input.previousInitialDraft, input.currentDraft)) {
    return {
      draft: input.nextInitialDraft,
      shouldReplaceDraft: true
    };
  }

  if (!isProfileSettingsDraftDirty(input.nextInitialDraft, input.currentDraft)) {
    return {
      draft: input.nextInitialDraft,
      shouldReplaceDraft: true
    };
  }

  return {
    draft: input.currentDraft,
    shouldReplaceDraft: false
  };
}

export function toggleProfileStringValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function getDefaultConsultationLanguage(locale: SupportedLocale): string {
  return locale === "ru" ? "Русский" : "English";
}
