# Обзор архитектуры

## Кратко

ElevenHouse нужно строить как monorepo с несколькими frontend-приложениями, несколькими backend-процессами и общими доменными пакетами.

Цель — избежать двух крайностей:

- Не делать один огромный неструктурированный backend, где каждая feature импортирует всё подряд.
- Не создавать преждевременные микросервисы вокруг домена, который ещё развивается.

Выбранное направление: modular-first architecture with extraction points.

## Пользовательские поверхности

В ElevenHouse есть три основные продуктовые поверхности:

1. `client-web`: высоконагруженная публичная/клиентская поверхность.
2. `astrologer-web`: CRM и рабочее пространство астролога.
3. `admin-web`: внутреннее рабочее пространство внутренних ролей платформы.

Это отдельные React-приложения, а не один frontend со скрытыми role switches внутри.

## Backend-процессы

Backend нужно разделить по профилю нагрузки и операционной ответственности:

- `public-api`: обслуживает `client-web`, прямые страницы астрологов, booking, клиентские заказы, публичные checkout flows.
- `ops-api`: обслуживает `astrologer-web` и `admin-web`.
- `workers`: общие фоновые задачи.
- `payment-worker`: payment webhooks, reconciliation, refunds, payout jobs.
- `notification-worker`: email, SMS, Telegram, push, reminders, retry logic.
- `chart-worker`: тяжёлые расчёты астрологических карт.

Эти процессы могут на старте использовать общие domain packages и одну базу данных. Там, где полезно, они должны быть независимо deployable.

## Общая инфраструктура

Начальная инфраструктура:

- PostgreSQL для транзакционных данных.
- Redis для cache, rate limits, коротких locks и поддержки очередей.
- Queue system, например BullMQ.
- Object storage для avatars, covers, recordings, files, generated materials.
- CDN для frontend assets и публичных media.
- Observability для logs, metrics, traces и audit trails.

Позже могут появиться ClickHouse/BigQuery для аналитики, dedicated search или выделенные сервисы для chart calculations, notifications или billing.

## Ключевые архитектурные правила

- Applications зависят от packages; packages не зависят от applications.
- Core workflows выражаются как domain use cases, а не controller scripts.
- Межмодульные side effects должны идти через events и jobs.
- Payment, notification, chart и analytics contours должны быть изолированы с первого дня.
- Admin actions должны проходить через domain use cases и писать audit logs.
- Время хранится в UTC; отображение использует timezone пользователя.
- Деньги хранятся в минорных единицах с явной валютой.
