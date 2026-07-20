import type {
  AvailabilitySchedule,
  ProductDeliveryFormat,
  ProductResponse
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import { ClientSearchCombobox } from "../../clients/components/ClientSearchCombobox";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { productCopyByLocale } from "../../products/model/productCopy";
import type { CreateManualBookingInput } from "../api/createManualBooking";
import {
  createManualBookingCommand,
  getBookableManualBookingProducts,
  toManualBookingSlotOptions
} from "../model/manualBookingForm";
import {
  isCurrentManualBookingSlotResponse,
  resolveManualBookingStart
} from "../model/manualBookingPrefill";
import { useAvailableBookingSlotsQuery } from "../model/useAvailableBookingSlotsQuery";
import styles from "./ManualBookingDialog.module.css";

type ManualBookingDialogProps = {
  readonly copy: AstrologerCopy["calendar"]["manualBooking"];
  readonly locale: SupportedLocale;
  readonly range: { readonly start: string; readonly end: string };
  readonly schedule: AvailabilitySchedule | null;
  readonly products: readonly ProductResponse[];
  readonly prefillStartAt: string | null;
  readonly isProductsLoading: boolean;
  readonly isProductsError: boolean;
  readonly isCreating: boolean;
  readonly conflictMessage: string | null;
  readonly onRetryProducts: () => unknown;
  readonly onClose: () => void;
  readonly onCreate: (input: CreateManualBookingInput) => Promise<"success" | "conflict">;
};

export function ManualBookingDialog(props: ManualBookingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const idempotencyKey = useRef(`manual-booking:${crypto.randomUUID()}`);
  const [selectedClient, setSelectedClient] = useState<ClientSelectOption | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedDeliveryFormat, setSelectedDeliveryFormat] =
    useState<ProductDeliveryFormat | "">("");
  const [selectedStartAt, setSelectedStartAt] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocusElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();

    return () => {
      if (dialog?.open) dialog.close();
      returnFocusElement?.focus();
    };
  }, []);

  const products = useMemo(
    () => getBookableManualBookingProducts(props.products, props.schedule),
    [props.products, props.schedule]
  );
  const selectedProduct =
    products.find((product) => product.id === selectedProductId) ?? products[0] ?? null;
  const deliveryFormat =
    selectedDeliveryFormat !== "" &&
    selectedProduct?.deliveryFormats.includes(selectedDeliveryFormat)
      ? selectedDeliveryFormat
      : (selectedProduct?.deliveryFormats[0] ?? "");
  const slotsQuery = useAvailableBookingSlotsQuery(
    {
      productId: selectedProduct?.id ?? "",
      start: props.range.start,
      end: props.range.end
    },
    Boolean(selectedProduct)
  );
  const hasCurrentSlotResponse = isCurrentManualBookingSlotResponse({
    selectedProductId: selectedProduct?.id ?? null,
    responseProductId: slotsQuery.data?.productId ?? null,
    isPlaceholderData: slotsQuery.isPlaceholderData
  });
  const isSlotsLoading =
    !slotsQuery.isError &&
    (slotsQuery.isLoading || slotsQuery.isFetching || slotsQuery.isPlaceholderData);
  const slotOptions = useMemo(
    () =>
      hasCurrentSlotResponse && slotsQuery.data
        ? toManualBookingSlotOptions(slotsQuery.data, props.locale)
        : [],
    [hasCurrentSlotResponse, props.locale, slotsQuery.data]
  );
  const effectiveStartAt = resolveManualBookingStart({
    availableStarts: slotOptions.map((slot) => slot.value),
    selectedStartAt,
    preferredStartAt: props.prefillStartAt
  });
  const selectedSlot = slotOptions.find((slot) => slot.value === effectiveStartAt) ?? null;
  const dateOptions = uniqueBy(
    slotOptions.map((slot) => ({ value: slot.dateKey, label: slot.dateLabel })),
    (option) => option.value
  );
  const slotsForDate = slotOptions.filter((slot) => slot.dateKey === selectedSlot?.dateKey);
  const canSubmit = Boolean(
    selectedClient && selectedProduct && deliveryFormat && effectiveStartAt && !props.isCreating
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    try {
      const command = createManualBookingCommand({
        clientUserId: selectedClient?.value ?? "",
        product: selectedProduct,
        deliveryFormat,
        projectedStartAt: effectiveStartAt,
        availableSlotStarts: slotOptions.map((slot) => slot.value),
        idempotencyKey: idempotencyKey.current
      });
      const result = await props.onCreate(command);
      if (result === "success") props.onClose();
      else void slotsQuery.refetch();
    } catch {
      setSubmitError(props.copy.genericErrorLabel);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="manual-booking-title"
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <form className={styles.card} onSubmit={(event) => void submit(event)}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>{props.copy.eyebrow}</span>
            <h2 id="manual-booking-title">{props.copy.title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className={styles.closeButton}
            type="button"
            aria-label={props.copy.closeLabel}
            onClick={props.onClose}
          >
            ×
          </button>
        </header>

        <ClientSearchCombobox
          label={props.copy.clientLabel}
          value={selectedClient?.value ?? ""}
          placeholder={props.copy.clientPlaceholder}
          selectedClient={selectedClient}
          requireBirthDate={false}
          fullWidth
          disabled={props.isCreating}
          onSelect={setSelectedClient}
        />

        <section className={styles.section} aria-labelledby="manual-booking-service-label">
          <h3 id="manual-booking-service-label">{props.copy.serviceLabel}</h3>
          {props.isProductsLoading ? <p className={styles.state}>{props.copy.loadingProductsLabel}</p> : null}
          {props.isProductsError ? (
            <div className={styles.state} role="alert">
              <span>{props.copy.productsErrorLabel}</span>
              <button type="button" onClick={() => void props.onRetryProducts()}>{props.copy.retryLabel}</button>
            </div>
          ) : null}
          {!props.isProductsLoading && !props.isProductsError && !props.schedule ? (
            <p className={styles.state}>{props.copy.noScheduleLabel}</p>
          ) : null}
          {!props.isProductsLoading && !props.isProductsError && props.schedule && products.length === 0 ? (
            <p className={styles.state}>{props.copy.noProductsLabel}</p>
          ) : null}
          <div className={styles.chips}>
            {products.map((product) => (
              <button
                type="button"
                className={styles.chip}
                data-selected={product.id === selectedProduct?.id ? "true" : undefined}
                aria-pressed={product.id === selectedProduct?.id}
                disabled={props.isCreating}
                key={product.id}
                onClick={() => {
                  setSelectedProductId(product.id);
                  setSelectedDeliveryFormat(product.deliveryFormats[0] ?? "");
                  setSelectedStartAt("");
                }}
              >
                {product.title}
              </button>
            ))}
          </div>
        </section>

        {selectedProduct && selectedProduct.deliveryFormats.length > 1 ? (
          <section className={styles.section}>
            <h3>{props.copy.formatLabel}</h3>
            <div className={styles.chips}>
              {selectedProduct.deliveryFormats.map((format) => (
                <button
                  type="button"
                  className={styles.chip}
                  data-selected={format === deliveryFormat ? "true" : undefined}
                  aria-pressed={format === deliveryFormat}
                  key={format}
                  onClick={() => setSelectedDeliveryFormat(format)}
                >
                  {productCopyByLocale[props.locale].deliveryFormats[format].label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {selectedProduct ? (
          <section className={styles.slotSection} aria-label={props.copy.summaryLabel}>
            {isSlotsLoading ? <p className={styles.state}>{props.copy.loadingSlotsLabel}</p> : null}
            {slotsQuery.isError ? (
              <div className={styles.state} role="alert">
                <span>{props.copy.slotsErrorLabel}</span>
                <button type="button" onClick={() => void slotsQuery.refetch()}>{props.copy.retryLabel}</button>
              </div>
            ) : null}
            {!isSlotsLoading && !slotsQuery.isError && slotOptions.length === 0 ? (
              <p className={styles.state}>{props.copy.noSlotsLabel}</p>
            ) : null}
            {slotOptions.length > 0 ? (
              <div className={styles.selectRow}>
                <label>
                  <span>{props.copy.dateLabel}</span>
                  <select
                    id="manual-booking-date"
                    name="manual-booking-date"
                    value={selectedSlot?.dateKey ?? ""}
                    disabled={props.isCreating}
                    onChange={(event) =>
                      setSelectedStartAt(
                        slotOptions.find((slot) => slot.dateKey === event.target.value)?.value ?? ""
                      )
                    }
                  >
                    <option value="" disabled>{props.copy.dateLabel}</option>
                    {dateOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>{props.copy.timeLabel}</span>
                  <select
                    id="manual-booking-time"
                    name="manual-booking-time"
                    value={effectiveStartAt}
                    disabled={props.isCreating}
                    onChange={(event) => setSelectedStartAt(event.target.value)}
                  >
                    <option value="" disabled>{props.copy.timeLabel}</option>
                    {slotsForDate.map((slot) => <option value={slot.value} key={slot.value}>{slot.timeLabel}</option>)}
                  </select>
                </label>
              </div>
            ) : null}
          </section>
        ) : null}

        {selectedProduct ? (
          <div className={styles.summary}>
            <span>{props.copy.durationLabel(selectedProduct.durationMinutes ?? 0)}</span>
            <strong>{formatMoney(selectedProduct.priceMinor, selectedProduct.currency, props.locale)}</strong>
          </div>
        ) : null}

        {props.conflictMessage || submitError ? (
          <p className={styles.error} role="alert">{props.conflictMessage ?? submitError}</p>
        ) : null}

        <footer className={styles.footer}>
          <button className={styles.cancelButton} type="button" onClick={props.onClose}>{props.copy.cancelLabel}</button>
          <button className={styles.submitButton} type="submit" disabled={!canSubmit}>
            {props.isCreating ? props.copy.creatingLabel : props.copy.createLabel}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const candidate = key(value);
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}

function formatMoney(amountMinor: number, currency: string, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}
