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
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
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
  readonly sessionId?: string | null;
  readonly sessionStatus?: "loading" | "ready" | "error";
  readonly onRetrySession?: () => void;
};

export function BookingDetailPanel(props: BookingDetailPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isMobileSheet = useIsMobileCalendarViewport();
  const sessionStatus = props.sessionStatus ?? "ready";

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
      ref={panelRef}
      className={styles.bookingDetailPanel}
      data-mobile-sheet="true"
      role={isMobileSheet ? "dialog" : undefined}
      aria-modal={isMobileSheet ? true : undefined}
      aria-label={props.copy.panelLabel}
      aria-busy={props.isLoading}
      onKeyDown={(event) =>
        handlePanelKeyDown(event, {
          isMobileSheet,
          panel: panelRef.current,
          onClose: props.onClose
        })
      }
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
          <>
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
            {props.sessionId &&
            props.booking?.deliveryFormat === "video" &&
            sessionStatus === "ready" ? (
              <Link className={styles.bookingSessionAction} to={`/sessions/${props.sessionId}`}>
                <Video width={17} height={17} aria-hidden="true" />
                {props.locale === "ru" ? "Войти в сессию" : "Join session"}
              </Link>
            ) : null}
            {props.booking?.deliveryFormat === "video" && sessionStatus === "loading" ? (
              <div className={styles.bookingDetailState} aria-live="polite">
                {props.locale === "ru" ? "Проверяем доступ к сессии…" : "Checking session access…"}
              </div>
            ) : null}
            {props.booking?.deliveryFormat === "video" && sessionStatus === "error" ? (
              <div className={styles.bookingDetailState} role="alert">
                <span>
                  {props.locale === "ru"
                    ? "Не удалось проверить доступ к сессии."
                    : "Could not check session access."}
                </span>
                <button type="button" onClick={props.onRetrySession}>
                  {props.locale === "ru" ? "Повторить" : "Retry"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function useIsMobileCalendarViewport(): boolean {
  const mediaQuery = "(max-width: 760px)";
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(mediaQuery).matches === true
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(mediaQuery);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return matches;
}

function handlePanelKeyDown(
  event: KeyboardEvent<HTMLElement>,
  input: {
    readonly isMobileSheet: boolean;
    readonly panel: HTMLElement | null;
    readonly onClose: () => void;
  }
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    input.onClose();
    return;
  }
  if (!input.isMobileSheet || event.key !== "Tab" || !input.panel) return;

  const focusable = Array.from(
    input.panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;

  if (focusable.length === 1) {
    event.preventDefault();
    first.focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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
