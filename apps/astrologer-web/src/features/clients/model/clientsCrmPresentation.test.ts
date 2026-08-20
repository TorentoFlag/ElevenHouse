import { describe, expect, it } from "vitest";
import {
  formatClientCrmActivityItem,
  formatClientCrmDate,
  formatClientCrmDateTime,
  formatClientCrmDisplayName,
  formatClientCrmLifecycle,
  formatClientCrmReadiness,
  formatClientCrmSource,
  mapClientCrmLifecycleToPresentation,
  mapClientCrmReadinessToPresentation,
  mapClientCrmSourceToPresentation
} from "./clientsCrmPresentation";

describe("clientsCrmPresentation", () => {
  it("maps only validated server readiness values to localized presentation state", () => {
    expect(
      mapClientCrmReadinessToPresentation(
        { birthData: "missing", relatedProfiles: "ready" },
        "ru"
      )
    ).toEqual({
      birthData: { label: "Нет данных", tone: "neutral" },
      relatedProfiles: { label: "Готово", tone: "positive" }
    });

    expect(formatClientCrmReadiness("birthData", "ready", "en")).toEqual({
      label: "Ready",
      tone: "positive"
    });
  });

  it("preserves server lifecycle and relationship source while localizing labels", () => {
    expect(mapClientCrmLifecycleToPresentation("waiting_for_client", "ru")).toEqual({
      label: "Ждет клиента",
      tone: "warning"
    });
    expect(mapClientCrmSourceToPresentation("lead_magnet", "en")).toEqual({
      label: "Lead magnet",
      tone: "neutral"
    });
    expect(formatClientCrmLifecycle("in_service", "en").label).toBe("In service");
    expect(formatClientCrmSource("booking", "ru").label).toBe("Запись");
  });

  it("formats safe activity labels without message-body surface", () => {
    expect(
      formatClientCrmActivityItem(
        {
          id: "activity-1",
          occurredAt: "2026-08-20T10:30:00.000Z",
          kind: "birth_data_updated",
          metadata: { revision: 2 }
        },
        "ru"
      )
    ).toEqual({
      title: "Данные рождения обновлены",
      detail: "Revision 2",
      tone: "positive"
    });

    expect(
      formatClientCrmActivityItem(
        {
          id: "activity-2",
          occurredAt: "2026-08-20T10:30:00.000Z",
          kind: "relationship_created",
          metadata: { source: "direct_link" }
        },
        "en"
      ).title
    ).toBe("Relationship created");
  });

  it("formats nullable display names without leaking relationship ownership assumptions", () => {
    expect(formatClientCrmDisplayName("11111111-1111-4111-8111-111111111111", null, "en")).toBe(
      "Client 11111111"
    );
    expect(formatClientCrmDisplayName("11111111-1111-4111-8111-111111111111", "Ada", "ru")).toBe(
      "Ada"
    );
  });

  it("formats CRM instants in the provided user or service timezone", () => {
    expect(formatClientCrmDate("2026-08-20T21:30:00.000Z", "ru", "Europe/Moscow")).toBe(
      "21 авг. 2026 г."
    );
    expect(
      formatClientCrmDateTime("2026-08-20T21:30:00.000Z", "en", "America/New_York")
    ).toContain("Aug 20, 2026");
  });
});
