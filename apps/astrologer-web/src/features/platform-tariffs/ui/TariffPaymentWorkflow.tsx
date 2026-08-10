import type {
  AstrologerTariffSubscriptionResponse,
  SavedCardSetupDisclosureResponse,
  SavedCardSetupStatusResponse,
  TariffInvoicePaymentStatusResponse
} from "@elevenhouse/contracts";
import { ArcPay, collectBrowserInfo, mountThreeDSBrowserForm, type ElementEvent, type Elements, type ThreeDSAction } from "@thavguard/arc-pay";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  completeSavedCardSetupThreeDsMethod,
  completeTariffInvoiceThreeDsMethod,
  executeSavedCardSetup,
  getCurrentSavedCardSetupStatus,
  getCurrentTariffInvoicePaymentStatus,
  getSavedCardSetupDisclosure,
  initiateSavedCardSetup
} from "../api/platformTariffsApi";
import {
  hostedCardFieldsAppearance,
  areHostedCardFieldsReady,
  needsProviderStatusPolling,
  resolveBuyerContact,
  toBrowserInfoRequest
} from "../model/tariffPaymentWorkflowModel";
import styles from "../../../pages/settings/SettingsPage.module.css";

type TariffPaymentWorkflowProps = Readonly<{
  subscription: AstrologerTariffSubscriptionResponse;
  locale: "ru" | "en";
}>;

type PaymentActionSource =
  | Readonly<{ kind: "setup"; status: SavedCardSetupStatusResponse }>
  | Readonly<{ kind: "invoice"; status: TariffInvoicePaymentStatusResponse }>;

type HostedCardField = Readonly<{
  mount: (target: HTMLElement) => void;
  getIframeContentWindow: () => Window | null;
  on: (
    event: "ready" | "error",
    callback: (payload: ElementEvent) => void
  ) => () => void;
}>;

/**
 * Browser boundary for the paid tariff flow. PAN/CVV stay in ArcPay hosted iframes; this
 * component receives only a single-use card token and server-authoritative state snapshots.
 */
