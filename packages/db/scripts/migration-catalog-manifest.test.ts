import { describe, expect, it } from "vitest";

import { assertCatalogEquivalent, createCatalogManifest } from "./migration-catalog-manifest";

describe("migration catalog manifest", () => {
  it("sorts catalog rows before calculating its digest", () => {
    const first = createCatalogManifest({
      relations: [{ name: "products" }, { name: "identity_users" }],
      constraints: [{ definition: "CHECK (amount > 0)" }]
    });
    const second = createCatalogManifest({
      relations: [{ name: "identity_users" }, { name: "products" }],
      constraints: [{ definition: "CHECK (amount > 0)" }]
    });

    expect(first.digest).toBe(second.digest);
    expect(() => assertCatalogEquivalent(first, second)).not.toThrow();
  });

  it("reports a changed semantic definition by catalog category", () => {
    const reference = createCatalogManifest({
      indexes: [{ name: "products_active_idx", definition: "WHERE active" }]
    });
    const candidate = createCatalogManifest({
      indexes: [{ name: "products_active_idx", definition: "WHERE archived = false" }]
    });

    expect(reference.digest).not.toBe(candidate.digest);
    expect(() => assertCatalogEquivalent(reference, candidate)).toThrow(
      "MIGRATION_CATALOG_MISMATCH:indexes"
    );
  });

  it.each([
    ["columns", { default: "0" }, { default: "1" }],
    ["constraints", { definition: "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT" }, { definition: "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE" }],
    ["constraints", { definition: "CHECK (amount > 0)" }, { definition: "CHECK (amount >= 0)" }],
    ["indexes", { definition: "CREATE INDEX products_active_idx ON products USING btree (id) WHERE active" }, { definition: "CREATE INDEX products_active_idx ON products USING btree (id) WHERE archived = false" }],
    ["routines", { definition: "CREATE FUNCTION apply() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$" }, { definition: "CREATE FUNCTION apply() RETURNS void LANGUAGE sql AS $$ SELECT 2 $$" }],
    ["triggers", { definition: "CREATE TRIGGER audit BEFORE INSERT ON products EXECUTE FUNCTION audit_row()", enabled: "O" }, { definition: "CREATE TRIGGER audit BEFORE INSERT ON products EXECUTE FUNCTION audit_row()", enabled: "D" }]
  ] as const)("reports a changed %s semantic", (category, referenceRow, candidateRow) => {
    const reference = createCatalogManifest({ [category]: [referenceRow] });
    const candidate = createCatalogManifest({ [category]: [candidateRow] });

    expect(() => assertCatalogEquivalent(reference, candidate)).toThrow(
      `MIGRATION_CATALOG_MISMATCH:${category}`
    );
  });
});
