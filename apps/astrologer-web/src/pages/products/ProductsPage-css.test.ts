import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const productsPageCss = readFileSync(
  fileURLToPath(new URL("./ProductsPage.module.css", import.meta.url)),
  "utf8"
);
const productConstructorModalCss = readFileSync(
  fileURLToPath(
    new URL(
      "./components/ProductConstructorModal/ProductConstructorModal.module.css",
      import.meta.url
    )
  ),
  "utf8"
);

describe("ProductsPage.module.css", () => {
  it("uses stable responsive grid dimensions for product cards", () => {
    expect(productsPageCss).toContain(".productGrid {");
    expect(productsPageCss).toContain(
      "grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));"
    );
    expect(productsPageCss).toContain(".productCard {");
    expect(productsPageCss).toContain("min-height:");
  });

  it("switches to a one-column mobile list without nested card layouts", () => {
    expect(productsPageCss).toContain("@media (max-width: 820px)");
    expect(productsPageCss).toContain("grid-template-columns: 1fr;");
    expect(productsPageCss).not.toContain(".productCard .ehCard");
  });

  it("uses design-system tokens directly instead of one-to-one local aliases", () => {
    expect(productsPageCss.match(/--products-[\w-]+:\s*var\(--eh-/)).toBeNull();
  });

  it("keeps the products constructor overlay compact inside the products outlet", () => {
    expect(productsPageCss).toContain(".productScopedModalBackdrop {");
    expect(productsPageCss).toContain(
      "min-height: calc(100dvh - var(--astrologer-app-header-height, 68px));"
    );
    expect(productsPageCss).toContain("padding: 24px;");
    expect(productsPageCss).toContain("background: rgb(7 6 15 / 0.7);");
    expect(productsPageCss).toContain("backdrop-filter: blur(4px);");
    expect(productsPageCss).not.toContain(
      "min-height: calc(100dvh - var(--astrologer-app-header-height, 68px) - 64px);"
    );
    expect(productsPageCss).not.toContain("padding: 56px 64px;");
    expect(productsPageCss).not.toContain("background: rgb(7 6 15 / 0.42);");
  });

  it("matches the product constructor density from the design reference", () => {
    expect(productConstructorModalCss).toContain("width: min(1080px, 100%);");
    expect(productConstructorModalCss).toContain("height: min(935px, 92%);");
    expect(productConstructorModalCss).toContain("padding: 18px 24px;");
    expect(productConstructorModalCss).toContain("font-size: 20px;");
    expect(productConstructorModalCss).toContain("padding: 22px 24px 28px;");
    expect(productConstructorModalCss).toContain("font-size: 11px;");
    expect(productConstructorModalCss).toContain("letter-spacing: 0.12em;");
    expect(productConstructorModalCss).toContain("width: 150px;");
    expect(productConstructorModalCss).toContain("height: 96px;");
    expect(productConstructorModalCss).toContain("min-height: 44px;");
    expect(productConstructorModalCss).toContain("font-size: 15px;");
    expect(productConstructorModalCss).toContain("padding: 7px 12px;");
    expect(productConstructorModalCss).toContain("font-size: 13px;");
    expect(productConstructorModalCss).toContain("height: 150px;");
    expect(productConstructorModalCss).toContain(".constructorAddRow {");
    expect(productConstructorModalCss).toContain("width: 42px;");
    expect(productConstructorModalCss).toContain("font-size: 25px;");
    expect(productConstructorModalCss).not.toContain("width: min(1480px, 100%);");
    expect(productConstructorModalCss).not.toContain("height: min(828px, 92%);");
    expect(productConstructorModalCss).not.toContain("height: min(844px, 100%);");
    expect(productConstructorModalCss).not.toContain("min-height: 64px;");
    expect(productConstructorModalCss).not.toContain("font-size: 42px;");
  });

  it("keeps product constructor internals out of the page-level stylesheet", () => {
    expect(productsPageCss).not.toContain(".productConstructorModal {");
    expect(productsPageCss).not.toContain(".constructorPreviewColumn");
    expect(productConstructorModalCss).toContain(".productConstructorModal {");
  });
});
