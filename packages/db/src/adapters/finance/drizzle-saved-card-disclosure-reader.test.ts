import { describe, expect, it } from "vitest";
import {
  canonicalizeSavedCardDisclosure,
  createSavedCardDisclosureDraft,
  publishSavedCardDisclosureDraft
} from "@elevenhouse/domain/finance-core";

import {
  SavedCardDisclosureReaderPersistenceError,
  mapPublishedSavedCardDisclosure
} from "./drizzle-saved-card-disclosure-reader";

const input = {
  disclosureSeriesId: "platform-tariff-saved-card",
  version: 2,
  locale: "en" as const,
  body: "Saved-card and recurring charge consent."
};

describe("Drizzle saved-card disclosure reader", () => {
  it("returns only a sealed published disclosure to a card-setup path", () => {
    const published = publishSavedCardDisclosureDraft(createSavedCardDisclosureDraft(input));

    expect(mapPublishedSavedCardDisclosure({
      ...input,
      draftRevision: published.draftRevision,
      lifecycle: "published",
      canonicalPreimage: canonicalizeSavedCardDisclosure(published.disclosure),
      canonicalDigest: published.disclosure.canonicalDigest,
      createdAt: new Date(),
      publishedAt: new Date(),
      retiredAt: null
    } as never)).toEqual(published.disclosure);

    expect(() => mapPublishedSavedCardDisclosure({
      ...input,
      draftRevision: published.draftRevision,
      lifecycle: "published",
      canonicalPreimage: JSON.stringify({ wrong: "not authoritative" }),
      canonicalDigest: published.disclosure.canonicalDigest,
      createdAt: new Date(),
      publishedAt: new Date(),
      retiredAt: null
    } as never)).toThrow(SavedCardDisclosureReaderPersistenceError);
  });
});
