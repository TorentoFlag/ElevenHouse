import { describe, expect, it } from "vitest";
import { createSessionPageModel } from "./sessionPageModel.js";

describe("createSessionPageModel", () => {
  it("keeps recording out of the first release and exposes join timing", () => {
    expect(
      createSessionPageModel({
        locale: "ru",
        state: "scheduled",
        joinPolicy: { kind: "too_early", joinableAt: "2026-08-13T12:50:00.000Z" }
      })
    ).toMatchObject({
      recordingLabel: "Без записи",
      canJoin: false,
      joinLabel: "Войти в сессию",
      joinableAt: "2026-08-13T12:50:00.000Z"
    });
  });

  it("allows an active reconnect and local leave", () => {
    expect(
      createSessionPageModel({
        locale: "en",
        state: "active",
        joinPolicy: { kind: "allowed", joinableAt: null }
      })
    ).toMatchObject({ recordingLabel: "Not recorded", canJoin: true, leaveLabel: "Leave" });
  });
});
