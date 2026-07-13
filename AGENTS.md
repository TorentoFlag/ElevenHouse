# Инструкции для агентов ElevenHouse

ElevenHouse — production-кодовая база закрытой SaaS/CRM-платформы для
астрологов. Это не MVP, прототип, публичный маркетплейс или discovery-сервис.
Решения должны быть долговременными, проверяемыми и соответствовать
production-требованиям по архитектуре, security, данным и эксплуатации.

## Продуктовые инварианты

- Клиент попадает в продукт по прямой ссылке конкретного астролога.
- Публичный каталог, поиск, рекомендации и cross-promo астрологов запрещены.
- В кабинете клиента допустимы только уже связанные астрологи: через прямую
  ссылку, покупку, запись, лид-магнит или ручное добавление.
- Один аккаунт может совмещать роли клиента и астролога. Moderator, admin и
  super-admin — внутренние роли платформы.
- Русский и английский поддерживаются с запуска.
- Время хранится в UTC и отображается в timezone пользователя.
- Деньги хранятся в minor units с explicit currency.
- Sensitive data, recordings и обезличенное использование требуют явных
  consent records.
- ТЗ задаёт полный продуктовый scope. Не меняй scope или бизнес-стратегию без
  прямой просьбы пользователя.

## Source of truth и обязательное чтение

Перед нетривиальной работой начни с `docs/development/agent-runbooks/00-task-intake.md`
и прочитай релевантные документы:

- `docs/README.md`
- `docs/architecture/design-reference-inventory.md`
- `docs/architecture/overview.md`
- `docs/architecture/repository-structure.md`
- `docs/architecture/backend-modules.md`
- `docs/product/roadmap.md`
- `docs/product/full-functional-scope.md`
- `docs/development/agent-workflow.md`
- `docs/development/agent-runbooks/README.md`
- `docs/decisions/`
- для API — `docs/api/api-boundaries.md`

Операционные входы:

- Commands: `docs/development/commands.md`
- Testing and evidence: `docs/development/testing-strategy.md`
- Task routing: `docs/development/agent-runbooks/README.md`

Если документация конфликтует с последней инструкцией пользователя, следуй
пользователю и синхронизируй canonical docs, когда решение изменилось.

Перед проектированием новой feature, backend-модуля, API surface, workflow или
инфраструктурного контура проведи research best practices используемого стека.
Для Nest.js, React, Drizzle, BullMQ, payments, auth/security и других критичных
частей приоритетны официальные документы, primary sources и принятые ADR.

## Скиллы, плагины и runbook’и

Перед каждым ответом и действием проверь доступные skills, plugins, MCP и
проектные runbook’и. Релевантный инструмент используй до планирования, правок
или проверок. Разрешено самостоятельно устанавливать необходимые skills и
plugins, если это не нарушает безопасность, scope, архитектурные границы или
текущую инструкцию пользователя.

## Архитектурные границы

Репозиторий — monorepo с deployable apps и общими packages.

Frontend-поверхности:

- `apps/client-web`
- `apps/astrologer-web`
- `apps/admin-web`

Backend-процессы:

- `apps/public-api`
- `apps/astrologer-api`
- `apps/admin-api`
- `apps/workers`
- `apps/payment-worker`
- `apps/notification-worker`
- `apps/chart-worker`

`admin-api` — отдельная целевая поверхность для moderator/admin/super-admin.
Не добавляй internal workflows в `public-api` или `astrologer-api`.

Общий код живёт в `packages/`. Apps могут импортировать packages; packages не
импортируют apps. `packages/domain` объявляет use cases, domain services и
ports и не импортирует `packages/db`. Drizzle schema, migrations, runtime и
adapters принадлежат `packages/db`; apps связывают ports и adapters в composition
roots.

Backend modular-first: строгие domain boundaries, явные контракты, события для
межмодульных side effects и точки будущего выделения. Не создавай преждевременные
микросервисы.

Nest feature живёт в `apps/<api>/src/modules/<module-name>/` и содержит
`<module-name>.module.ts`, controllers, providers, tokens и tests. Root
`app.module.ts` импортирует feature modules, а не собирает их controllers и
providers напрямую. Technical modules следуют тому же правилу.

Платежи, уведомления, расчёты карт и аналитика — отдельные контуры. Core
workflows выражаются domain use cases; controllers остаются thin. Общая логика
не дублируется между APIs и workers. Admin actions вызывают domain use cases и
пишут audit logs. Payment/booking transitions явные; notifications, analytics,
reminders, ledger и post-payment effects запускаются событиями/jobs.

Shared API contracts должны быть generated OpenAPI client или package contract
со schema validation. Frontend не дублирует DTO и не импортирует backend
internals.

## Технический фокус и совместная работа

