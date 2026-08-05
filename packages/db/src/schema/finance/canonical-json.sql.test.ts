import { describe, expect, it } from "vitest";

import { financeCanonicalJsonV1Sql } from "./canonical-json.sql";

describe("finance canonical JSON PostgreSQL authority", () => {
  it("recurses through objects and arrays with C/codepoint key ordering", () => {
    const normalized = financeCanonicalJsonV1Sql.replaceAll(/\s+/g, " ").toLowerCase();

    expect(normalized).toContain("create or replace function finance_canonical_jsonb_v1");
    expect(normalized).toContain("jsonb_each");
    expect(normalized).toContain('order by entry.key collate "c"');
    expect(normalized).toContain("jsonb_array_elements");
    expect(normalized).toContain("with ordinality");
    expect(normalized).toContain("finance canonical json numbers must be safe integers");
    expect(normalized).not.toContain("return value::text");
  });
});
