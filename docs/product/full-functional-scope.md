# Полный функциональный scope ElevenHouse

Этот документ фиксирует полный функциональный scope продукта на уровне крупных контуров. Он не заменяет функциональное ТЗ. Детальные правила, состояния и критерии приёмки берутся из исходного ТЗ.

## Главная модель продукта

ElevenHouse — закрытая SaaS/CRM-платформа для астрологов. Это не маркетплейс и не публичный каталог. Клиент попадает на платформу через прямую ссылку конкретного астролога, а платформа не показывает ему других астрологов как discovery, рекомендации, каталог или cross-promo.

Клиентский кабинет может показывать несколько астрологов только если у клиента
уже есть явная связь с каждым из них: прямой переход по ссылке, покупка,
запись, лид-магнит или ручное добавление. Такой список является историей и
рабочим контекстом клиента, а не поиском новых астрологов.

## Пользовательские роли

- Гость: открывает личную страницу астролога по прямой ссылке, может начать booking и получить lead magnet, если он включён.
- Клиент: покупает услуги/контент астролога, управляет заказами, материалами, подписками и birth data.
- Астролог: продаёт услуги и контент, ведёт расписание, клиентов, записи, финансы и аналитику.
- Модератор: проверяет верификации, контент, отзывы, жалобы и спорные случаи в пределах прав.
- Администратор: управляет пользователями, финансами, настройками платформы, тарифами, справочниками и аудитом.
- Супер-администратор: управляет наиболее чувствительными платформенными настройками, ролями и операционными полномочиями.

Один user account может совмещать роли клиента и астролога.
Роли модератора, администратора и супер-администратора являются внутренними ролями платформы.

## Основные функциональные контуры

- Account, roles, authorization, profile management.
- Astrologer onboarding и readiness к продажам.
- Astrologer public page by direct link.
- Products: консультации, пакеты, подписки, разборы в записи, мини-продукты, курсы.
- Availability, schedule, timezone-aware booking.
- Booking lifecycle: hold, confirmation, reschedule, cancel, no-show.
- Orders и payments.
- Wallet, ledger, commissions, payouts, refunds, disputes.
- Client profile, saved birth data, consent-aware sharing.
- Sessions, recordings, files, generated materials.
- Messaging или unified inbox там, где это входит в продуктовый scope.
- Reviews, ratings, moderation.
- Content, lead magnets, broadcasts, subscriptions.
- Astrology engine: charts, транзиты, синастрия, Human Design, настройки школ
  и расчётов.
- Специализированные расчёты: каноническая пифагорейская нумерология и Матрица
  судьбы в individual/compatibility modes, сохранённые результаты, трактовки и
  private PDF materials на русском и английском.
- Human Design: канонический `human_design_classic` individual bodygraph для
  owner-scoped CRM clients, сохранённые результаты и будущие end-state modes
  для партнёрского разбора, транзитов, presentation, AI draft, private PDF и
  client delivery через явные consent/access boundaries.
- Notifications: reminders, booking/payment/session events, templates, preferences.
- Analytics: dashboards for astrologers and platform analytics.
- Referral programs.
- Admin and moderation backoffice.
- Audit log and sensitive action tracking.

## Критичные системные инварианты

- Нет публичного discovery астрологов.
- Нет публичного каталога и поиска астрологов.
- Нет cross-promotion между астрологами.
- Клиентский entry point — direct link конкретного астролога.
- Список астрологов в клиентском кабинете ограничен уже существующими
  отношениями клиента и не является discovery.
- Время хранится в UTC и отображается в timezone пользователя.
- Деньги хранятся в minor units с explicit currency.
- Payment webhooks и worker jobs должны быть idempotent.
- Generated calculation materials доступны только владельцу через private
  storage; перерасчёт аннулирует старый PDF вместо ведения истории результатов.
- Slot holds должны предотвращать double booking.
- Admin actions должны идти через domain use cases и audit log.
- Sensitive data и recordings требуют явных consent records.
- Русский и английский поддерживаются с запуска.

## Архитектурная привязка scope

Полный функциональный scope реализуется через три frontend-приложения:

- `client-web`
- `astrologer-web`
- `admin-web`

И через backend-процессы:

- `public-api`
- `astrologer-api`
- `admin-api` для внутренних ролей; текущий код содержит минимальную health-only
  заготовку, а доменные internal workflows ещё не реализованы
- `workers`
- `payment-worker`
- `notification-worker`
- `chart-worker`

Платежи, уведомления, расчёты карт и аналитика должны проектироваться как отдельные контуры с первого дня.
