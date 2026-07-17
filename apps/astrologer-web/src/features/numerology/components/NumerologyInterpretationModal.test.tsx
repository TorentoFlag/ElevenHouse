import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { NumerologyInterpretationModal } from "./NumerologyInterpretationModal";

describe("NumerologyInterpretationModal", () => {
  it("renders the accessible long-form editor with explicit actions", () => {
    const markup = renderToStaticMarkup(
      <NumerologyInterpretationModal
        open
        copy={astrologerCopyByLocale.ru.numerology.interpretation}
        text="Черновик"
        placeholder="Введите трактовку"
        isCreatingAiDraft={false}
        aiDraftErrorMessage="Не удалось создать черновик"
        saveDisabled={false}
        approveDisabled={false}
        onClose={vi.fn()}
        onTextChange={vi.fn()}
        onSave={vi.fn()}
        onApprove={vi.fn()}
      />
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Трактовка нумерологического портрета");
    expect(markup).toContain("<label");
    expect(markup).toContain("Текст трактовки");
    expect(markup).toContain('aria-label="Закрыть редактор трактовки"');
    expect(markup).toContain("Сохранить черновик");
    expect(markup).toContain("Утвердить");
    expect(markup).toContain('role="alert"');
  });

  it("uses the approved desktop and responsive editor geometry", () => {
    const css = readFileSync(
      new URL("./NumerologyInterpretationModal.module.css", import.meta.url),
      "utf8"
    );

    expect(css).toMatch(
      /\.dialog\s*\{[^}]*width:\s*min\(840px, calc\(100vw - 48px\)\)/s
    );
    expect(css).toMatch(
      /\.dialog\s*\{[^}]*height:\s*min\(720px, calc\(100dvh - 48px\)\)/s
    );
    expect(css).toMatch(/\.textarea\s*\{[^}]*font-size:\s*16px/s);
    expect(css).toMatch(/\.textarea\s*\{[^}]*line-height:\s*1\.6/s);
    expect(css).toMatch(/\.textarea\s*\{[^}]*max-width:\s*80ch/s);
    expect(css).toMatch(/\.textarea\s*\{[^}]*resize:\s*none/s);
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("@media (max-width: 360px)");
  });
});
