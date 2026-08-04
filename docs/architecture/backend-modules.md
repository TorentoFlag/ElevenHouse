# Доменные модули backend

Backend должен быть организован вокруг доменных модулей. На старте эти модули могут жить в одной Nest codebase/package, но границы должны быть явными.

## Nest.js module structure

В Nest.js backend apps доменные и технические модули должны быть оформлены как feature modules внутри `src/modules/<module-name>/`.

Пример для `public-api`:

```text
apps/public-api/src/
  app.module.ts
  main.ts
  config/
    runtime-config.ts
  modules/
    health/
      health.module.ts
      health.controller.ts
      health.service.ts
    identity/
      identity.module.ts
      identity-registration.controller.ts
      identity-registration.service.ts
      identity-registration.tokens.ts
```

Root `app.module.ts` должен импортировать feature modules:

```ts
@Module({
  imports: [
    ConfigModule.forRoot(...),
    HealthModule,
    IdentityModule
  ]
})
export class AppModule {}
```

Он не должен напрямую перечислять controllers и providers внутренних feature modules. Каждый `<module-name>.module.ts` отвечает за свои controllers, providers, tokens, adapters и module-local composition. Такой подход соответствует Nest feature module pattern и предотвращает разрастание root module в список всех controllers/services приложения.

Если используется NestJS CLI/resource generator, оставляй generated structure в этом же стиле. Если структура создаётся вручную, соблюдай тот же принцип: module + controllers + providers + tests внутри `src/modules/<module-name>/`.

## Реализованные backend apps и модули

`apps/public-api` сейчас содержит:

- `booking`
- `client-join`
- `client-consents`
- `client-profile`
- `database`
- `health`
- `identity`
- `orders`
- `payments`
- `redis`
- `security`

`client-join` создаёт direct-link join intent по public handle и связывает его
с client registration/login flow. `client-consents` владеет owner-scoped
grant/revoke/read surface для versioned chart-AI consent evidence; policy,
processor identity, canonical notice hash and immutable first revocation are
server-owned and persisted. `client-profile` отдаёт только связанные с
клиентом профили астрологов, cabinet overview и owner-scoped primary-compatible
multi birth profiles. Он также предоставляет authenticated client-only поиск
места рождения через общий Geoapify/Redis provider contour; этот поиск
географических данных не является поиском или discovery астрологов. Это
foundation client cabinet, не discovery API.
`booking`, `orders` and `payments` now provide the first direct-link command
contour for booking intent, order creation and checkout initiation. Full public
product/profile reads, slot-selection UI integration, materials, feed,
subscriptions, journal and client-visible calculation delivery remain separate
incomplete contours.

`apps/astrologer-api` сейчас содержит:

- `ai`
- `astro-calendar`
- `astrologer-profile`
- `availability`
- `bookings`
- `calculations`
- `calendar`
- `charts`
- `clock`
- `clients`
- `database`
- `dictionary`
- `dictionary-ai`
- `finance`
- `flows`
- `health`
- `human-design`
- `identity`
- `media`
- `matrix`
- `numerology`
- `platform-billing`
- `products`
- `redis`
- `security`
- `verification`

`apps/admin-api` сейчас содержит:

- `database`
- `finance-policies`
- `health`
- `identity`
- `security`

Это отдельная внутренняя API-поверхность с техническим `health` module и первым
finance-policy/risk/payout contour. `finance-policies` composes database,
admin-session auth guard, CSRF, finance policy, order, ledger and payout stores,
idempotent finance commands and durable audit writes. Broader user,
verification, moderation, payment-support and platform-settings workflows still
belong in future `admin-api` feature modules, not in `public-api` or
`astrologer-api`.

## Основные модули

- `Identity`: регистрация, login, auth methods, sessions.
- `Users/Roles`: account пользователя, roles, status, permissions.
- `AstrologerProfile`: публичные и приватные данные профиля астролога.
- `Verification`: заявка астролога на проверку личности и квалификации,
  загрузка приватных документов и read model текущего статуса доверия.
