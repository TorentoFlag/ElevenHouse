import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal.js";

const modalCss = readFileSync(fileURLToPath(new URL("./Modal.css", import.meta.url)), "utf8");

describe("Modal", () => {
  it("renders an accessible modal dialog shell with title, close button and content", () => {
    const onClose = vi.fn();
    const markup = renderToStaticMarkup(
      <Modal title="Новая трактовка" closeLabel="Закрыть" onClose={onClose}>
        <form data-modal-form="true" />
      </Modal>
    );

    expect(markup).toContain('class="ehModal__backdrop"');
    expect(markup).toContain('class="ehModal__dialog"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("Новая трактовка");
    expect(markup).toContain(
      'class="ehIconButton ehIconButton--medium ehIconButton--quiet ehModal__closeButton"'
    );
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Закрыть"');
    expect(markup).toContain("<svg");
    expect(markup).toContain('class="ehIconButton__icon"');
    expect(markup).toContain('data-modal-form="true"');
  });

  it("renders JSX title content and optional right header content", () => {
    const markup = renderToStaticMarkup(
      <Modal
        title={
          <>
            <span>Новая трактовка</span>
            <span data-title-badge="true">Draft</span>
          </>
        }
        right={<button type="button">Сохранить</button>}
        closeLabel="Закрыть"
        onClose={vi.fn()}
      >
        Content
      </Modal>
    );

    expect(markup).toContain('class="ehModal__title"');
    expect(markup).toContain('data-title-badge="true"');
    expect(markup).toContain('class="ehModal__right"');
    expect(markup).toContain("<button");
    expect(markup).toContain("Сохранить");
    expect(markup).toContain('aria-label="Закрыть"');
  });

  it("does not render when closed and passes custom classes through", () => {
    expect(
      renderToStaticMarkup(
        <Modal open={false} title="Новая трактовка" closeLabel="Закрыть" onClose={vi.fn()}>
          Content
        </Modal>
      )
    ).toBe("");

    const markup = renderToStaticMarkup(
      <Modal
        title="Новая трактовка"
        closeLabel="Закрыть"
        backdropClassName="custom-backdrop"
        className="custom-dialog"
        contentClassName="custom-content"
        onClose={vi.fn()}
      >
        Content
      </Modal>
    );

    expect(markup).toContain('class="ehModal__backdrop custom-backdrop"');
    expect(markup).toContain('class="ehModal__dialog custom-dialog"');
    expect(markup).toContain('class="ehModal__content custom-content"');
  });

  it("defines reusable modal shell styles through design-system classes", () => {
    expect(modalCss).toContain(".ehModal__backdrop");
    expect(modalCss).toContain("backdrop-filter: blur(6px);");
    expect(modalCss).toContain(".ehModal__dialog");
    expect(modalCss).toContain(
      "background: linear-gradient(rgb(22, 20, 47), color(srgb 0.0793726 0.0721569 0.1));"
    );
    expect(modalCss).toContain("font-weight: 700;");
    expect(modalCss).not.toContain(".ehModal__closeButton::before");
    expect(modalCss).not.toContain(".ehModal__closeButton::after");
    expect(modalCss).toContain("@media (prefers-reduced-motion: no-preference)");
  });
});
