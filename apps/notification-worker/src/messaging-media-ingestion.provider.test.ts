import { describe, expect, it, vi } from "vitest";
import { TelegramBusinessMediaProvider } from "./messaging-media-ingestion.provider";

describe("TelegramBusinessMediaProvider", () => {
  it("loads Telegram file metadata without exposing token-derived URLs", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          result: { file_path: "voice/file_1.oga", file_size: 1234 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = new TelegramBusinessMediaProvider(
      { botToken: "secret-token", botApiBaseUrl: "https://telegram.test" },
      fetchFn
    );

    await expect(provider.getFile({ fileId: "voice-file-id" })).resolves.toEqual({
      filePath: "voice/file_1.oga",
      fileSize: 1234
    });
    expect(fetchFn).toHaveBeenCalledWith("https://telegram.test/botsecret-token/getFile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: "voice-file-id" })
    });
  });

  it("downloads files with a hard byte cap", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(new Uint8Array([79, 103, 103, 83]), {
        status: 200,
        headers: { "content-type": "audio/ogg" }
      })
    );
    const provider = new TelegramBusinessMediaProvider(
      { botToken: "secret-token", botApiBaseUrl: "https://telegram.test" },
      fetchFn
    );

    await expect(
      provider.downloadFile({ filePath: "voice/file_1.oga", maxBytes: 20 })
    ).resolves.toEqual({
      bytes: new Uint8Array([79, 103, 103, 83]),
      mimeType: "audio/ogg"
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://telegram.test/file/botsecret-token/voice/file_1.oga",
      { method: "GET" }
    );
  });

  it("rejects downloads that exceed the byte cap", async () => {
    const fetchFn = vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }));
    const provider = new TelegramBusinessMediaProvider(
      { botToken: "secret-token", botApiBaseUrl: "https://telegram.test" },
      fetchFn
    );

    await expect(
      provider.downloadFile({ filePath: "voice/file_1.oga", maxBytes: 3 })
    ).rejects.toThrow("Telegram file exceeds the configured download limit");
  });
});
