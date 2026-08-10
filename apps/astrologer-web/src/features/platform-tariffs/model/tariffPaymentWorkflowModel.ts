import type {
  ArcPayBrowserInfoRequest,
  InitiateSavedCardSetupRequest,
  SavedCardSetupStatusResponse,
  TariffInvoicePaymentStatusResponse
} from "@elevenhouse/contracts";
import type { HostedFieldsAppearance } from "@thavguard/arc-pay";

type ArcPaySdkBrowserInfo = Readonly<{
  accept_header: string;
  language: string;
  screen_width: number;
  screen_height: number;
  color_depth: ArcPayBrowserInfoRequest["colorDepth"];
  timezone_offset_minutes: number;
  user_agent: string;
  java_enabled?: boolean;
  window_size?: ArcPayBrowserInfoRequest["windowSize"];
}>;

/** ArcPay allows only iframe-safe input properties; containers remain app-owned CSS. */
export const hostedCardFieldsAppearance = {
  theme: "none",
  variables: {
    fontFamily: '"Onest", system-ui, -apple-system, sans-serif',
    fontSize: "15px",
    lineHeight: "24px",
    colorText: "#eceaf7",
    colorPlaceholder: "#6f6a93",
    colorDanger: "#f47a7a",
    colorSuccess: "#4ec8a0",
    colorBackground: "#171432",
    caretColor: "#f4c430"
  },
  rules: {
    focus: { "font-weight": "500" },
    invalid: { color: "#f47a7a" },
    complete: { color: "#eceaf7" }
  }
} satisfies HostedFieldsAppearance;

export type HostedCardFieldReadiness = Readonly<{
  cardNumber: boolean;
  cardExpiry: boolean;
  cardCvv: boolean;
}>;

export function areHostedCardFieldsReady(readiness: HostedCardFieldReadiness): boolean {
  return readiness.cardNumber && readiness.cardExpiry && readiness.cardCvv;
}

/** Normalizes only a contract-valid receipt contact; it never substitutes a guessed value. */
export function resolveBuyerContact(value: string): InitiateSavedCardSetupRequest["buyerContact"] | null {
  const trimmed = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { kind: "email", value: trimmed };
  }
  const normalizedPhone = trimmed.replace(/[\s()-]/g, "");
  if (/^\+[1-9]\d{1,14}$/.test(normalizedPhone)) {
    return { kind: "phone", value: normalizedPhone };
  }
  return null;
}

/** Maps the audited ArcPay SDK shape into the strict shared browser-attestation contract. */
export function toBrowserInfoRequest(info: ArcPaySdkBrowserInfo): ArcPayBrowserInfoRequest {
  return {
    acceptHeader: info.accept_header,
    language: info.language,
    screenWidth: info.screen_width,
    screenHeight: info.screen_height,
    colorDepth: info.color_depth,
    timezoneOffsetMinutes: info.timezone_offset_minutes,
    userAgent: info.user_agent,
    ...(info.java_enabled === undefined ? {} : { javaEnabled: info.java_enabled }),
    ...(info.window_size === undefined ? {} : { windowSize: info.window_size })
  };
}

export function needsProviderStatusPolling(
  setup: SavedCardSetupStatusResponse | null,
  invoice: TariffInvoicePaymentStatusResponse | null
): boolean {
  return setup?.nextAction === "provider_setup_pending" ||
    setup?.nextAction === "provider_confirmation_pending" ||
    setup?.nextAction === "initial_payment_pending" ||
    invoice?.nextAction === "provider_confirmation_pending";
}
