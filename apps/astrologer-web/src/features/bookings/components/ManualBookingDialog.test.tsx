// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { ManualBookingDialog } from "./ManualBookingDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => {
  document.body.replaceChildren();
});

const dialogSourcePath = resolveFixturePath("src/features/bookings/components/ManualBookingDialog.tsx");
const dialogStylesPath = resolveFixturePath(
  "src/features/bookings/components/ManualBookingDialog.module.css"
);

describe("ManualBookingDialog", () => {
  it("renders an accessible production empty state without prototype-only payment controls", () => {
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ManualBookingDialog
          copy={astrologerCopyByLocale.ru.calendar.manualBooking}
          locale="ru"
          range={{ start: "2026-07-20T00:00:00.000Z", end: "2026-07-27T00:00:00.000Z" }}
          schedule={null}
          products={[]}
          prefillStartAt={null}
          isProductsLoading={false}
          isProductsError={false}
          isCreating={false}
          conflictMessage={null}
          onRetryProducts={vi.fn()}
          onClose={vi.fn()}
          onCreate={vi.fn()}
        />
      </QueryClientProvider>
    );

    expect(markup).toContain("<dialog");
    expect(markup).toContain('aria-labelledby="manual-booking-title"');
    expect(markup).toContain("Записать клиента");
    expect(markup).toContain("Сначала настройте доступность");
    expect(markup).toContain("Создать запись");
    expect(markup).not.toContain("Предоплата");
    expect(markup).not.toContain("Постоплата");
    expect(markup).not.toContain("Новый клиент");
  });

  it("keeps the measured desktop card and a responsive single-column fallback", () => {
    const css = readFileSync(dialogStylesPath, "utf8");

    expect(css).toContain("width: min(740px, calc(100vw - 32px));");
    expect(css).toContain("border-radius: 28px;");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("grid-template-columns: 1fr;");
  });

  it("restores focus to the control that opened the modal", () => {
    const source = readFileSync(dialogSourcePath, "utf8");

    expect(source).toContain("returnFocusElement?.focus()");
  });

  it("focuses close, handles native Escape cancellation and restores the opener", () => {
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.setAttribute("open", "");
        }
      },
      close: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.removeAttribute("open");
        }
      }
    });
    const opener = document.createElement("button");
    const container = document.createElement("div");
    document.body.append(opener, container);
    opener.focus();
    const root = createRoot(container);
    const onClose = vi.fn();

    act(() => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <ManualBookingDialog
            copy={astrologerCopyByLocale.ru.calendar.manualBooking}
            locale="ru"
            range={{
              start: "2026-07-20T00:00:00.000Z",
              end: "2026-07-27T00:00:00.000Z"
            }}
            schedule={null}
            products={[]}
            prefillStartAt={null}
            isProductsLoading={false}
            isProductsError={false}
            isCreating={false}
            conflictMessage={null}
            onRetryProducts={vi.fn()}
            onClose={onClose}
            onCreate={vi.fn()}
          />
        </QueryClientProvider>
      );
    });

    const dialog = container.querySelector("dialog");
    const close = container.querySelector<HTMLButtonElement>('[aria-label="Закрыть окно записи"]');
    expect(document.activeElement).toBe(close);

    act(() => dialog?.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(onClose).toHaveBeenCalledOnce();

    act(() => root.unmount());
    expect(document.activeElement).toBe(opener);
  });

  it("keeps an unavailable clicked hour unselected until a server slot is chosen", () => {
    const source = readFileSync(dialogSourcePath, "utf8");

    expect(source).toContain("resolveManualBookingStart({");
    expect(source).toContain("<BookingSlotPicker");
    expect(source).toContain("createManualBookingSlotQueryRange({");
    expect(source).not.toContain('id="manual-booking-date"');
    expect(source).not.toContain('name="manual-booking-date"');
    expect(source).not.toContain('id="manual-booking-time"');
    expect(source).not.toContain('name="manual-booking-time"');
  });
});

function resolveFixturePath(pathFromAppRoot: string): string {
  return process.cwd().endsWith("apps/astrologer-web")
    ? join(process.cwd(), pathFromAppRoot)
    : join(process.cwd(), "apps/astrologer-web", pathFromAppRoot);
}
