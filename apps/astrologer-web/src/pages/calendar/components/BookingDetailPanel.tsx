import type { CalendarEntry, ManualBooking } from "@elevenhouse/contracts";
import {
  Box,
  Calendar,
  Chat,
  Clock,
  Close,
  Doc,
  Mic,
  Video
} from "@elevenhouse/design-system/icons";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { useEffect, useRef } from "react";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import {
  createBookingDetailViewModel,
  createClientInitials
} from "../../../features/bookings/model/bookingDetailModel";
import styles from "../CalendarPage.module.css";

type BookingDetailPanelProps = {
  readonly copy: AstrologerCopy["calendar"]["bookingDetail"];
  readonly locale: SupportedLocale;
  readonly timeZone: string;
  readonly entry: CalendarEntry;
  readonly booking: ManualBooking | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onRetry: () => unknown;
  readonly onClose: () => void;
};

export function BookingDetailPanel(props: BookingDetailPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (activeElement && activeElement !== closeButtonRef.current) {
      returnFocusRef.current = activeElement;
    }
    closeButtonRef.current?.focus();
  }, [props.entry.id]);

  useEffect(() => () => returnFocusRef.current?.focus(), []);

  const detail = props.booking
    ? createBookingDetailViewModel({
        entry: props.entry,
        booking: props.booking,
        timeZone: props.timeZone,
        locale: props.locale,
        copy: props.copy
      })
    : null;

  return (
    <aside
      className={styles.bookingDetailPanel}
      aria-label={props.copy.panelLabel}
      aria-busy={props.isLoading}
    >
      <header className={styles.bookingDetailHeader}>
        <span className={styles.bookingStatusBadge}>
          <span className={styles.bookingStatusDot} aria-hidden="true" />
          {props.copy.confirmedLabel}
        </span>
        <button
          ref={closeButtonRef}
          className={styles.bookingDetailCloseButton}
          type="button"
          aria-label={props.copy.closeLabel}
          onClick={props.onClose}
        >
          <Close width={17} height={17} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.bookingDetailContent}>
        <div className={styles.bookingIdentity}>
          <span className={styles.bookingAvatar} aria-hidden="true">
            {detail?.clientInitials ?? createClientInitials(props.entry.title)}
          </span>
          <div>
            <strong>{props.entry.title}</strong>
            <span>{props.entry.subtitle}</span>
          </div>
        </div>

        {props.isLoading ? (
          <div className={styles.bookingDetailState}>{props.copy.loadingLabel}</div>
        ) : null}

        {props.isError ? (
          <div className={styles.bookingDetailState} role="alert">
            <span>{props.copy.errorLabel}</span>
            <button type="button" onClick={() => void props.onRetry()}>
              {props.copy.retryLabel}
            </button>
          </div>
        ) : null}

        {detail && !props.isLoading && !props.isError ? (
          <dl className={styles.bookingDetailList}>
            <BookingDetailRow
              icon={<Box />}
              label={props.copy.fieldLabels.productAndPrice}
              value={
                <span className={styles.bookingProductAndPrice}>
                  <span className={styles.bookingDetailProduct}>{detail.productTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span className={styles.bookingDetailPrice}>{detail.priceLabel}</span>
                </span>
              }
            />
            <BookingDetailRow
              icon={<Calendar />}
              label={props.copy.fieldLabels.date}
              value={detail.dateLabel}
            />
            <BookingDetailRow
              icon={<Clock />}
              label={props.copy.fieldLabels.time}
              value={detail.timeLabel}
            />
            <BookingDetailRow
              icon={<DeliveryFormatIcon format={props.booking?.deliveryFormat ?? "video"} />}
              label={props.copy.fieldLabels.deliveryFormat}
              value={detail.deliveryFormatLabel}
            />
          </dl>
        ) : null}
      </div>
    </aside>
  );
}

function BookingDetailRow(props: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: React.ReactNode;
}) {
  return (
    <div className={styles.bookingDetailRow}>
      <dt>
        <span aria-hidden="true">{props.icon}</span>
        <span className={styles.visuallyHidden}>{props.label}</span>
      </dt>
      <dd>{props.value}</dd>
    </div>
  );
}

function DeliveryFormatIcon(props: { readonly format: ManualBooking["deliveryFormat"] }) {
  const iconProps = { width: 16, height: 16, "aria-hidden": true } as const;
  if (props.format === "video") return <Video {...iconProps} />;
  if (props.format === "audio") return <Mic {...iconProps} />;
  if (props.format === "chat" || props.format === "channel") return <Chat {...iconProps} />;
  return <Doc {...iconProps} />;
}