export function TariffPaymentWorkflow({ subscription, locale }: TariffPaymentWorkflowProps) {
  const [disclosure, setDisclosure] = useState<SavedCardSetupDisclosureResponse | null>(null);
  const [setup, setSetup] = useState<SavedCardSetupStatusResponse | null>(null);
  const [invoice, setInvoice] = useState<TariffInvoicePaymentStatusResponse | null>(null);
  const [acceptedDisclosure, setAcceptedDisclosure] = useState(false);
  const [buyerContactValue, setBuyerContactValue] = useState("");
  const [isLoading, setLoading] = useState(true);
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCurrent = useRef(true);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextSetup, nextInvoice] = await Promise.all([
        getCurrentSavedCardSetupStatus(subscription.subscriptionId),
        getCurrentTariffInvoicePaymentStatus(subscription.subscriptionId)
      ]);
      if (!isCurrent.current) return;
      setSetup(nextSetup);
      setInvoice(nextInvoice);
    } catch {
      if (isCurrent.current) setError("Не удалось получить статус оплаты. Повторите попытку.");
    } finally {
      if (isCurrent.current) setLoading(false);
    }
  }, [subscription.subscriptionId]);

  useEffect(() => {
    isCurrent.current = true;
    void refresh();
    return () => { isCurrent.current = false; };
  }, [refresh]);

  const needsDisclosure = subscription.state === "incomplete_setup" &&
    (setup === null || setup.nextAction === "setup_failed" || setup.nextAction === "configuration_unavailable");

  useEffect(() => {
    if (!needsDisclosure || disclosure) return;
    let active = true;
    void getSavedCardSetupDisclosure(subscription.subscriptionId, locale)
      .then((result) => { if (active) setDisclosure(result); })
      .catch(() => { if (active) setError("Не удалось загрузить условия привязки карты."); });
    return () => { active = false; };
  }, [disclosure, locale, needsDisclosure, subscription.subscriptionId]);

  useEffect(() => {
    if (!needsProviderStatusPolling(setup, invoice)) return;
    const timer = window.setInterval(() => { void refresh(); }, 3_000);
    return () => window.clearInterval(timer);
  }, [invoice, refresh, setup]);

  const beginSetup = async () => {
    const buyerContact = resolveBuyerContact(buyerContactValue);
    if (!disclosure || !acceptedDisclosure || !buyerContact) return;
    setSubmitting(true);
    setError(null);
    try {
      await initiateSavedCardSetup(subscription.subscriptionId, {
        idempotencyKey: `tariffs:saved-card-setup:${crypto.randomUUID()}`,
        body: {
          expectedSubscriptionVersion: disclosure.expectedSubscriptionVersion,
          disclosureVersion: disclosure.disclosure.version,
          disclosureDigest: disclosure.disclosure.canonicalDigest,
          noticeLocale: disclosure.disclosure.locale,
          acceptedDisclosure: true,
          buyerContact
        }
      });
      await refresh();
    } catch {
      setError("Не удалось начать привязку карты. Проверьте данные и повторите попытку.");
    } finally {
      if (isCurrent.current) setSubmitting(false);
    }
  };

  const submitToken = async (input: Readonly<{
    setupSessionId: string;
    setupSessionVersion: number;
    cardTokenId: string;
  }>) => {
    setSubmitting(true);
    setError(null);
    try {
      await executeSavedCardSetup(input.setupSessionId, {
        idempotencyKey: `tariffs:saved-card-execute:${crypto.randomUUID()}`,
        body: {
          expectedSetupSessionVersion: input.setupSessionVersion,
          cardTokenId: input.cardTokenId,
          browserInfo: toBrowserInfoRequest(collectBrowserInfo())
        }
      });
      await refresh();
    } catch {
      setError("Не удалось безопасно передать карту. Проверьте поля и повторите попытку.");
    } finally {
      if (isCurrent.current) setSubmitting(false);
    }
  };

  if (isLoading) return <WorkflowNotice>Проверяем статус защищённой оплаты…</WorkflowNotice>;

  const action = paymentAction(setup, invoice);
  return (
    <section className={styles.tariffPaymentWorkflow} aria-label="Защищённая оплата тарифа">
      {error ? <WorkflowNotice tone="danger">{error}</WorkflowNotice> : null}
      {needsDisclosure && disclosure ? (
        <section className={styles.tariffPaymentDisclosure}>
          <h3>Привязка карты для оплаты тарифа</h3>
          <p>{disclosure.disclosure.body}</p>
          <label className={styles.tariffPaymentCheckbox}>
            <input
              type="checkbox"
              checked={acceptedDisclosure}
              onChange={(event) => setAcceptedDisclosure(event.target.checked)}
            />
            <span>Я принимаю условия регулярной оплаты тарифа.</span>
          </label>
          <label className={styles.tariffPaymentContact}>
            <span>Email или телефон для чека</span>
            <input
              type="text"
              autoComplete="email tel"
              inputMode="email"
              value={buyerContactValue}
              onChange={(event) => setBuyerContactValue(event.target.value)}
              placeholder="you@example.com или +79990000000"
            />
          </label>
          <button
            className={styles.planButton}
            type="button"
            disabled={!acceptedDisclosure || !resolveBuyerContact(buyerContactValue) || isSubmitting}
            onClick={() => void beginSetup()}
          >
            {isSubmitting ? "Подготавливаем…" : "Продолжить к защищённой карте"}
          </button>
        </section>
      ) : null}
      {setup?.nextAction === "tokenize_card" && setup.tokenization ? (
        <HostedCardFields
          key={`${setup.setupSessionId}:${setup.setupSessionVersion}`}
          publishableKey={setup.tokenization.publishableKey}
          providerSetupId={setup.tokenization.providerSetupId}
          isSubmitting={isSubmitting}
          onSubmit={(cardTokenId) => submitToken({
            setupSessionId: setup.setupSessionId,
            setupSessionVersion: setup.setupSessionVersion,
            cardTokenId
          })}
        />
      ) : null}
      {action ? (
        <ThreeDsActionRunner
          source={action}
          onMethodComplete={async (indicator) => {
            setSubmitting(true);
            setError(null);
            try {
              if (action.kind === "setup") {
                await completeSavedCardSetupThreeDsMethod(action.status.setupSessionId, {
                  idempotencyKey: `tariffs:saved-card-method:${crypto.randomUUID()}`,
                  body: { expectedSetupSessionVersion: action.status.setupSessionVersion, completionIndicator: indicator }
                });
              } else {
                await completeTariffInvoiceThreeDsMethod(action.status.invoiceId, {
                  idempotencyKey: `tariffs:invoice-method:${crypto.randomUUID()}`,
                  body: {
                    expectedInvoiceVersion: action.status.invoiceVersion,
                    completionIndicator: indicator,
                    browserInfo: toBrowserInfoRequest(collectBrowserInfo())
                  }
                });
              }
              await refresh();
            } catch {
              setError("Не удалось подтвердить этап 3DS. Повторите попытку позже.");
            } finally {
              if (isCurrent.current) setSubmitting(false);
            }
          }}
        />
      ) : null}
      {setup?.nextAction === "provider_setup_pending" ? (
        <WorkflowNotice>Платёжный провайдер подготавливает защищённую сессию.</WorkflowNotice>
      ) : null}
      {setup?.nextAction === "setup_failed" ? (
        <WorkflowNotice tone="danger">Не удалось привязать карту. Попробуйте ещё раз или используйте другую карту.</WorkflowNotice>
      ) : null}
      {setup?.nextAction === "provider_confirmation_pending" ? (
        <WorkflowNotice>Провайдер завершает привязку карты. Этот экран обновится автоматически.</WorkflowNotice>
      ) : null}
      {setup?.nextAction === "initial_payment_pending" ? (
        <WorkflowNotice>Карта привязана. Ждём подтверждения первого списания от платёжного провайдера.</WorkflowNotice>
      ) : null}
      {invoice?.nextAction === "provider_confirmation_pending" ? (
        <WorkflowNotice>Провайдер подтверждает списание по тарифу. Этот экран обновится автоматически.</WorkflowNotice>
      ) : null}
      {invoice?.nextAction === "payment_captured" ? (
        <WorkflowNotice tone="success">Первое списание подтверждено. Тариф активирован.</WorkflowNotice>
      ) : null}
      {invoice?.nextAction === "payment_declined" || invoice?.nextAction === "payment_failed" ? (
        <WorkflowNotice tone="danger">Списание по тарифу не подтверждено. Попробуйте привязать другую карту.</WorkflowNotice>
      ) : null}
    </section>
  );
}

