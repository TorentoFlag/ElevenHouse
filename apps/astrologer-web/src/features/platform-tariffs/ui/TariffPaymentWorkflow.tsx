import type {
  AstrologerTariffSubscriptionResponse,
  SavedCardSetupDisclosureResponse,
  SavedCardSetupStatusResponse,
  TariffInvoicePaymentStatusResponse
} from "@elevenhouse/contracts";
import { ArcPay, collectBrowserInfo, mountThreeDSBrowserForm, type Elements, type ThreeDSAction } from "@thavguard/arc-pay";
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
import { needsProviderStatusPolling, toBrowserInfoRequest } from "../model/tariffPaymentWorkflowModel";
import styles from "../../../pages/settings/SettingsPage.module.css";

type TariffPaymentWorkflowProps = Readonly<{
  subscription: AstrologerTariffSubscriptionResponse;
  locale: "ru" | "en";
}>;

type PaymentActionSource =
  | Readonly<{ kind: "setup"; status: SavedCardSetupStatusResponse }>
  | Readonly<{ kind: "invoice"; status: TariffInvoicePaymentStatusResponse }>;

/**
 * Browser boundary for the paid tariff flow. PAN/CVV stay in ArcPay hosted iframes; this
 * component receives only a single-use card token and server-authoritative state snapshots.
 */
export function TariffPaymentWorkflow({ subscription, locale }: TariffPaymentWorkflowProps) {
  const [disclosure, setDisclosure] = useState<SavedCardSetupDisclosureResponse | null>(null);
  const [setup, setSetup] = useState<SavedCardSetupStatusResponse | null>(null);
  const [invoice, setInvoice] = useState<TariffInvoicePaymentStatusResponse | null>(null);
  const [acceptedDisclosure, setAcceptedDisclosure] = useState(false);
  const [email, setEmail] = useState("");
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
    if (!disclosure || !acceptedDisclosure || !email) return;
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
          buyerContact: { kind: "email", value: email }
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
            <span>Email для чека</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button
            className={styles.planButton}
            type="button"
            disabled={!acceptedDisclosure || !email || isSubmitting}
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
      {setup?.nextAction === "provider_confirmation_pending" || setup?.nextAction === "initial_payment_pending" ? (
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
      .then((provider) => {
        if (!active || !number.current || !expiry.current || !cvv.current) return;
        created = provider.elements({
          appearance: {
            variables: { colorText: "#f4f0e8", colorPlaceholder: "#938d82", fontSize: "15px" }
          }
        });
        created.create("cardNumber", { placeholder: "Номер карты" }).mount(number.current);
        created.create("cardExpiry", { placeholder: "ММ / ГГ" }).mount(expiry.current);
        created.create("cardCvv", { placeholder: "CVV" }).mount(cvv.current);
        elements.current = created;
        setReady(true);
      })
      .catch(() => { if (active) setLoadError("Не удалось загрузить защищённые поля карты ArcPay."); });
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
      <p>Реквизиты вводятся в защищённых полях ArcPay и не проходят через ElevenHouse.</p>
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

function ThreeDsActionRunner({
  source,
  onMethodComplete
}: Readonly<{
  source: PaymentActionSource;
  onMethodComplete: (indicator: "Y" | "N" | "U") => Promise<void>;
}>) {
  const handled = useRef<string | null>(null);
  const action = source.status.customerAction;
  const key = source.kind === "setup"
    ? `${source.kind}:${source.status.setupSessionId}:${source.status.setupSessionVersion}`
    : `${source.kind}:${source.status.invoiceId}:${source.status.invoiceVersion}`;

  useEffect(() => {
    if (!action || action.type !== "three_ds_method" || handled.current === key) return;
    handled.current = key;
    const mounted = mountThreeDSBrowserForm(asArcPayAction(action));
    let settled = false;
    const complete = (indicator: "Y" | "N" | "U") => {
      if (settled) return;
      settled = true;
      void onMethodComplete(indicator);
    };
    const timer = window.setTimeout(() => complete("U"), 10_000);
    mounted.iframe?.addEventListener("load", () => complete("Y"), { once: true });
    mounted.submit();
    return () => { window.clearTimeout(timer); mounted.remove(); };
  }, [action, key, onMethodComplete]);

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