По умолчанию оценивай решения по module boundaries, dependency direction,
contract clarity, testability, operational reliability, security,
maintainability и developer experience. Не рассуждай о маркетинге, монетизации
или бизнес-приоритетах без прямой просьбы.

- Не предлагай временное решение как конечное production-состояние. Staged
  rollout допустим только с явно зафиксированным целевым состоянием.
- Работай только в scope текущей задачи; не выполняй unrelated cleanup,
  formatting или refactor.
- Любые изменения, которых агент не делал, считай работой пользователя или
  другого агента. Не откатывай, не переписывай и не форматируй чужие изменения.
- При пересечении адаптируй своё решение. Спрашивай пользователя только если
  безопасно разрешить конфликт локально нельзя.
- Обнаруженное нарушение ADR, security, module/dependency boundaries,
  payment/idempotency требований или best practices сообщи до построения поверх
  него. Блокирующее нарушение сначала исправь либо согласуй trade-off.
- Простой низкорисковый prerequisite, необходимый результату, исправь и проверь.
  Сложный, security/product-affecting или новый подсистемный blocker явно
  вынеси пользователю и не маскируй частичную реализацию как завершённую.
- Не заменяй отсутствующее production-поведение mock’ами, browser-only state,
  fake success, silent fallback или скрыто disabled функциональностью.

## Управление локальными процессами

Никогда не запускай, не останавливай, не перезапускай и не убивай локальные
frontend/API/workers, Docker, PostgreSQL, Redis, queues и другие long-running
процессы без прямой команды пользователя.

Если для проверки нужен сервис, сначала выполни read-only диагностику через
`lsof`, `ps`, `curl` или аналог. Уже запущенный процесс используй без изменения
его lifecycle. Если ожидаемый порт не слушается, сразу сообщи и остановись: не
запускай сервис, не выбирай другой порт и не меняй способ запуска.

При прямой просьбе запустить сервис сначала проверь стандартный порт. Не
останавливай занявший его процесс без отдельного разрешения. При просьбе
остановить или перезапустить заранее назови процесс и порт и действуй только в
этих границах.

## Database и data rules

- Схема, migrations и adapters живут в `packages/db`; domain не знает Drizzle.
- При изменении schema не создавай incremental `ALTER`-цепочку. Пересобери
  актуальную baseline migration и выполни полный локальный `db:reset`.
- `db:reset` разрушителен: сначала установи активную локальную ElevenHouse DB и
  её фактический Docker port согласно `docs/development/commands.md`. Никогда не
  направляй reset в production или non-local host.
- Transaction boundaries, uniqueness и references должны быть явными.
- В shared workflows не допускай неявных статусных изменений или дублирования
  доменной логики.
- При изменении architecture, scope или module boundary обновляй canonical docs.

## Канонический дизайн

`ElevenHouseDesign/` — реализованный источник истины для экранов, layout,
UX-flow, терминологии и видимого functionality scope. Связь с production-кодом
фиксирует `docs/architecture/design-reference-inventory.md`.

Дизайн не является production frontend architecture. Не переноси JSX-структуру,
`window.*`, localStorage-state, mock datasets, demo-router, `DemoSwitch`,
`TweaksPanel`, однофайловые компоненты или prototype persistence. Production
строится в `apps/`, `packages/`, shared contracts, domain use cases и
`packages/design-system`.

При переносе UI:

1. Открой точный route референса, обычно
   `http://localhost:8000/ElevenHouse.html`, и production route в настоящем
   браузере. Указанный пользователем экран/состояние обязательно.
2. До правок прочитай соответствующий `ElevenHouseDesign/app/...`, сними
   screenshot и измерь DOM/computed styles: dimensions, padding, gap, border,
   radius, typography, colors, z-index, overflow и interactive states.
3. Для select/dropdown/modal/table/sidebar визуальной оценки «на глаз»
   недостаточно.
4. После реализации повтори сценарий в production, сравни screenshot, metrics,
   interactions и edge states; исправь видимые расхождения.
5. Mock/local data референса не переносится: production UI сохраняет real API,
   contracts, domain state, pagination, validation, accessibility и tests.

Не называй UI готовым без browser evidence, соответствия референсу и проверки
пользовательского flow.

## Verification и завершение

Работай по TDD contract из `docs/development/testing-strategy.md`. Используй
самую узкую доказательную проверку, затем расширяй её по dependency surface.
Перед финальным ответом пройди
`docs/development/agent-runbooks/08-verification-and-git.md`.

Финальный отчёт строго разделяет:

- реализовано;
- проверено;
- частично реализовано;
- намеренно отложено;
- заблокировано;
- пропущенные проверки и residual risk;
- замеченные, но не затронутые чужие изменения.

Не используй «работает», «готово» или «production-ready», если весь видимый
scope не реализован и не подтверждён требуемым evidence.
