import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const productsPageCss = readFileSync(
  fileURLToPath(new URL("./ProductsPage.module.css", import.meta.url)),
  "utf8"
);

describe("ProductsPage.module.css", () => {
  it("uses stable responsive grid dimensions for product cards", () => {
    expect(productsPageCss).toContain(".productGrid {");
    expect(productsPageCss).toContain("grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));");
    expect(productsPageCss).toContain(".productCard {");
    expect(productsPageCss).toContain("min-height:");
  });

  it("switches to a one-column mobile list without nested card layouts", () => {
    expect(productsPageCss).toContain("@media (max-width: 820px)");
    expect(productsPageCss).toContain("grid-template-columns: 1fr;");
    expect(productsPageCss).not.toContain(".productCard .ehCard");
  });
});
