# Roadmap разработки ElevenHouse

Эта roadmap описывает техническую очередность разработки полной версии ElevenHouse. Она не определяет бизнес-стратегию и не меняет функциональное ТЗ. Очередность нужна только для управления зависимостями между большими частями системы.

## Этап 1: Базовый платформенный фундамент

Цель: заложить архитектуру, модель аккаунтов, роли, инфраструктуру приложений и транзакционный контур, на котором держатся остальные модули.

Включает:

- Monorepo, `apps/`, `packages/`, shared configs.
- Account registration, authorization, role model.
- `client-web`, `astrologer-web`, `admin-web` как отдельные приложения.
- `public-api`, `astrologer-api`, workers.
- Базовые доменные модули: Users/Roles, Identity, AstrologerProfile, ClientProfile.
- PostgreSQL, Redis, queue infrastructure.
- AuditLog для внутренних и чувствительных действий.
- Базовые i18n-механики для русского и английского.

## Этап 2: Профиль астролога, продукты, расписание, booking

Цель: реализовать основу взаимодействия астролога и клиента через прямую ссылку астролога.

Включает:

- Онбординг астролога.
- Публичный профиль астролога и direct link.
- Управление продуктами и услугами.
- Availability, расписание, слоты, timezone-aware отображение.
- Booking intents, slot holds, confirmations, reschedules, cancellations.
- Клиентский booking flow без публичного каталога и discovery.
- Базовый кабинет астролога для записей, продуктов и клиентов.

## Этап 3: Заказы, платежи, кошелёк, уведомления

Цель: реализовать полный финансово-операционный контур вокруг покупок, оплат, выплат и уведомлений.

Включает:

- Orders lifecycle.
- Payments/Billing, payment attempts, webhooks, refunds.
- Payment provider adapter.
- Wallet/Ledger, комиссии, корректировки, payout visibility.
- `payment-worker` для webhook handling, reconciliation, refunds, payout jobs.
- `notification-worker` для email/SMS/Telegram/push, reminders, retries, delivery logs.
- Явные state transitions для booking/order/payment.
- Idempotency для платежей, jobs и критичных side effects.

## Этап 4: Клиентский кабинет, сессии, материалы, отзывы

Цель: закрыть post-payment и recurring клиентские сценарии.

Включает:

- Кабинет клиента.
- История заказов, записей и материалов.
- Session lifecycle.
- Recordings/files/material delivery.
- Client data sharing controls.
- Reviews и moderation flow.
- No-show, cancel, reschedule policies.
- Базовые support/admin actions через domain use cases.

## Этап 5: Астрологический контур

Цель: реализовать предметную ценность ElevenHouse как специализированной платформы для астрологов.

Включает:

- BirthData management.
- Один birth profile на клиента с CAS, audit history и редактированием клиентом
  или связанным астрологом.
- Booking eligibility и Flow readiness: при отсутствии данных создаётся обычный
  запрос данных или задача, затем выполняется повторная проверка readiness.
- Chart calculations.
- `chart-worker` для тяжёлых расчётов.
- Настройки школ/подходов, systems, orbs и других параметров расчётов.
- AI brief или consultation prep support, если это подтверждено продуктовым scope.
- Lead magnets на основе birth data.
- Astrological triggers и reminders.

Реализованный foundation внутри этапа:

- [x] Один канонический Pythagorean engine для individual, personal periods и
      compatibility без frontend arithmetic и без истории версий результата.
- [x] Один канонический `ladini_22` Matrix engine для individual и
      compatibility с private notes/report workflow.
- [x] Общий private calculation-PDF contour для Matrix и Numerology: checksum
      guard, transactional outbox, BullMQ worker, RU/EN renderer, presigned
      download и cleanup после перерасчёта. Полный production rollout всё ещё
      требует deployment с актуальными API/worker images и operational smoke test.
- [x] Chart Engine natal foundation: private Python/FastAPI chart-engine,
      `chart-worker`, CRM-backed birth-data readiness, canonical
      `chart-result.v1`, astrologer API jobs/results/recalculation routes,
      `/chart-engine` natal UI, Dictionary-backed interpretations and
      checksum-safe private chart PDF export.
- [x] Chart Engine transits first slice: single-moment dual-wheel transit
      calculations for owner-scoped CRM clients, canonical transit result
      payload, worker/provider integration, `/chart-engine` transit mode and
      real browser reload proof. Transit PDF/export and range AstroCalendar
      remain separate future contours.
- [x] Chart Engine synastry first slice: two owner-scoped CRM clients, canonical
      relationship result, private primary/partner input snapshots, worker and
      provider integration, `/chart-engine` partner selector, dual-wheel
      rendering, aspects-between tables and Dictionary-backed `synastry.*`
      interpretation lookup with honest missing-entry creation affordances.
      Synastry PDF/export, public sharing and AI relationship text remain
      separate future contours.
