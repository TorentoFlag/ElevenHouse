import type {
  ClientPurchaseOption,
  OrderResponse,
  ProductDeliveryFormat,
  RelatedAstrologerListResponse
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { HttpError } from "../../../common/http/HttpError";
import type { ClientPurchaseFlowCopy } from "../../../common/i18n/clientCopy";
import {
  createClientOrder,
  createClientPaidBookingHold,
  getClientAvailableSlots,
  getClientCheckoutPreparationState,
  getClientOrder,
  getClientPurchaseOptions,
  prepareClientCheckout
} from "../api/clientCommerceApi";
import styles from "./ClientPurchaseFlow.module.css";

type FlowStatus = "idle" | "loading" | "submitting" | "preparing" | "error";
type CheckoutKeys = Readonly<{ booking: string; order: string; checkout: string }>;

export function ClientPurchaseFlow({
  astrologers,
  copy,
  locale
}: {
  readonly astrologers: RelatedAstrologerListResponse["astrologers"];
  readonly copy: ClientPurchaseFlowCopy;
  readonly locale: SupportedLocale;
}) {
  const [astrologerId, setAstrologerId] = useState(astrologers[0]?.astrologerUserId ?? "");
  const [products, setProducts] = useState<readonly ClientPurchaseOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [deliveryFormat, setDeliveryFormat] = useState("");
  const [slots, setSlots] = useState<
    readonly { readonly startAt: string; readonly endAt: string }[]
  >([]);
  const [selectedStartAt, setSelectedStartAt] = useState<string | null>(null);
  const [contactKind, setContactKind] = useState<"email" | "phone">("email");
  const [contactValue, setContactValue] = useState("");
  const [status, setStatus] = useState<FlowStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [returnOrder, setReturnOrder] = useState<OrderResponse | null>(null);
  const checkoutKeys = useRef<CheckoutKeys | null>(null);
  const checkoutPreparationId = useRef<string | null>(null);

  const selectedAstrologer =
    astrologers.find((item) => item.astrologerUserId === astrologerId) ?? null;
  const selectedProduct = products.find((item) => item.id === selectedProductId) ?? null;
  const selectedSlot = slots.find((slot) => slot.startAt === selectedStartAt) ?? null;

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("order");
    if (!orderId || !isUuid(orderId)) return;
    let cancelled = false;
    void getClientOrder(orderId)
      .then((order) => {
        if (!cancelled) setReturnOrder(order);
      })
      .catch(() => {
        if (!cancelled) setMessage(copy.pendingPayment);
      });
    return () => {
      cancelled = true;
    };
  }, [copy.pendingPayment]);

  useEffect(() => {
    if (!astrologerId) {
      setProducts([]);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setMessage(null);
    setSelectedProductId(null);
    setDeliveryFormat("");
    setSlots([]);
    setSelectedStartAt(null);
    checkoutKeys.current = null;
    void getClientPurchaseOptions(astrologerId)
      .then((response) => {
        if (cancelled) return;
        setProducts(response.products);
        setStatus("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setProducts([]);
        setStatus("error");
        setMessage(copy.loadProductsFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [astrologerId, copy.loadProductsFailed]);

  useEffect(() => {
    if (!selectedProduct || selectedProduct.executionMode !== "live" || !astrologerId) return;
    let cancelled = false;
    setSlots([]);
    setSelectedStartAt(null);
    setStatus("loading");
    const range = upcomingRange();
    void getClientAvailableSlots(astrologerId, {
      productId: selectedProduct.id,
      start: range.start,
      end: range.end
    })
      .then((response) => {
        if (cancelled) return;
        setSlots(response.slots);
        setStatus("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setMessage(copy.loadSlotsFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [astrologerId, copy.loadSlotsFailed, selectedProduct]);

  useEffect(() => {
    const preparationId = checkoutPreparationId.current;
    if (status !== "preparing" || !preparationId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const preparation = await getClientCheckoutPreparationState(preparationId);
        if (cancelled) return;
        if (preparation.state === "checkout_ready") {
          window.location.assign(`/api/payments/checkout-preparations/${preparationId}/action`);
          return;
        }
        if (preparation.state === "provider_session_unknown") {
          setStatus("error");
          setMessage(copy.checkoutUnknown);
          return;
        }
        if (preparation.state === "failed") {
          setStatus("error");
          setMessage(copy.checkoutFailed);
          return;
        }
        window.setTimeout(() => void poll(), 1_000);
      } catch {
        if (!cancelled) {
          window.setTimeout(() => void poll(), 2_000);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [copy.checkoutFailed, copy.checkoutUnknown, status]);

  const canPay = useMemo(() => {
    if (!selectedProduct || !deliveryFormat || !contactValue.trim()) return false;
    return selectedProduct.executionMode !== "live" || selectedSlot !== null;
  }, [contactValue, deliveryFormat, selectedProduct, selectedSlot]);

  function selectProduct(product: ClientPurchaseOption) {
    setSelectedProductId(product.id);
    setDeliveryFormat(product.deliveryFormats[0] ?? "");
    setSlots([]);
    setSelectedStartAt(null);
    setMessage(null);
    checkoutKeys.current = null;
  }

  async function startCheckout() {
    if (!selectedProduct || !selectedAstrologer || !canPay) return;
    try {
      const keys =
        checkoutKeys.current ??
        getOrCreateCheckoutKeys(
          checkoutScope({
            astrologerUserId: selectedAstrologer.astrologerUserId,
            productId: selectedProduct.id,
            productRevision: selectedProduct.revision,
            deliveryFormat,
            selectedStartAt
          })
        );
      checkoutKeys.current = keys;
      setStatus("submitting");
      setMessage(null);
      let bookingId: string | null = null;
      if (selectedProduct.executionMode === "live") {
        if (!selectedSlot) throw new Error("A live product requires a selected slot");
        const hold = await createClientPaidBookingHold(
          {
            astrologerUserId: selectedAstrologer.astrologerUserId,
            productId: selectedProduct.id,
            directLinkIntentId: null,
            deliveryFormat: deliveryFormat as ProductDeliveryFormat,
            projectedStartAt: selectedSlot.startAt
          },
          keys.booking
        );
        bookingId = hold.booking.id;
      }
      const order = await createClientOrder(
        {
          astrologerUserId: selectedAstrologer.astrologerUserId,
          productId: selectedProduct.id,
          expectedProductRevision: selectedProduct.revision,
          directLinkIntentId: null,
          bookingId,
          clientBirthDataId: null
        },
        keys.order
      );
      const returnUrl = checkoutReturnUrl(order.id);
      const preparation = await prepareClientCheckout(
        {
          orderId: order.id,
          buyerContact: { kind: contactKind, value: contactValue.trim() },
          successUrl: returnUrl,
          failureUrl: returnUrl,
          cancelUrl: returnUrl
        },
        keys.checkout
      );
      checkoutPreparationId.current = preparation.checkoutPreparationId;
      setStatus("preparing");
    } catch (error) {
      setStatus("error");
      setMessage(checkoutErrorMessage(error, copy));
    }
  }

  if (returnOrder) {
    return <CheckoutReturn copy={copy} locale={locale} order={returnOrder} />;
  }

  return (
    <section
      className={styles.flow}
      aria-busy={status === "loading" || status === "submitting" || status === "preparing"}
    >
      <div className={styles.heading}>
        <span>{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.relationshipOnly}</p>
      </div>

      <label className={styles.field}>
        <span>{copy.astrologerLabel}</span>
        <select
          value={astrologerId}
          onChange={(event) => setAstrologerId(event.target.value)}
          disabled={status === "submitting" || status === "preparing"}
        >
          {astrologers.map((astrologer) => (
            <option key={astrologer.astrologerUserId} value={astrologer.astrologerUserId}>
              {astrologer.publicName}
            </option>
          ))}
        </select>
      </label>

      {status === "loading" ? <p className={styles.muted}>{copy.loadingProducts}</p> : null}
      {products.length === 0 && status !== "loading" ? (
        <p className={styles.muted}>{copy.noProducts}</p>
      ) : null}
      <div className={styles.products}>
        {products.map((product) => (
          <button
            className={product.id === selectedProductId ? styles.productSelected : styles.product}
            key={product.id}
            type="button"
            onClick={() => selectProduct(product)}
            disabled={status === "submitting" || status === "preparing"}
          >
            <span>
              <strong>{product.title}</strong>
              {product.subtitle ? <small>{product.subtitle}</small> : null}
            </span>
            <b>{formatMoney(product.priceMinor, product.currency, locale)}</b>
          </button>
        ))}
      </div>

      {selectedProduct ? (
        <div className={styles.checkoutCard}>
          <div className={styles.productMeta}>
            <strong>{selectedProduct.title}</strong>
            <span>
              {selectedProduct.executionMode === "live"
                ? copy.liveProductHint
                : (selectedProduct.slaLabel ?? copy.asyncProductFallbackHint)}
            </span>
          </div>
          <label className={styles.field}>
            <span>{copy.formatLabel}</span>
            <select
              value={deliveryFormat}
              onChange={(event) => {
                setDeliveryFormat(event.target.value);
                checkoutKeys.current = null;
              }}
            >
              {selectedProduct.deliveryFormats.map((format) => (
                <option key={format} value={format}>
                  {formatLabel(format, copy)}
                </option>
              ))}
            </select>
          </label>
          {selectedProduct.executionMode === "live" ? (
            <div className={styles.slots} aria-label={copy.availableSlotsLabel}>
              <strong>{copy.availableSlotsLabel}</strong>
              {slots.length === 0 && status !== "loading" ? (
                <p className={styles.muted}>{copy.noSlots}</p>
              ) : null}
              <div>
                {slots.map((slot) => (
                  <button
                    key={slot.startAt}
                    type="button"
                    onClick={() => {
                      setSelectedStartAt(slot.startAt);
                      checkoutKeys.current = null;
                    }}
                    className={slot.startAt === selectedStartAt ? styles.slotSelected : styles.slot}
                  >
                    {formatSlot(slot.startAt, locale)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className={styles.contactRow}>
            <label className={styles.field}>
              <span>{copy.receiptContactLabel}</span>
              <select
                value={contactKind}
                onChange={(event) => setContactKind(event.target.value as "email" | "phone")}
              >
                <option value="email">{copy.emailLabel}</option>
                <option value="phone">{copy.phoneLabel}</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>{contactKind === "email" ? copy.emailLabel : copy.phonePlaceholderLabel}</span>
              <input
                value={contactValue}
                onChange={(event) => setContactValue(event.target.value)}
                autoComplete={contactKind === "email" ? "email" : "tel"}
              />
            </label>
          </div>
          <p className={styles.note}>{copy.receiptContactHint}</p>
          <button
            className={styles.payButton}
            type="button"
            disabled={!canPay || status === "submitting" || status === "preparing"}
            onClick={() => void startCheckout()}
          >
            {status === "preparing"
              ? copy.preparingPayment
              : status === "submitting"
                ? copy.creatingOrder
                : interpolate(copy.pay, {
                    amount: formatMoney(
                      selectedProduct.priceMinor,
                      selectedProduct.currency,
                      locale
                    )
                  })}
          </button>
        </div>
      ) : null}
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function CheckoutReturn({
  copy,
  locale,
  order
}: {
  readonly copy: ClientPurchaseFlowCopy;
  readonly locale: SupportedLocale;
  readonly order: OrderResponse;
}) {
  const text =
    order.status === "paid" || order.status === "fulfilled"
      ? copy.paid
      : order.status === "pending_payment"
        ? copy.pendingPayment
        : copy.paymentNotCompleted;
  return (
    <section className={styles.returnCard}>
      <span>{copy.returnStatusLabel}</span>
      <h2>{order.productTitleSnapshot}</h2>
      <p>{text}</p>
      <b>{formatMoney(order.grossAmount.amountMinor, order.grossAmount.currency, locale)}</b>
    </section>
  );
}

function createCheckoutKeys(): CheckoutKeys {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (!randomUuid) throw new Error("Secure browser randomness is unavailable");
  return {
    booking: `client-checkout:booking:${randomUuid}`,
    order: `client-checkout:order:${randomUuid}`,
    checkout: `client-checkout:checkout:${randomUuid}`
  };
}

/**
 * This stores only opaque browser-command keys, never an order, money, provider URL or access
 * decision. It lets an interrupted page reload replay the same server-side idempotent commands.
 */
function getOrCreateCheckoutKeys(scope: string): CheckoutKeys {
  const storageKey = `elevenhouse.client-checkout.keys.${scope}`;
  const stored = readCheckoutKeys(storageKey);
  if (stored) return stored;
  const keys = createCheckoutKeys();
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    // Browser storage being unavailable must not invent a provider fallback; the server still
    // enforces each supplied command key. The visible retry warning remains truthful.
  }
  return keys;
}

function readCheckoutKeys(storageKey: string): CheckoutKeys | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null");
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      ["booking", "order", "checkout"].every(
        (key) => typeof (value as Record<string, unknown>)[key] === "string"
      )
    ) {
      const candidate = value as Record<string, string>;
      const booking = candidate.booking;
      const order = candidate.order;
      const checkout = candidate.checkout;
      if (
        typeof booking === "string" &&
        booking.length > 0 &&
        booking.length <= 160 &&
        typeof order === "string" &&
        order.length > 0 &&
        order.length <= 160 &&
        typeof checkout === "string" &&
        checkout.length > 0 &&
        checkout.length <= 160
      ) {
        return { booking, order, checkout };
      }
    }
  } catch {
    // A corrupted client cache never becomes input to a provider command.
  }
  return null;
}

function checkoutScope(input: {
  readonly astrologerUserId: string;
  readonly productId: string;
  readonly productRevision: number;
  readonly deliveryFormat: string;
  readonly selectedStartAt: string | null;
}): string {
  return encodeURIComponent(
    [
      input.astrologerUserId,
      input.productId,
      String(input.productRevision),
      input.deliveryFormat,
      input.selectedStartAt ?? ""
    ].join("|")
  );
}

function checkoutReturnUrl(orderId: string): string {
  const url = new URL("/me", window.location.origin);
  url.searchParams.set("order", orderId);
  return url.toString();
}

function checkoutErrorMessage(error: unknown, copy: ClientPurchaseFlowCopy): string {
  const code = httpErrorCode(error);
  if (
    code === "payment_checkout_unavailable" ||
    code === "payment_checkout_worker_preparation_required"
  ) {
    return copy.checkoutUnavailable;
  }
  if (code === "payment_checkout_buyer_contact_unverified") return copy.checkoutFailedGeneric;
  if (window.location.protocol !== "https:") return copy.checkoutRequiresHttps;
  return copy.checkoutFailedGeneric;
}

function httpErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpError)) return null;
  const body = error.body;
  if (!body || typeof body !== "object" || Array.isArray(body) || !("code" in body)) {
    return null;
  }
  const code = (body as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function upcomingRange(): { readonly start: string; readonly end: string } {
  const start = new Date();
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatMoney(amountMinor: number, currency: string, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(amountMinor / 100);
}

function formatSlot(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatLabel(value: string, copy: ClientPurchaseFlowCopy): string {
  return copy.deliveryFormats[value] ?? value;
}

function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
