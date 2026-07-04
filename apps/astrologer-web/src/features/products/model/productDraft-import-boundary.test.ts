import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const productDraftSource = readFileSync(
  fileURLToPath(new URL("./productDraft.ts", import.meta.url)),
  "utf8"
);

describe("productDraft import boundary", () => {
  it("imports only the product contracts subpath at runtime", () => {
    expect(productDraftSource).toContain('} from "@elevenhouse/contracts/products";');
    expect(productDraftSource).not.toContain('} from "@elevenhouse/contracts";');
  });
});
