import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NumerologyInterpretationEditor } from "./NumerologyInterpretationEditor";

describe("NumerologyInterpretationEditor", () => {
  it("starts as a compact accessible AI portrait disclosure", () => {
    const markup = renderToStaticMarkup(
      <NumerologyInterpretationEditor
        text="Черновик"
        placeholder="Введите трактовку"
        isCreatingAiDraft={false}
        aiDraftErrorMessage={null}
        aiDraftDisabled={false}
        aiDraftDisabledReason={null}
        saveDisabled={false}
        approveDisabled={false}
        onTextChange={vi.fn()}
        onCreateAiDraft={vi.fn()}
        onSave={vi.fn()}
        onApprove={vi.fn()}
      />
    );

    expect(markup).toContain("AI-разбор портрета");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="numerology-interpretation-');
    expect(markup).not.toContain('aria-label="Текст трактовки"');
    expect(markup).not.toContain("Создать AI-черновик");
    expect(markup).not.toContain("eh-button");
  });

  it("opens active work with design-system actions, progress, errors and disabled reason", () => {
    const markup = renderToStaticMarkup(
      <NumerologyInterpretationEditor
        text="Несохранённый текст"
        placeholder="Введите трактовку"
        isCreatingAiDraft
        aiDraftErrorMessage="AI временно недоступен"
        aiDraftDisabled
        aiDraftDisabledReason="Сначала сохраните или отмените изменения"
        saveDisabled={false}
        approveDisabled
        onTextChange={vi.fn()}
        onCreateAiDraft={vi.fn()}
        onSave={vi.fn()}
        onApprove={vi.fn()}
      />
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-label="Текст трактовки"');
    expect(markup).toContain("Создаём черновик…");
    expect(markup).toContain("Сохранить");
    expect(markup).toContain("Утвердить");
    expect(markup).toContain("ehButton--glass");
    expect(markup).toContain("ehButton--brand");
    expect(markup).toContain('title="Сначала сохраните или отмените изменения"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("AI временно недоступен");
  });
});
