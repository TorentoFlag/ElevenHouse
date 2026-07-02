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
- Consent-aware sharing of birth data.
- Chart calculations.
- `chart-worker` для тяжёлых расчётов.
- Настройки школ/подходов, systems, orbs и других параметров расчётов.
- AI brief или consultation prep support, если это подтверждено продуктовым scope.
- Lead magnets на основе birth data.
- Astrological triggers и reminders.

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
- `admin-api` как отдельная backend-поверхность для внутренних workflows, если он ещё не создан к этому этапу.
- Dedicated analytics storage, если потребуется нагрузкой или отчётностью.

## Явно вне текущего scope

- Public astrologer marketplace.
- Public catalog и search.
- Cross-promotion между астрологами.
- SEO-driven discovery pages.