function HostedCardFields({
  publishableKey,
  providerSetupId,
  isSubmitting,
  onSubmit
}: Readonly<{
  publishableKey: string;
  providerSetupId: string;
  isSubmitting: boolean;
  onSubmit: (cardTokenId: string) => Promise<void>;
}>) {
  const number = useRef<HTMLDivElement>(null);
  const expiry = useRef<HTMLDivElement>(null);
  const cvv = useRef<HTMLDivElement>(null);
  const elements = useRef<Elements | null>(null);
  const [isReady, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let created: Elements | null = null;
    void ArcPay.load(publishableKey)
      .then(async (provider) => {
        if (!active || !number.current || !expiry.current || !cvv.current) return;
        created = provider.elements({ appearance: hostedCardFieldsAppearance });
        const cardNumber = created.create("cardNumber", { placeholder: "Номер карты" });
        const cardExpiry = created.create("cardExpiry", { placeholder: "ММ / ГГ" });
        const cardCvv = created.create("cardCvv", { placeholder: "CVV" });
        const channelId = getHostedFieldsChannelId(created);

        // ArcPay's iframe handshake is asynchronous. Mount one field at a time and do
        // not make tokenization available until every field has explicitly confirmed it.
        await mountHostedCardField(cardNumber, number.current, publishableKey, channelId);
        if (!active) return;
        await mountHostedCardField(cardExpiry, expiry.current, publishableKey, channelId);
        if (!active) return;
        await mountHostedCardField(cardCvv, cvv.current, publishableKey, channelId);
        if (!active) return;

        elements.current = created;
        setReady(areHostedCardFieldsReady({ cardNumber: true, cardExpiry: true, cardCvv: true }));
      })
      .catch(() => { if (active) setLoadError("Не удалось подключить все защищённые поля ArcPay. Повторите попытку."); });
    return () => { active = false; created?.destroy(); elements.current = null; };
  }, [publishableKey]);

  const submit = async () => {
    if (!elements.current) return;
    try {
      const result = await elements.current.tokenize(providerSetupId, crypto.randomUUID());
      await onSubmit(result.cardTokenId);
    } catch {
      setLoadError("Карта не прошла проверку ArcPay. Проверьте реквизиты и повторите попытку.");
    }
  };

  return (
    <section className={styles.tariffPaymentCard} aria-label="Карта для тарифа">
      <h3>Данные карты</h3>
      {loadError ? <WorkflowNotice tone="danger">{loadError}</WorkflowNotice> : null}
      <div ref={number} className={styles.tariffHostedField} aria-label="Номер карты" />
      <div className={styles.tariffHostedFieldRow}>
        <div ref={expiry} className={styles.tariffHostedField} aria-label="Срок действия" />
        <div ref={cvv} className={styles.tariffHostedField} aria-label="Код безопасности" />
      </div>
      <button className={styles.planButton} type="button" disabled={!isReady || isSubmitting} onClick={() => void submit()}>
        {isSubmitting ? "Передаём защищённо…" : "Привязать карту и оплатить"}
      </button>
    </section>
  );
}

function getHostedFieldsChannelId(elements: Elements): string {
  // The published SDK keeps the channel id private in TypeScript but uses a normal
  // runtime property. We need the same id only to repeat its public `hello` message.
  const channelId = (elements as unknown as Readonly<{ channelId?: unknown }>).channelId;
  if (typeof channelId !== "string" || channelId.length === 0) {
    throw new Error("ArcPay Hosted Fields channel is unavailable");
  }
  return channelId;
}

