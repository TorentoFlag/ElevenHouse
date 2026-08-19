// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelConnectionDialog } from "./TelegramBusinessSetupGuide";

describe("ChannelConnectionDialog WhatsApp option", () => {
  afterEach(() => cleanup());

  it("shows WhatsApp and starts the WhatsApp Cloud connection flow", () => {
    const startWhatsApp = vi.fn();

    render(<ChannelConnectionDialog {...baseProps} onStartWhatsAppCloudConnection={startWhatsApp} />);

    fireEvent.click(screen.getByRole("button", { name: "Выбрать WhatsApp" }));
    expect(screen.getByRole("heading", { name: "Подключить WhatsApp" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Продолжить в Meta" }));
    expect(startWhatsApp).toHaveBeenCalledTimes(1);
  });
});

const noop = () => undefined;

const baseProps = {
  connection: undefined,
  mtprotoConnection: undefined,
  instagramConnection: undefined,
  whatsappConnection: undefined,
  isStarting: false,
  errorMessage: null,
  isStartingInstagramGraph: false,
  instagramGraphErrorMessage: null,
  isStartingWhatsAppCloud: false,
  whatsappCloudErrorMessage: null,
  telegramBotUsername: null,
  telegramBotUrl: null,
  mtprotoStep: "phone" as const,
  mtprotoPhoneNumber: "",
  mtprotoCode: "",
  mtprotoPassword: "",
  mtprotoMaskedPhoneNumber: null,
  mtprotoRetryAfterSeconds: null,
  isMtprotoConsentAccepted: false,
  isStartingMtproto: false,
  isSubmittingMtprotoCode: false,
  isSubmittingMtprotoPassword: false,
  mtprotoErrorMessage: null,
  onStartConnection: noop,
  onStartInstagramGraphConnection: noop,
  onMtprotoPhoneNumberChange: noop,
  onMtprotoConsentAcceptedChange: noop,
  onMtprotoCodeChange: noop,
  onMtprotoPasswordChange: noop,
  onStartMtprotoConnection: noop,
  onSubmitMtprotoCode: noop,
  onSubmitMtprotoPassword: noop,
  onResetMtprotoConnection: noop,
  onClose: noop
};
