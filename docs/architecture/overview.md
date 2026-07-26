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
- `astrologer-api`: обслуживает `astrologer-web`, CRM и authenticated workflows астролога.
- `admin-api`: отдельный backend для `admin-web`, moderation/admin/super_admin workflows и audit-sensitive internal operations. В текущем коде есть `health` и первый finance-policy/risk/payout contour с admin-session auth, CSRF, idempotent finance commands and durable audit writes; broader internal workflows ещё не реализованы.
- `workers`: общие фоновые задачи, включая transactional-outbox relay и
  детерминированный private PDF export для сохранённых расчётов.
- `payment-worker`: payment webhooks, reconciliation, refunds, payout jobs.
- `notification-worker`: email, SMS, Telegram, push, reminders, retry logic.
- `chart-worker`: тяжёлые расчёты астрологических карт.

В текущем коде существуют `public-api`, `astrologer-api`, `admin-api`,
`workers`, `payment-worker`, `notification-worker` и `chart-worker`. Admin
workflows должны развиваться внутри `admin-api` и не должны заменяться admin
workflows внутри `astrologer-api`.

Эти процессы могут использовать общие domain packages и одну базу данных. Там, где полезно, они должны быть независимо deployable.


## Общая инфраструктура

Начальная инфраструктура:

- PostgreSQL для транзакционных данных.
- Redis для cache, rate limits, коротких locks и поддержки очередей.
- Queue system, например BullMQ.
- Object storage для avatars, covers, recordings, files, generated materials.
- CDN для frontend assets и публичных media.
- Observability для logs, metrics, traces и audit trails.

Calculation PDF artifacts хранятся только в private object storage и выдаются
owner-scoped короткоживущими presigned URLs. PostgreSQL является источником
job/result state, Redis/BullMQ — транспортом идентификаторов, а не копией
расчётных или AI-данных. Production Redis для очередей работает с AOF и
`maxmemory-policy=noeviction`; worker получает достаточный graceful-shutdown
интервал для завершения ограниченной PDF-задачи.

Позже могут появиться ClickHouse/BigQuery для аналитики, dedicated search или выделенные сервисы для chart calculations, notifications или billing.

## Ключевые архитектурные правила

- Applications зависят от packages; packages не зависят от applications.
- Core workflows выражаются как domain use cases, а не controller scripts.
- Межмодульные side effects должны идти через events и jobs.
- Payment, notification, chart и analytics contours должны быть изолированы с первого дня.
- Admin actions должны проходить через domain use cases и писать audit logs.
- Время хранится в UTC; отображение использует timezone пользователя.
- Деньги хранятся в минорных единицах с явной валютой.