function mountHostedCardField(
  element: HostedCardField,
  target: HTMLDivElement,
  publishableKey: string,
  channelId: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let handshakeRetry: number | null = null;
    const sendHello = () => {
      element.getIframeContentWindow()?.postMessage({
        type: "arcpay:hello",
        origin: window.location.origin,
        publishableKey,
        channelId
      }, "https://sdk.arcpay.space");
    };
    const settle = (outcome: "ready" | "error", reason?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (handshakeRetry !== null) window.clearInterval(handshakeRetry);
      removeReady();
      removeError();
      if (outcome === "ready") resolve();
      else reject(new Error(reason ?? "ArcPay field did not become ready"));
    };
    const removeReady = element.on("ready", () => settle("ready"));
    const removeError = element.on("error", (event) => settle("error", "reason" in event ? event.reason : undefined));
    const timeout = window.setTimeout(() => settle("error", "ArcPay field readiness timed out"), 10_000);
    try {
      element.mount(target);
      // ArcPay SDK 0.1.46 sends hello only once on iframe load, while its iframe
      // subscribes in a later React effect. Repeat the identical public handshake
      // briefly so the first message cannot be lost in that race.
      handshakeRetry = window.setInterval(sendHello, 250);
      sendHello();
    } catch (error) {
      settle("error", error instanceof Error ? error.message : undefined);
    }
  });
}

export function ThreeDsActionRunner({
  source,
  onMethodComplete
}: Readonly<{
  source: PaymentActionSource;
  onMethodComplete: (indicator: "Y" | "N" | "U") => Promise<void>;
}>) {
  const handled = useRef<string | null>(null);
  const onMethodCompleteRef = useRef(onMethodComplete);
  const action = source.status.customerAction;
  const key = source.kind === "setup"
    ? `${source.kind}:${source.status.setupSessionId}:${source.status.setupSessionVersion}`
    : `${source.kind}:${source.status.invoiceId}:${source.status.invoiceVersion}`;

  useEffect(() => {
    onMethodCompleteRef.current = onMethodComplete;
  }, [onMethodComplete]);

  useEffect(() => {
    if (!action || action.type !== "three_ds_method" || handled.current === key) return;
    handled.current = key;
    const mounted = mountThreeDSBrowserForm(asArcPayAction(action));
    let settled = false;
    const complete = (indicator: "Y" | "N" | "U") => {
      if (settled) return;
      settled = true;
      void onMethodCompleteRef.current(indicator);
    };
    const timer = window.setTimeout(() => complete("U"), 10_000);
    mounted.iframe?.addEventListener("load", () => complete("Y"), { once: true });
    mounted.submit();
    return () => {
      window.clearTimeout(timer);
      mounted.remove();
      if (!settled && handled.current === key) handled.current = null;
    };
  }, [action?.type, key]);

  if (!action) return null;
  if (action.type === "three_ds_method") {
    return <WorkflowNotice>Подтверждаем защиту карты в банке…</WorkflowNotice>;
  }
  return (
    <section className={styles.tariffPaymentThreeDs}>
      <h3>Подтвердите оплату в банке</h3>
      <p>Банк откроет защищённую страницу подтверждения. Не закрывайте её до завершения.</p>
      <button
        className={styles.planButton}
        type="button"
        onClick={() => {
          const mounted = mountThreeDSBrowserForm(asArcPayAction(action), { challengeTarget: "_self" });
          mounted.submit();
        }}
      >
        Перейти к подтверждению банка
      </button>
    </section>
  );
}

function paymentAction(
  setup: SavedCardSetupStatusResponse | null,
  invoice: TariffInvoicePaymentStatusResponse | null
): PaymentActionSource | null {
  if (setup?.nextAction === "complete_3ds") return { kind: "setup", status: setup };
  if (invoice?.nextAction === "complete_3ds") return { kind: "invoice", status: invoice };
  return null;
}

function asArcPayAction(action: NonNullable<SavedCardSetupStatusResponse["customerAction"]>): ThreeDSAction {
  return {
    type: action.type,
    three_ds: {
      version: action.threeDs.version,
      phase: action.threeDs.phase,
      submit: action.threeDs.submit
    }
  };
}

function WorkflowNotice({
  tone = "neutral",
  children
}: Readonly<{ tone?: "neutral" | "danger" | "success"; children: React.ReactNode }>) {
  return (
    <div className={`${styles.billingProviderNotice} ${tone === "danger" ? styles.statusBannerDanger : ""} ${tone === "success" ? styles.statusBannerSuccess : ""}`} aria-live="polite">
      <span>{children}</span>
    </div>
  );
}
