import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { ManualBookingDialog } from "./ManualBookingDialog";

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
    const css = readFileSync(new URL("./ManualBookingDialog.module.css", import.meta.url), "utf8");

    expect(css).toContain("width: min(740px, calc(100vw - 32px));");
    expect(css).toContain("border-radius: 28px;");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("grid-template-columns: 1fr;");
  });

  it("restores focus to the control that opened the modal", () => {
    const source = readFileSync(new URL("./ManualBookingDialog.tsx", import.meta.url), "utf8");

    expect(source).toContain("returnFocusElement?.focus()");
  });
});
