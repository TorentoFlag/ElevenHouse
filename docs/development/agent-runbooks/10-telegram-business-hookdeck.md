# Runbook: Telegram Business Hookdeck Testing

This runbook is for local Telegram Business / Secretary bot webhook testing.
It uses Hookdeck as the stable webhook gateway for development and forwards
events to the local `astrologer-api` webhook path.

## Preconditions

- Hookdeck CLI is installed: `brew install hookdeck`.
- Local `astrologer-api` is already running on `ASTROLOGER_API_PORT`, default
  `3002`.
- `.env` contains:
  - `NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN`
  - `ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET`

Do not print Telegram tokens, webhook secrets, raw provider payloads or message
bodies in logs or reports.

## Start Hookdeck

From the repository root:

```bash
pnpm telegram:webhook:listen
```

The command forwards Hookdeck source events to:

```text
http://localhost:3002/messaging/webhooks/telegram/bot
```

Hookdeck prints the public source URL. Save that URL in `.env` as:

```bash
TELEGRAM_BUSINESS_WEBHOOK_PUBLIC_URL=https://replace-with-hookdeck-source-url
```

## Configure Telegram

Use the Hookdeck source URL as the public base URL:

```bash
pnpm telegram:webhook:set
```

Or pass it explicitly:

```bash
pnpm telegram:webhook:set https://replace-with-hookdeck-source-url
```

Use `--drop-pending` only when intentionally discarding Telegram's pending
updates during local testing:

```bash
pnpm telegram:webhook:set https://replace-with-hookdeck-source-url --drop-pending
```

## Inspect Telegram State

```bash
pnpm telegram:webhook:info
```

The helper redacts the Telegram Bot API token in command output. Hookdeck event
inspection and replay should be used for webhook retries and delivery evidence.

## Expected Webhook Path

Telegram must call the Hookdeck source URL exactly:

```text
https://<hookdeck-source>
```

Hookdeck then forwards that request to:

```text
http://localhost:3002/messaging/webhooks/telegram/bot
```

`astrologer-api` validates `x-telegram-bot-api-secret-token`, parses
`business_connection` and `business_message` updates, persists durable Messaging
state and publishes realtime freshness through SSE.
