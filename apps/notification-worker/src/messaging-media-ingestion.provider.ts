import type { TelegramBusinessMediaProvider as TelegramBusinessMediaProviderPort } from "./messaging-media-ingestion.types";

export type TelegramBusinessMediaProviderOptions = {
  readonly botToken: string;
  readonly botApiBaseUrl: string;
};

type TelegramBusinessMediaFetch = (
  url: string,
  init: { readonly method: "POST"; readonly headers: Record<string, string>; readonly body: string } | { readonly method: "GET" }
) => Promise<Response>;

export class TelegramBusinessMediaProvider implements TelegramBusinessMediaProviderPort {
  constructor(
    private readonly options: TelegramBusinessMediaProviderOptions,
    private readonly fetchFn: TelegramBusinessMediaFetch = fetch
  ) {}

  async getFile(input: {
    readonly fileId: string;
  }): Promise<{ readonly filePath: string; readonly fileSize: number | null }> {
    const response = await this.fetchFn(this.botMethodUrl("getFile"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: input.fileId })
    });
    const body = await readTelegramJson(response);
    if (!response.ok || !isTelegramFileResponse(body)) {
      throw new Error(`Telegram getFile failed with status ${response.status}`);
    }

    return {
      filePath: body.result.file_path,
      fileSize: typeof body.result.file_size === "number" ? body.result.file_size : null
    };
  }

  async downloadFile(input: {
    readonly filePath: string;
    readonly maxBytes: number;
  }): Promise<{ readonly bytes: Uint8Array; readonly mimeType: string | null }> {
    if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) {
      throw new Error("Telegram download byte limit is invalid");
    }
    const response = await this.fetchFn(this.fileUrl(input.filePath), { method: "GET" });
    if (!response.ok) {
      throw new Error(`Telegram file download failed with status ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isSafeInteger(contentLength) && contentLength > input.maxBytes) {
      throw new Error("Telegram file exceeds the configured download limit");
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > input.maxBytes) {
      throw new Error("Telegram file exceeds the configured download limit");
    }
    return {
      bytes,
      mimeType: normalizeMimeType(response.headers.get("content-type"))
    };
  }

  private botMethodUrl(method: string): string {
    return `${this.options.botApiBaseUrl.replace(/\/+$/, "")}/bot${this.options.botToken}/${method}`;
  }

  private fileUrl(filePath: string): string {
    return `${this.options.botApiBaseUrl.replace(/\/+$/, "")}/file/bot${this.options.botToken}/${encodeTelegramFilePath(filePath)}`;
  }
}

async function readTelegramJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isTelegramFileResponse(value: unknown): value is {
  readonly ok: true;
  readonly result: { readonly file_path: string; readonly file_size?: number };
} {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.result)) return false;
  return typeof value.result.file_path === "string" && value.result.file_path.trim().length > 0;
}

function encodeTelegramFilePath(filePath: string): string {
  return filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeMimeType(value: string | null): string | null {
  if (!value) return null;
  const [mimeType] = value.split(";");
  const normalized = mimeType?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
