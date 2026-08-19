import type { AstrologerProfileResponse } from "@elevenhouse/contracts";
import type { AppShellNavigationCopy } from "../../../common/i18n/astrologerCopy";

export type AstrologerPersonalPageLink = Readonly<{
  title: string;
  description: string;
  href: string | null;
  ariaLabel: string;
}>;

export function createAstrologerPersonalPageLink({
  copy,
  currentOrigin = globalThis.location?.origin ?? "",
  profile
}: {
  readonly copy: AppShellNavigationCopy["personalPage"];
  readonly currentOrigin?: string;
  readonly profile: AstrologerProfileResponse | null;
}): AstrologerPersonalPageLink {
  if (!profile) {
    return {
      title: copy.title,
      description: copy.loadingDescription,
      href: null,
      ariaLabel: copy.unavailableAriaLabel
    };
  }

  if (profile.visibilityStatus !== "published") {
    return {
      title: copy.title,
      description: copy.unavailableDescription,
      href: null,
      ariaLabel: copy.unavailableAriaLabel
    };
  }

  const href = `${resolveClientWebOrigin(currentOrigin)}/a/${profile.publicHandle}`;
  return {
    title: copy.title,
    description: href.replace(/^https?:\/\//, ""),
    href,
    ariaLabel: copy.ariaLabel
  };
}

export function resolveClientWebOrigin(currentOrigin: string): string {
  const parsed = parseOrigin(currentOrigin);
  if (!parsed) return "https://client.elevenhouse.ai";
  if (parsed.hostname === "app.elevenhouse.ai") return "https://client.elevenhouse.ai";
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    if (parsed.port === "5174") return `${parsed.protocol}//${parsed.hostname}:5173`;
    return "https://client.elevenhouse.ai";
  }
  return parsed.origin;
}

function parseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
