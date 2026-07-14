import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NumerologyYearPicker } from "./NumerologyYearPicker";

describe("NumerologyYearPicker", () => {
  it("exposes the selected year as an accessible disclosure control", () => {
    const markup = renderToStaticMarkup(
      <NumerologyYearPicker
        selectedYear={2027}
        isOpen
        isPeriodVisible
        isPreviewPending={false}
        errorMessage={null}
        disabled={false}
        onToggle={vi.fn()}
        onApply={vi.fn()}
        onHide={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(markup).toContain("Год · 2027");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-controls="numerology-year-picker"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain("Текущий год");
    expect(markup).toContain("Применить");
    expect(markup).toContain("Скрыть период");
  });

  it("keeps the popover closed and trigger disabled when the year action is unavailable", () => {
    const markup = renderToStaticMarkup(
      <NumerologyYearPicker
        selectedYear={2027}
        isOpen={false}
        isPeriodVisible={false}
        isPreviewPending={false}
        errorMessage={null}
        disabled
        onToggle={vi.fn()}
        onApply={vi.fn()}
        onHide={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("Текущий год");
  });

  it("renders a retryable period error as an accessible status", () => {
    const markup = renderToStaticMarkup(
      <NumerologyYearPicker
        selectedYear={2027}
        isOpen
        isPeriodVisible
        isPreviewPending={false}
        errorMessage="Не удалось обновить период"
        disabled={false}
        onToggle={vi.fn()}
        onApply={vi.fn()}
        onHide={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Не удалось обновить период");
    expect(markup).toContain("Повторить");
  });
});
