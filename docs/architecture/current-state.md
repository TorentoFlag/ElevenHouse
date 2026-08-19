# Generated Current Implementation State

> Generated from app/package/module directories and worker runtime config by `node scripts/agent-docs/generate-current-state.mjs`. Do not edit manually.

Use this for current structural facts. Ownership, policy, contracts and readiness remain in the linked canonical docs.

## Deployable apps

- `admin-api`
- `admin-web`
- `astrologer-api`
- `astrologer-web`
- `chart-engine`
- `chart-worker`
- `client-web`
- `landing`
- `notification-worker`
- `payment-worker`
- `public-api`
- `workers`

## Shared packages

- `ai`
- `auth`
- `birth-place-search`
- `chart-engine-client`
- `config`
- `contracts`
- `db`
- `design-system`
- `domain`
- `finance-infrastructure`
- `i18n`
- `numerology-presentation`
- `observability`
- `session-infrastructure`
- `session-web-client`
- `testing`
- `validation`

## API modules

| App | Module |
| --- | --- |
| public-api | `astro-diary` |
| public-api | `booking` |
| public-api | `client-commerce` |
| public-api | `client-consents` |
| public-api | `client-join` |
| public-api | `client-profile` |
| public-api | `database` |
| public-api | `health` |
| public-api | `identity` |
| public-api | `orders` |
| public-api | `payments` |
| public-api | `redis` |
| public-api | `refund-candidates` |
| public-api | `security` |
| public-api | `sessions` |
| astrologer-api | `ai` |
| astrologer-api | `astro-calendar` |
| astrologer-api | `astro-diary` |
| astrologer-api | `astrologer-profile` |
| astrologer-api | `availability` |
| astrologer-api | `bookings` |
| astrologer-api | `calculations` |
| astrologer-api | `calendar` |
| astrologer-api | `charts` |
| astrologer-api | `clients` |
| astrologer-api | `clock` |
| astrologer-api | `database` |
| astrologer-api | `dictionary` |
| astrologer-api | `dictionary-ai` |
| astrologer-api | `finance` |
| astrologer-api | `flows` |
| astrologer-api | `health` |
| astrologer-api | `human-design` |
| astrologer-api | `identity` |
| astrologer-api | `matrix` |
| astrologer-api | `media` |
| astrologer-api | `messaging` |
| astrologer-api | `numerology` |
| astrologer-api | `platform-billing` |
| astrologer-api | `platform-entitlements` |
| astrologer-api | `platform-tariffs` |
| astrologer-api | `products` |
| astrologer-api | `redis` |
| astrologer-api | `security` |
| astrologer-api | `sessions` |
| astrologer-api | `verification` |
| admin-api | `chargeback-resolutions` |
| admin-api | `database` |
| admin-api | `finance-authorizations` |
| admin-api | `finance-policies` |
| admin-api | `fiscal-profiles` |
| admin-api | `flow-runtime-control` |
| admin-api | `health` |
| admin-api | `identity` |
| admin-api | `online-wallet-refunds` |
| admin-api | `payout-evidence` |
| admin-api | `platform-tariffs` |
| admin-api | `refund-candidates` |
| admin-api | `saved-card-disclosures` |
| admin-api | `security` |

## Worker endpoint defaults

| Process | Environment key | Port |
| --- | --- | --- |
| workers | `WORKERS_HEALTH_PORT` | 3010 |
| payment-worker | `PAYMENT_WORKER_HEALTH_PORT` | 3011 |
| payment-worker | `PAYMENT_WORKER_WEBHOOK_PORT` | 3013 |
| chart-worker | `CHART_WORKER_HEALTH_PORT` | 3012 |
| notification-worker | `NOTIFICATION_WORKER_HEALTH_PORT` | 3013 |

`PAYMENT_WORKER_WEBHOOK_PORT` and `NOTIFICATION_WORKER_HEALTH_PORT` both default to `3013`; set an explicit non-conflicting local override before starting both processes.