- `ClientProfile`: профиль клиента, ссылки на сохранённые birth data, preferences.
- `Products`: consultations, packages, subscriptions, recorded products, courses.
- `Availability`: schedule, slots, timezone-aware availability.
- `Booking`: booking intents, slot holds, confirmations, reschedules, cancellations.
- `Orders`: purchase lifecycle независимо от деталей payment provider.
- `Payments/Billing`: payment attempts, webhooks, refunds, provider adapters.
- `Wallet/Ledger`: баланс астролога, ledger entries, payouts, adjustments.
- `Flows`: Flows owns automation definitions, versions, runtime runs and approvals.
  It orchestrates module use cases through explicit ports/jobs and must not
  implement payment, booking, messaging delivery or chart calculation logic
  inside controllers or app-local scripts. The current deployable surface is
  `definition_only`: legacy runtime history remains readable and explicitly
  marked `legacy_preview`, while activation, simulation, enrollment, manual
  execution, run cancellation and approval decisions fail closed until the
  PostgreSQL durable `flow-graph.v2` interpreter is available.
- `Subscriptions`: recurring client subscriptions и platform plans для астрологов.
- `BirthData`: дата, время, место рождения и правила consented sharing.
- `Calculations`: owner-scoped current calculation result, participants, client
  links, interpretations, publication checksum and artifacts. The module stores
  one current result and does not maintain result-version history. It also owns
  the generic private calculation-PDF lifecycle: idempotent jobs, transactional
  outbox events, checksum validation, artifact/media references and delayed
  cleanup after recalculation or archival. Module adapters select the allowed
  render source; controllers do not enqueue BullMQ jobs directly.
- `Numerology`: typed preview/persist/recalculate orchestration and method
  registry. The active `pythagorean` engine owns Pythagorean RU formulas;
  controllers, frontend and generic calculation storage do not duplicate them.
  AI interpretation orchestration accepts only owned saved results, minimizes
  them to anonymous deterministic numeric context, delegates structured text
  generation to `Ai`, and persists an editable draft through the checksum-safe
  `Calculations` interpretation use case. AI never participates in arithmetic.
  Pythagorean individual and compatibility PDFs always render the complete
  deterministic current result in RU or EN. The current approved interpretation
  is included when present, but approval is not required to export; drafts and
  unsaved editor text never enter the document.
- `Matrix`: CRM-only typed preview/link/recalculate orchestration for the single
  `ladini_22` engine. Individual and compatibility base results are persisted
  through `Calculations`; current-age and annual forecast projections are
  derived read-only and excluded from saved checksums. Astrologer-private notes
  live behind a Matrix-owned persistence port, retain the result checksum they
  were written against, and derive stale state on read. The Matrix-owned RU/EN
  interpretation catalog is deterministic and revisioned; it performs no
  runtime AI or translation calls. Matrix PDF export requires the current saved
  report to be explicitly ready and renders that checksum-bound report through
  the same generic calculation-PDF contour.
- `HumanDesign`: typed individual preview, persistence and recalculation
  orchestration for the `human_design_classic` base engine. Preview is
  authenticated/read-only and rejects browser birth-data fields. Persist and
  recalculate are CSRF-protected state-changing routes that hydrate
  owner-scoped CRM client input, resolve birth/design longitudes through the
  private chart-engine provider boundary, delegate mechanics to
  `packages/domain/src/human-design`, store records via the shared
  `Calculations` module and keep linked CRM subject/partner identity stable.
  Individual, compatibility and read-only transit overlay mechanics are
  implemented through the same server/domain authority. Human Design AI
  interpretation follows the Numerology-style shared calculation
  interpretation contour: only owned saved results with the current checksum
  can generate editable drafts, optional transit context is server-resolved and
  checksum-bound, AI receives minimized deterministic Human Design context, and
  frontend/public responses expose no model or prompt metadata. Human Design
  PDF backend routes and frontend controls use the shared private
  calculation-PDF contour, current checksum and optional approved
  interpretation source locator; transit overlays are not exported as a
  standalone PDF.
- `Charts`: расчёты астрологических карт и generated chart artifacts.
- `Sessions`: lifecycle консультации, recordings, materials.
- `Messaging`: provider-neutral channel connections, external identities,
  threads, messages, delivery attempts, inbound dedupe, outbound idempotency
  and realtime event publication. `Clients` owns CRM relationships, manual
  client creation, birth data and private notes; Messaging owns conversation
  state and provider boundaries. Telegram Business / Secretary bot and Telegram
  MTProto Account are first-class connection modes. Instagram remains a future
  provider adapter shape. See
  `docs/decisions/0010-messaging-channel-architecture.md`.
- `Content`: posts, lead magnets, materials, broadcasts, content products.
- `Reviews`: review submission, moderation, display aggregates.
- `Moderation`: queues, decisions, reasons, escalation. Moderator decisions for
  verification applications belong to `admin-api`, not `astrologer-api`.
