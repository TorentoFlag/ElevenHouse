import { describe, expect, it } from "vitest";
import {
  createSavedCardDisclosureDraft,
  publishSavedCardDisclosureDraft,
  retirePublishedSavedCardDisclosure,
  reviseSavedCardDisclosureDraft,
  SavedCardDisclosureAuthorityError,
  verifySavedCardDisclosureVersion
} from "./saved-card-disclosure-authority";

const terms = {
  disclosureSeriesId: "platform-tariff-saved-card",
  version: 1,
  locale: "ru" as const,
  body: "Согласие на сохранение карты и регулярные списания."
};

describe("saved-card disclosure authority", () => {
  it("seals an explicit legal disclosure before it can be served for consent", () => {
    const draft = createSavedCardDisclosureDraft(terms);
    const published = publishSavedCardDisclosureDraft(draft);

    expect(published).toMatchObject({ lifecycle: "published", draftRevision: 1 });
    expect(published.disclosure.canonicalDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(verifySavedCardDisclosureVersion(published)).toEqual(published);
  });

  it("requires the expected draft revision and rejects a changed digest on rehydration", () => {
    const draft = createSavedCardDisclosureDraft(terms);

    expect(() =>
      reviseSavedCardDisclosureDraft({
        current: draft,
        expectedDraftRevision: 2,
        next: { ...terms, body: "Новая редакция" }
      })
    ).toThrow(SavedCardDisclosureAuthorityError);

    expect(() =>
      reviseSavedCardDisclosureDraft({
        current: draft,
        expectedDraftRevision: 1,
        next: { ...terms, locale: "en", body: "Saved-card and recurring charge consent." }
      })
    ).toThrow(SavedCardDisclosureAuthorityError);

    expect(() =>
      verifySavedCardDisclosureVersion({
        ...draft,
        disclosure: { ...draft.disclosure, body: "Подменённый текст" }
      })
    ).toThrow(SavedCardDisclosureAuthorityError);
  });

  it("retires a published disclosure without changing its legal text or digest", () => {
    const published = publishSavedCardDisclosureDraft(createSavedCardDisclosureDraft(terms));

    const retired = retirePublishedSavedCardDisclosure(published);

    expect(retired).toEqual({ ...published, lifecycle: "retired" });
    expect(() => retirePublishedSavedCardDisclosure(retired)).toThrow(SavedCardDisclosureAuthorityError);
  });
});
