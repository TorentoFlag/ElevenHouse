import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("InboxPage", () => {
  it("mounts the production Inbox view through messaging queries and realtime invalidation", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('import { InboxPageView } from "./InboxPageView"');
    expect(source).toContain("listMessagingChannelConnectionsQueryOptions");
    expect(source).toContain("listMessagingThreadsQueryOptions");
    expect(source).toContain("getMessagingThreadQueryOptions");
    expect(source).toContain("sendMessagingMessageMutationOptions");
    expect(source).toContain("createMessagingRealtimeClient");
    expect(source).toContain("handleMessagingRealtimeEvent");
    expect(source).toContain("isTelegramBusinessGuideOpen");
    expect(source).toContain("hasActiveTelegramConnection");
    expect(source).toContain("wasTelegramActiveRef");
    expect(source).toContain("setIsTelegramBusinessGuideOpen(false)");
    expect(source).toContain("setTelegramBusinessStartGuide(result)");
    expect(source).toContain("startTelegramMtprotoConnectionMutationOptions");
    expect(source).toContain("deriveTelegramMtprotoWizardState(result)");
    expect(source).not.toContain('<h1 id="inbox-title">Сообщения</h1>');
    expect(source).not.toContain("window.prompt");
    expect(source).not.toContain("window.open");
  });
});
