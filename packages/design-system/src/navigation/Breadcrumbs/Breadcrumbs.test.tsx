import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumbs } from "./Breadcrumbs.js";

const breadcrumbsCss = readFileSync(
  fileURLToPath(new URL("./Breadcrumbs.css", import.meta.url)),
  "utf8"
);

describe("Breadcrumbs", () => {
  it("renders an accessible ordered breadcrumb trail with the current step", () => {
    const markup = renderToStaticMarkup(
      <Breadcrumbs
        ariaLabel="Путь создания продукта"
        items={[
          { id: "products", label: "Продукты", onClick: vi.fn() },
          { id: "create", label: "Создать", onClick: vi.fn() },
          { id: "custom", label: "Свой формат", isCurrent: true }
        ]}
      />
    );

    expect(markup).toContain('<nav class="ehBreadcrumbs" aria-label="Путь создания продукта">');
    expect(markup).toContain('<ol class="ehBreadcrumbs__list">');
    expect(markup).toContain('class="ehBreadcrumbs__item"');
    expect(markup).toContain('class="ehBreadcrumbs__button"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain('class="ehBreadcrumbs__current"');
    expect(markup).toContain("Продукты");
    expect(markup).toContain("Создать");
    expect(markup).toContain("Свой формат");
  });

  it("calls item actions only for interactive breadcrumb items", () => {
    const onProductsClick = vi.fn();
    const onCreateClick = vi.fn();
    const element = Breadcrumbs({
      ariaLabel: "Путь создания продукта",
      items: [
        { id: "products", label: "Продукты", onClick: onProductsClick },
        { id: "create", label: "Создать", onClick: onCreateClick },
        { id: "custom", label: "Свой формат", isCurrent: true }
      ]
    });

    const list = element.props.children;
    const items = list.props.children;

    items[0].props.children.props.onClick();
    items[1].props.children.props.onClick();

    expect(onProductsClick).toHaveBeenCalledOnce();
    expect(onCreateClick).toHaveBeenCalledOnce();
    expect(items[2].props.children.props.onClick).toBeUndefined();
  });

  it("defines the compact ElevenHouse breadcrumb visual style", () => {
    expect(breadcrumbsCss).toContain("font-size: 12px;");
    expect(breadcrumbsCss).toContain("font-weight: 400;");
    expect(breadcrumbsCss).toContain("color: rgb(111 106 147);");
    expect(breadcrumbsCss).toContain("color: rgb(246 210 102);");
    expect(breadcrumbsCss).toContain(".ehBreadcrumbs__item + .ehBreadcrumbs__item::before");
  });
});
