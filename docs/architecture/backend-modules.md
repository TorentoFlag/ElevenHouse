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

- `health`
- `identity`
- `database`
- `redis`
- `security`

`apps/astrologer-api` сейчас содержит:

- `ai`
- `astrologer-profile`
- `calculations`
- `clock`
- `clients`
- `database`
- `dictionary`
- `dictionary-ai`
- `health`
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

- `health`

Это только минимальная Nest-заготовка отдельной внутренней API-поверхности.
Admin/moderator/super_admin workflows не должны добавляться в `public-api` или
`astrologer-api`; они должны добавляться в `admin-api` через такие же
feature-module boundaries, explicit auth/permissions и audit logging.

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
- `Subscriptions`: recurring client subscriptions и platform plans для астрологов.
- `BirthData`: дата, время, место рождения и правила consented sharing.
- `Calculations`: owner-scoped current calculation result, participants, client
  links, interpretations, publication checksum and artifacts. The module stores
  one current result and does not maintain result-version history.
- `Numerology`: typed preview/persist/recalculate orchestration and method
  registry. The active `pythagorean` engine owns Pythagorean RU formulas;
  controllers, frontend and generic calculation storage do not duplicate them.
- `Matrix`: CRM-only typed preview/link/recalculate orchestration for the single
  `ladini_22` engine. Individual and compatibility base results are persisted
  through `Calculations`; current-age and annual forecast projections are
  derived read-only and excluded from saved checksums.
- `Charts`: расчёты астрологических карт и generated chart artifacts.
- `Sessions`: lifecycle консультации, recordings, materials.
- `Messaging`: threads и messages там, где используется platform messaging.
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

## Кандидаты на будущее выделение

Следующие модули нужно проектировать так, чтобы их можно было позже выделить без переписывания core business logic:

- `Charts`
- `Notifications`
- `Analytics`
- `Payments/Billing`

Выделение должно происходить тогда, когда это оправдано операционно, а не просто потому, что модуль существует.
