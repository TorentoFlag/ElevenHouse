import { describe, expect, it } from "vitest";
import {
  canonicalizeSavedCardDisclosure,
  createSavedCardDisclosureDraft
} from "@elevenhouse/domain/finance-core";

import {
  SavedCardDisclosureAuthorityPersistenceError,
  mapSavedCardDisclosureVersion
} from "./drizzle-saved-card-disclosure-authority-store";

const disclosure = {
  disclosureSeriesId: "platform-tariff-saved-card",
  version: 1,
  locale: "ru" as const,
  body: "Согласие на сохранение карты и регулярные списания."
};

describe("Drizzle saved-card disclosure authority store", () => {
  it("rehydrates the exact digest-bound draft that can still be edited", () => {
    const draft = createSavedCardDisclosureDraft(disclosure);

    expect(mapSavedCardDisclosureVersion({
      ...disclosure,
      draftRevision: 4,
      lifecycle: "draft",
      canonicalPreimage: canonicalizeSavedCardDisclosure(draft.disclosure),
      canonicalDigest: draft.disclosure.canonicalDigest,
      createdAt: new Date(),
      publishedAt: null,
      retiredAt: null
    } as never)).toEqual({ ...draft, draftRevision: 4 });
  });

  it("rejects an impossible published lifecycle or canonical preimage", () => {
    const draft = createSavedCardDisclosureDraft(disclosure);
    const persistedDraft = {
      ...disclosure,
      draftRevision: 1,
      canonicalPreimage: canonicalizeSavedCardDisclosure(draft.disclosure),
      canonicalDigest: draft.disclosure.canonicalDigest,
      createdAt: new Date()
    };
    for (const row of [
      { lifecycle: "published", publishedAt: null, retiredAt: null },
      { lifecycle: "published", publishedAt: new Date(), retiredAt: null, canonicalPreimage: "{}" }
    ]) {
      expect(() => mapSavedCardDisclosureVersion({
        ...persistedDraft,
        ...row
      } as never)).toThrow(SavedCardDisclosureAuthorityPersistenceError);
    }
  });
});
