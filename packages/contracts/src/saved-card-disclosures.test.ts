import { describe, expect, it } from "vitest";
import {
  adminSavedCardDisclosureDraftRequestSchema,
  adminSavedCardDisclosurePublishRequestSchema,
  adminSavedCardDisclosureResponseSchema,
  adminSavedCardDisclosureUpdateRequestSchema
} from "./saved-card-disclosures";

const draft = { disclosureSeriesId: "platform-tariff-saved-card", version: 1, locale: "ru" as const, body: "Согласие на сохранение карты и рекуррентные списания." };
describe("saved-card disclosure admin contracts", () => {
  it("requires an immutable identity and an optimistic draft revision", () => {
    expect(adminSavedCardDisclosureDraftRequestSchema.parse(draft)).toEqual(draft);
    expect(adminSavedCardDisclosureUpdateRequestSchema.parse({ ...draft, expectedDraftRevision: 1 })).toMatchObject({ expectedDraftRevision: 1 });
    expect(adminSavedCardDisclosurePublishRequestSchema.parse({ expectedDraftRevision: 1 })).toEqual({ expectedDraftRevision: 1 });
    expect(adminSavedCardDisclosureResponseSchema.parse({ ...draft, draftRevision: 1, lifecycle: "published", canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })).toMatchObject({ lifecycle: "published" });
  });
});
