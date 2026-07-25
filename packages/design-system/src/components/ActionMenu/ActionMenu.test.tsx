import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActionMenu } from "./ActionMenu.js";

const actionMenuCss = readFileSync(
  fileURLToPath(new URL("./ActionMenu.css", import.meta.url)),
  "utf8"
);

describe("ActionMenu", () => {
  it("renders an accessible closed menu button shell", () => {
    const markup = renderToStaticMarkup(
      <ActionMenu
        label="Действия продукта"
        items={[
          { id: "edit", label: "Изменить", onSelect: vi.fn() },
          { id: "archive", label: "В архив", tone: "danger", onSelect: vi.fn() }
        ]}
      />
    );

    expect(markup).toContain('class="ehActionMenu"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Действия продукта");
    expect(markup).not.toContain('role="menu"');
  });

  it("defines trigger, popover, item and danger item styles", () => {
    expect(actionMenuCss).toContain(".ehActionMenu");
    expect(actionMenuCss).toContain(".ehActionMenu__trigger");
    expect(actionMenuCss).toContain(".ehActionMenu__popover");
    expect(actionMenuCss).toContain(".ehActionMenu__item");
    expect(actionMenuCss).toContain(".ehActionMenu__item--danger");
  });

  it("supports an icon-only trigger with an explicit accessible label", () => {
    const markup = renderToStaticMarkup(
      <ActionMenu
        label={<span aria-hidden="true">...</span>}
        triggerAriaLabel="Статус продукта"
        showChevron={false}
        items={[{ id: "edit", label: "Изменить", onSelect: vi.fn() }]}
      />
    );

    expect(markup).toContain('aria-label="Статус продукта"');
    expect(markup).toContain("...");
    expect(markup).not.toContain("ehActionMenu__triggerChevron");
  });

  it("can be controlled by the owning surface", () => {
    const markup = renderToStaticMarkup(
      <ActionMenu
        label="Действия"
        open
        onOpenChange={vi.fn()}
        items={[{ id: "edit", label: "Изменить", onSelect: vi.fn() }]}
      />
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('role="menu"');
    expect(markup).toContain("Изменить");
  });
});
