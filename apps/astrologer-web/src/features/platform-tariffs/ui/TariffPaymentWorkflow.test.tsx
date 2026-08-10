/* @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const arcPay = vi.hoisted(() => ({
  mountThreeDSBrowserForm: vi.fn()
}));

const tariffApi = vi.hoisted(() => ({
  completeSavedCardSetupThreeDsMethod: vi.fn(),
  completeTariffInvoiceThreeDsMethod: vi.fn(),
  executeSavedCardSetup: vi.fn(),
  getCurrentSavedCardSetupStatus: vi.fn(),
  getCurrentTariffInvoicePaymentStatus: vi.fn(),
  getSavedCardSetupDisclosure: vi.fn(),
  initiateSavedCardSetup: vi.fn()
}));

vi.mock("@thavguard/arc-pay", () => ({
  ArcPay: class ArcPay {},
  collectBrowserInfo: () => ({}),
  mountThreeDSBrowserForm: arcPay.mountThreeDSBrowserForm
}));

vi.mock("../api/platformTariffsApi", () => tariffApi);

import { TariffPaymentWorkflow, ThreeDsActionRunner } from "./TariffPaymentWorkflow";

describe("ThreeDsActionRunner", () => {
  beforeEach(() => {
    arcPay.mountThreeDSBrowserForm.mockReset();
    arcPay.mountThreeDSBrowserForm.mockImplementation(() => ({
      iframe: undefined,
      submit: vi.fn(),
      remove: vi.fn()
    }));
    tariffApi.getCurrentSavedCardSetupStatus.mockReset();
    tariffApi.getCurrentTariffInvoicePaymentStatus.mockReset();
    tariffApi.getSavedCardSetupDisclosure.mockReset();
    tariffApi.getSavedCardSetupDisclosure.mockResolvedValue({
      expectedSubscriptionVersion: 1,
      disclosure: {
        version: "test",
        canonicalDigest: "digest",
        locale: "ru",
        body: "Тестовые условия"
      }
    });
  });

  it("restarts the hidden 3DS Method form after React Strict Mode cleans up its probe", async () => {
    render(
      <StrictMode>
        <ThreeDsActionRunner source={methodActionSource} onMethodComplete={vi.fn().mockResolvedValue(undefined)} />
      </StrictMode>
    );

    await waitFor(() => expect(arcPay.mountThreeDSBrowserForm).toHaveBeenCalledTimes(2));
  });

  it("does not call a still-pending provider setup a bound card", async () => {
    tariffApi.getCurrentSavedCardSetupStatus.mockResolvedValue({
      nextAction: "provider_confirmation_pending"
    });
    tariffApi.getCurrentTariffInvoicePaymentStatus.mockResolvedValue(null);

    render(<TariffPaymentWorkflow subscription={incompleteSubscription} locale="ru" />);

    await waitFor(() => {
      expect(screen.queryByText("Провайдер завершает привязку карты. Этот экран обновится автоматически.")).not.toBeNull();
    });
    expect(screen.queryByText("Карта привязана. Ждём подтверждения первого списания от платёжного провайдера.")).toBeNull();
  });

  it("keeps a terminal card refusal visible while allowing a new setup attempt", async () => {
    tariffApi.getCurrentSavedCardSetupStatus.mockResolvedValue({
      nextAction: "setup_failed"
    });
    tariffApi.getCurrentTariffInvoicePaymentStatus.mockResolvedValue(null);

    render(<TariffPaymentWorkflow subscription={incompleteSubscription} locale="ru" />);

    await waitFor(() => {
      expect(screen.queryByText("Не удалось привязать карту. Попробуйте ещё раз или используйте другую карту.")).not.toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Продолжить к защищённой карте" })).not.toBeNull();
  });
});

const incompleteSubscription = {
  subscriptionId: "12345678-1234-4234-8234-123456789abc",
  state: "incomplete_setup"
} as never;

const methodActionSource = {
  kind: "setup",
  status: {
    setupSessionId: "setup-session",
    setupSessionVersion: 5,
    customerAction: {
      type: "three_ds_method",
      threeDs: {
        version: "2",
        phase: "method",
        submit: {
          method: "POST",
          url: "https://three-ds.example.test/method",
          target: "hidden_iframe",
          fields: []
        }
      }
    }
  }
} as never;
