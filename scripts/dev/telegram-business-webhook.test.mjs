import assert from "node:assert/strict";
import test from "node:test";

import {
  createHookdeckListenCommand,
  createTelegramGetWebhookInfoRequest,
  createTelegramSetWebhookRequest,
  createTelegramWebhookUrl,
  redactHookdeckGuestSignupUrl,
  redactTelegramBotApiUrl
} from "./telegram-business-webhook.mjs";

test("creates the Hookdeck listen command for Telegram Business webhooks", () => {
  assert.deepEqual(
    createHookdeckListenCommand({
      forward: "http://localhost:3002",
      source: "telegram-business",
      output: "compact"
    }),
    {
      command: "hookdeck",
      args: [
        "listen",
        "http://localhost:3002",
        "telegram-business",
        "--path",
        "/messaging/webhooks/telegram/bot",
        "--output",
        "compact"
      ]
    }
  );
});

test("builds Telegram Bot API webhook requests without exposing secrets in redacted output", () => {
  const webhookUrl = createTelegramWebhookUrl("https://elevenhouse.hookdeck.dev/");
  assert.equal(webhookUrl, "https://elevenhouse.hookdeck.dev");

  const setWebhook = createTelegramSetWebhookRequest({
    botToken: "123456:secret-token",
    publicWebhookUrl: "https://elevenhouse.hookdeck.dev",
    secretToken: "webhook-secret"
  });
  assert.equal(setWebhook.url, "https://api.telegram.org/bot123456:secret-token/setWebhook");
  assert.deepEqual(setWebhook.body, {
    url: webhookUrl,
    secret_token: "webhook-secret",
    allowed_updates: ["business_connection", "business_message"],
    drop_pending_updates: false
  });
  assert.equal(
    redactTelegramBotApiUrl(setWebhook.url),
    "https://api.telegram.org/bot[redacted]/setWebhook"
  );

  const info = createTelegramGetWebhookInfoRequest({
    botToken: "123456:secret-token"
  });
  assert.equal(
    redactTelegramBotApiUrl(info.url),
    "https://api.telegram.org/bot[redacted]/getWebhookInfo"
  );
});

test("redacts Hookdeck guest signup tokens from CLI output", () => {
  assert.equal(
    redactHookdeckGuestSignupUrl(
      "Sign up: https://api.hookdeck.com/signin/guest?token=guest-secret-token"
    ),
    "Sign up: https://api.hookdeck.com/signin/guest?token=[redacted]"
  );
});