- `Notifications`: notification preferences, templates, delivery logs.
- `Analytics`: product и business metrics, event ingestion.
- `Referral`: astrologer и client invitation flows.
- `AuditLog`: audit trail для admin и sensitive actions.

## Пример межмодульного workflow

```text
Client starts booking
  -> Booking creates slot hold
  -> Orders creates order
  -> Payments creates payment attempt
  -> Provider redirects or confirms payment
  -> payment-worker receives webhook
  -> Payments marks payment succeeded idempotently
  -> Orders marks order paid
  -> Booking confirms booking
  -> Wallet records ledger entry
  -> Notifications enqueue confirmations
  -> Analytics records conversion event
```

Controllers должны только оркестрировать use cases. В них не должна жить бизнес-логика workflow.

### Messaging delivery and realtime

`astrologer-api` owns authenticated `/messaging/*` commands, provider webhook
ingestion and the SSE freshness endpoint. Its transactions persist Messaging
state and an outbox event together; controllers never call provider adapters
directly. Provider webhooks are CSRF-exempt only because their authenticity is
validated by the provider-specific webhook boundary.

`notification-worker` may relay and execute Messaging delivery jobs, but it
does not own conversations, CRM relationships or the source of truth. Queue
payloads contain only identifiers; the worker reloads authoritative connection
and message state before calling a provider adapter. Realtime is exposed through
an app-local `RealtimeGateway` abstraction, with SSE as the first transport and
WebSocket reserved for later approved bidirectional features.

Messaging logging must never include phone numbers, Telegram verification or
2FA codes, business-connection secrets, raw provider payloads, session strings,
credentials or message bodies.

### Chart Engine

`astrologer-api` owns chart request authorization, CSRF route metadata, CRM
birth-data hydration, calculation-ready validation and job creation.
`chart-worker` owns BullMQ delivery, durable attempts, leases, fencing, recovery
and result persistence. `apps/chart-engine` is a private Python/FastAPI runtime
that wraps Kerykeion, returns ElevenHouse canonical chart JSON and exposes
`/live` and `/ready` probes. Controllers do not enqueue BullMQ jobs directly;
API transactions write an outbox event and the relay publishes `{ jobId }`.

The Chart Engine observability contract is structured and data-minimized:

- `astrologer-api` emits one `chart_job_command_completed` record for every
  successful create/recalculate command. It contains method, duration and
  either `active_job` plus `jobId` or `reused_result` plus `calculationId`;
- `chart-worker` emits one terminal processing record with method, duration,
  durable attempt, retry state and the exact lease generation/expiry when a
  claim exists. Lease loss, unconfirmed heartbeat and completion/failure fence
  rejection are distinct outcomes;
- bounded queue telemetry reads four counts and at most one oldest waiting and
  delayed job. It emits depths and ages, never queue payloads;
- recovery emits only duration and `requeued`, `failed` and `rearmed` counts;
- every Python provider operation and readiness probe emits deterministic JSON
  with operation, duration, bounded result code and proven provider versions,
  backend and data revision on success.

These records must never contain birth snapshots, civil dates/times/timezones,
place text, coordinates, horary questions/categories, prompts, interpretation
text, chart payload/result, Redis/PostgreSQL credentials, exception messages or
stacks. Unexpected diagnostics are reduced to a fixed known error code. A
collection failure is observable as failure; it is never replaced by zero
depths or another synthesized success value.

`apps/workers` owns the `calculation.pdf` BullMQ queue and the outbox relay for
render/delete jobs. Queue payloads contain identifiers only. The worker reloads
the authoritative calculation/report source, rejects stale checksums, renders a
deterministic document, writes it to private object storage and marks the job
ready. A renderer registry keyed by calculation module and method is the
extension point for future methods such as a separate Vedic numerology engine;
adding a method does not branch Pythagorean formulas or duplicate queue/storage
infrastructure. Natal chart PDF export uses the same lifecycle and reloads the
current `module = chart`, `method_code = natal` calculation result before
rendering a deterministic vector wheel, chart tables, calculation settings and
owner-scoped dictionary interpretations by exact chart codes.

## Кандидаты на будущее выделение

Следующие модули нужно проектировать так, чтобы их можно было позже выделить без переписывания core business logic:

- `Charts`
- `Notifications`
- `Analytics`
- `Payments/Billing`

Выделение должно происходить тогда, когда это оправдано операционно, а не просто потому, что модуль существует.
