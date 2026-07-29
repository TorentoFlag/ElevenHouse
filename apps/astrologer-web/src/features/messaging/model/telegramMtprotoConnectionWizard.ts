import type { TelegramMtprotoLoginResponse } from "@elevenhouse/contracts";

export type TelegramMtprotoWizardStep = "phone" | "code" | "password" | "connected";

export type TelegramMtprotoWizardState = {
  readonly step: TelegramMtprotoWizardStep;
  readonly channelConnectionId: string | null;
  readonly maskedPhoneNumber: string | null;
  readonly retryAfterSeconds: number | null;
};

export function createInitialTelegramMtprotoWizardState(): TelegramMtprotoWizardState {
  return {
    step: "phone",
    channelConnectionId: null,
    maskedPhoneNumber: null,
    retryAfterSeconds: null
  };
}

export function deriveTelegramMtprotoWizardState(
  response: TelegramMtprotoLoginResponse
): TelegramMtprotoWizardState {
  return {
    step: telegramMtprotoLoginStepToWizardStep(response.loginStep),
    channelConnectionId: response.channelConnection.id,
    maskedPhoneNumber: response.maskedPhoneNumber,
    retryAfterSeconds: response.retryAfterSeconds
  };
}

export function isTelegramMtprotoPhoneStepSubmittable(
  phoneNumber: string,
  consentAccepted: boolean
): boolean {
  return consentAccepted && phoneNumber.trim().length > 0;
}

function telegramMtprotoLoginStepToWizardStep(
  step: TelegramMtprotoLoginResponse["loginStep"]
): TelegramMtprotoWizardStep {
  if (step === "code_required") return "code";
  if (step === "password_required") return "password";

  return "connected";
}
