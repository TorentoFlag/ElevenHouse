import type { ArcPayBrowserInfoRequest, SavedCardSetupStatusResponse, TariffInvoicePaymentStatusResponse } from "@elevenhouse/contracts";

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