- [x] Chart Engine solar return first slice: owner-scoped CRM client, explicit
      target year, natal location/timezone, canonical `solar_return` result
      with private input snapshot, Kerykeion provider/worker/API integration,
      `/chart-engine` `Соляр` mode, dual natal + solar-return wheel, solar
      point/aspect tables and Dictionary-backed `solar_return.*` missing-entry
      creation affordances. Solar PDF/export, relocated return, public sharing
      and AI solar text remain separate future contours.
- [x] Chart Engine composite first slice: two owner-scoped CRM clients,
      canonical single-wheel relationship result, private primary/partner input
      snapshots, Kerykeion `CompositeSubjectFactory` provider path, worker/API
      integration, `/chart-engine` `Композит` mode, partner selector,
      single-wheel rendering and Dictionary-backed `composite.*` anchors with
      authenticated browser calculate/reload evidence. Composite PDF/export,
      public sharing and AI relationship text remain separate future contours.
- [x] Chart Engine child chart first slice: owner-scoped CRM client,
      natal-backed calculation result, `/chart-engine` `Детская` view mode,
      soft parent-facing copy, child-specific `child.*` Dictionary anchors,
      honest missing-entry creation affordances and authenticated browser
      calculate/reload evidence. Child-chart PDF/export, AI child text and
      client delivery remain separate future contours.
- [x] Chart Engine progressions first slice: owner-scoped CRM client,
      explicit progression date, canonical secondary-progression result,
      worker/provider integration, `/chart-engine` `Прогрессии` controls,
      rendering and Dictionary-backed `progression.*` anchors plus
      authenticated browser evidence for mode availability and reload.
      Progression PDF/export, public sharing and AI progression text remain
      separate future contours.
- [x] Chart Engine horary first slice: owner-scoped CRM client context,
      explicit question/category/date/time/timezone/place input, private
      question snapshot, canonical single-wheel `horary` result,
      `POST /charts/horary/jobs`, worker/provider integration,
      `/chart-engine` `Хорар` mode, RU state copy, disabled PDF and
      Dictionary-backed `horary.*` anchors with honest missing-entry creation
      affordances. Horary PDF/export, automated judgement/verdict and AI
      horary answer remain separate future contours.
- [x] Chart Engine astrocartography first slice: owner-scoped CRM client,
      canonical `astrocartography` result with 10 planets x 4 angular lines,
      worker/provider integration over Swiss Ephemeris primitives,
      `/chart-engine` `Астрокарта` mode, map visualization, RU state copy,
      disabled PDF and Dictionary-backed `astrocartography.<point>.<angle>`
      anchors with honest missing-entry creation affordances. Relocation
      charts, city scoring/crossings, public sharing, PDF/export and AI text
      remain separate future contours.
- [x] Human Design individual v1: owner-scoped CRM client input only, exact
      chart-engine personality/design longitude resolution, deterministic
      `human_design_classic` domain mechanics, generic calculation persistence,
      linked saved-result reopen, recalculation, approved fixture comparison
      coverage and authenticated desktop/mobile browser evidence for
      `/human-design`.
- [ ] Human Design end-state modes after individual v1: compatibility /
      connection analysis for two CRM clients, single-moment transits against a
      saved individual bodygraph, presentation mode, checksum-bound private PDF
      export, reviewed AI draft support and explicit client delivery. Each mode
      requires its own contract/domain/API/UI state matrix and cannot be
      enabled from prototype-only buttons.

## Этап 6: Контент, подписки, автоматизация

Цель: реализовать расширенные способы монетизации и удержания внутри платформы.

Включает:

- Content products и recorded materials.
- Client subscriptions на контент или услуги астролога.
- Platform plans для астрологов.
- Funnel/automation builder.
- Broadcasts и segmented notifications.
- Content moderation.
- Referral flows.

## Этап 7: Аналитика и зрелая админка

Цель: довести внутренние операции и аналитический контур до полного функционального уровня.

Включает:

- Dashboard астролога: revenue, sessions, conversion, products, subscriptions.
- Platform analytics: GMV, revenue, active astrologers, activation, retention.
- Advanced moderation queues.
- Verification workflow.
- Dispute workflows.
- Platform settings: комиссии, тарифы, справочники, templates.
- расширение уже отдельной `admin-api` backend-поверхности от первого finance
  contour к remaining internal workflows.
- Dedicated analytics storage, если потребуется нагрузкой или отчётностью.

## Явно вне текущего scope

- Public astrologer marketplace.
- Public catalog и search.
- Cross-promotion между астрологами.
- SEO-driven discovery pages.
