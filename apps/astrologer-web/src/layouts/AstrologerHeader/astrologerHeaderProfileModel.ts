import type {
  AstrologerProfileResponse,
  AstrologerVerificationStatus
} from "@elevenhouse/contracts";
import type { AppShellHeaderCopy } from "../../common/i18n/astrologerCopy";

export type AstrologerHeaderProfileQueryStatus = "error" | "pending" | "success";

export type AstrologerHeaderProfileModel = {
  readonly avatarInitials: string;
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly isLoading: boolean;
  readonly isVerified: boolean;
  readonly timezoneLabel: string;
};

export type AstrologerHeaderProfileModelInput = {
  readonly copy: AppShellHeaderCopy;
  readonly locale: string;
  readonly now: Date;
  readonly profile: AstrologerProfileResponse | null;
  readonly profileStatus: AstrologerHeaderProfileQueryStatus;
  readonly verificationStatus: AstrologerVerificationStatus;
};

export function toAstrologerHeaderProfileModel({
  copy,
  locale,
  now,
  profile,
  profileStatus,
  verificationStatus
}: AstrologerHeaderProfileModelInput): AstrologerHeaderProfileModel {
  if (profileStatus === "pending") {
    return {
      avatarInitials: copy.profileFallbackInitials,
      avatarUrl: null,
      displayName: copy.profileLoadingName,
      isLoading: true,
      isVerified: false,
      timezoneLabel: copy.profileLoadingTimezone
    };
  }

  if (!profile) {
    return {
      avatarInitials: copy.profileFallbackInitials,
      avatarUrl: null,
      displayName: copy.profileMissingName,
      isLoading: false,
      isVerified: false,
      timezoneLabel: copy.profileMissingTimezone
    };
  }

  return {
    avatarInitials: createInitials(profile.publicName, copy.profileFallbackInitials),
    avatarUrl: profile.avatarMedia?.url ?? null,
    displayName: profile.publicName,
    isLoading: false,
    isVerified: verificationStatus === "approved",
    timezoneLabel: formatTimezone(profile.timezone, locale, now)
  };
}

function createInitials(displayName: string, fallback: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");

  return initials || fallback;
}

function formatTimezone(timezone: string, locale: string, now: Date): string {
  try {
    const offset = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      timeZoneName: "shortOffset",
      hour: "2-digit"
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value;

    return offset ? `${offset} · ${timezone}` : timezone;
  } catch {
    return timezone;
  }
}
