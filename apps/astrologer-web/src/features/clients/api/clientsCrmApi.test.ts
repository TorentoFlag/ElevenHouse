import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn()
}));

vi.mock("../../../Application", () => ({ application: { http } }));

import {
  getAstrologerClientCrmDetail,
  getAstrologerClientCrmFirstActivityPage,
  listAstrologerClientCrm,
  updateAstrologerClientCrmPrivateProfile
} from "./clientsCrmApi";

const clientUserId = "11111111-1111-4111-8111-111111111111";

describe("clientsCrmApi", () => {
  beforeEach(() => {
    http.get.mockReset();
    http.put.mockReset();
  });

  it("requests the normalized CRM list query through the authenticated application HTTP client", async () => {
    http.get.mockResolvedValue({ items: [], nextCursor: null });

    await listAstrologerClientCrm({
      query: "  Ada   Lovelace ",
      cursor: "cursor-1",
      limit: 25,
      lifecycle: "active",
      source: "booking"
    });

    expect(http.get).toHaveBeenCalledWith(
      "/clients/crm?query=Ada+Lovelace&limit=25&sort=last_linked_at_desc&cursor=cursor-1&lifecycle=active&source=booking"
    );
  });

  it("reads CRM detail and the first activity page without activity pagination parameters", async () => {
    http.get.mockResolvedValueOnce({ client: crmClient }).mockResolvedValueOnce({
      items: [],
      nextCursor: null
    });

    await getAstrologerClientCrmDetail(clientUserId);
    await getAstrologerClientCrmFirstActivityPage(clientUserId);

    expect(http.get.mock.calls).toEqual([
      [`/clients/crm/${clientUserId}`],
      [`/clients/crm/${clientUserId}/activity`]
    ]);
  });

  it("updates private CRM attributes with CSRF and normalized request body", async () => {
    http.put.mockResolvedValue({
      privateCrm: {
        note: "Needs birth time confirmation",
        tags: ["Natal", "Follow-up"],
        updatedAt: "2026-08-20T10:00:00.000Z"
      }
    });

    await updateAstrologerClientCrmPrivateProfile(clientUserId, {
      note: "  Needs   birth time confirmation  ",
      tags: [" Natal ", "natal", "", "Follow-up"]
    });

    expect(http.put).toHaveBeenCalledWith(
      `/clients/crm/${clientUserId}/private-profile`,
      {
        note: "Needs birth time confirmation",
        tags: ["Natal", "Follow-up"]
      },
      { csrf: true }
    );
  });
});

const crmClient = {
  clientUserId,
  displayName: "Ada Lovelace",
  relationship: {
    id: "22222222-2222-4222-8222-222222222222",
    status: "active",
    source: "booking",
    firstLinkedAt: "2026-08-20T10:00:00.000Z",
    lastLinkedAt: "2026-08-20T10:00:00.000Z"
  },
  lifecycle: {
    status: "active",
    mode: "automatic",
    revision: 1,
    lastActivityAt: "2026-08-20T10:00:00.000Z"
  },
  birthData: null,
  relatedBirthProfiles: [],
  readiness: { birthData: "missing", relatedProfiles: "ready" },
  privateCrm: {
    note: null,
    tags: [],
    updatedAt: "2026-08-20T10:00:00.000Z"
  },
  activity: { items: [], nextCursor: null }
} as const;
