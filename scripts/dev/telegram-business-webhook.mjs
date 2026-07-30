#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const telegramBusinessWebhookPath = "/messaging/webhooks/telegram/bot";

export function createHookdeckListenCommand({
  forward = "http://localhost:3002",
  source = "telegram-business",
  output = "compact"
} = {}) {
  return {
    command: "hookdeck",
    args: ["listen", forward, source, "--path", telegramBusinessWebhookPath, "--output", output]
  };
}

export function createTelegramWebhookUrl(publicWebhookBaseUrl) {
  return normalizePublicWebhookUrl(publicWebhookBaseUrl);
}

export function createTelegramSetWebhookRequest({
  botApiBaseUrl = "https://api.telegram.org",
  botToken,
  publicWebhookUrl,
  secretToken,
  dropPendingUpdates = false
}) {
  assertNonEmpty(botToken, "NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN");
  assertNonEmpty(secretToken, "ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET");
  return {
    url: createTelegramBotApiUrl({ botApiBaseUrl, botToken, method: "setWebhook" }),
    body: {
      url: createTelegramWebhookUrl(publicWebhookUrl),
      secret_token: secretToken,
      allowed_updates: [
        "message",
        "business_connection",
        "business_message",
        "edited_business_message",
        "deleted_business_messages"
      ],
      drop_pending_updates: dropPendingUpdates
    }
  };
}

export function createTelegramGetWebhookInfoRequest({
  botApiBaseUrl = "https://api.telegram.org",
  botToken
}) {
  assertNonEmpty(botToken, "NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN");
  return {
    url: createTelegramBotApiUrl({ botApiBaseUrl, botToken, method: "getWebhookInfo" })
  };
}

export function redactTelegramBotApiUrl(value) {
  return value.replace(/\/bot[^/]+/, "/bot[redacted]");
}

export function redactHookdeckGuestSignupUrl(value) {
  return value.replace(
    /https:\/\/api\.hookdeck\.com\/signin\/guest\?token=[^\s)]+/g,
    "https://api.hookdeck.com/signin/guest?token=[redacted]"
  );
}

function createTelegramBotApiUrl({ botApiBaseUrl, botToken, method }) {
  const baseUrl = stripTrailingSlashes(botApiBaseUrl || "https://api.telegram.org");
  return `${baseUrl}/bot${botToken}/${method}`;
}

function normalizePublicWebhookUrl(value) {
  assertNonEmpty(value, "TELEGRAM_BUSINESS_WEBHOOK_PUBLIC_URL");
  const url = new URL(value.trim());
  if (url.protocol !== "https:") {
    throw new Error("TELEGRAM_BUSINESS_WEBHOOK_PUBLIC_URL must use https");
  }
  return stripTrailingSlashes(url.toString());
}

function stripTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}

function assertNonEmpty(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
}

function loadEnvFile(filePath = ".env") {
  if (!existsSync(filePath)) return {};
  const result = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    result[key] = unquoteEnvValue(rawValue);
  }
  return result;
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function createLocalEnv() {
  return { ...loadEnvFile(), ...process.env };
}

async function main(argv = process.argv.slice(2), env = createLocalEnv()) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return 0;
  }

  if (command === "listen") {
    const listenCommand = createHookdeckListenCommand({
      forward:
        env.HOOKDECK_TELEGRAM_FORWARD ?? `http://localhost:${env.ASTROLOGER_API_PORT || "3002"}`,
      source: env.HOOKDECK_TELEGRAM_SOURCE ?? "telegram-business",
      output: env.HOOKDECK_TELEGRAM_OUTPUT ?? "compact"
    });
    return runChild(listenCommand);
  }

  if (command === "set-webhook") {
    const publicWebhookUrl =
      rest.find((argument) => !argument.startsWith("--")) ??
      env.TELEGRAM_BUSINESS_WEBHOOK_PUBLIC_URL;
    const dropPendingUpdates = rest.includes("--drop-pending");
    const request = createTelegramSetWebhookRequest({
      botApiBaseUrl: env.NOTIFICATION_WORKER_TELEGRAM_BOT_API_BASE_URL,
      botToken: env.NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN,
      publicWebhookUrl,
      secretToken: env.ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET,
      dropPendingUpdates
    });
    const response = await postTelegramJson(request);
    console.log(
      JSON.stringify(
        {
          ok: response.ok,
          apiUrl: redactTelegramBotApiUrl(request.url),
          webhookUrl: request.body.url,
          allowedUpdates: request.body.allowed_updates,
          dropPendingUpdates
        },
        null,
        2
      )
    );
    return response.ok ? 0 : 1;
  }

  if (command === "get-webhook-info") {
    const request = createTelegramGetWebhookInfoRequest({
      botApiBaseUrl: env.NOTIFICATION_WORKER_TELEGRAM_BOT_API_BASE_URL,
      botToken: env.NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN
    });
    const response = await fetch(request.url);
    const body = await response.json();
    console.log(JSON.stringify({ apiUrl: redactTelegramBotApiUrl(request.url), body }, null, 2));
    return response.ok && body.ok ? 0 : 1;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function postTelegramJson(request) {
  const response = await fetch(request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request.body)
  });
  const body = await response.json();
  return { ok: response.ok && body.ok === true, body };
}

function runChild({ command, args }) {
  const child = spawn(command, args, { stdio: ["inherit", "pipe", "pipe"], env: process.env });
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(redactHookdeckGuestSignupUrl(chunk.toString()));
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(redactHookdeckGuestSignupUrl(chunk.toString()));
  });
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      resolve(signal ? 1 : (code ?? 1));
    });
  });
}

function printUsage() {
  console.log(`Usage:
  pnpm telegram:webhook:listen
  pnpm telegram:webhook:set <https://hookdeck-source-url>
  pnpm telegram:webhook:info

Environment:
  NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN
  ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET
  TELEGRAM_BUSINESS_WEBHOOK_PUBLIC_URL
  HOOKDECK_TELEGRAM_FORWARD=http://localhost:3002
  HOOKDECK_TELEGRAM_SOURCE=telegram-business
  HOOKDECK_TELEGRAM_OUTPUT=compact`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
