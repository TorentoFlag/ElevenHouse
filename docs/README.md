# Документация ElevenHouse

Эта папка — проектная память ElevenHouse. Агенты и разработчики должны использовать её как источник правды по архитектуре, scope и продуктовым решениям, а при расхождении с кодом актуализировать документацию по фактической реализации.

Для соответствия сверстанному дизайну главным источником правды является
`architecture/design-reference-inventory.md`. Он связывает реализованный дизайн
из `ElevenHouseDesign/` с production-поверхностями, доменными границами,
контрактами, текущим кодом и design-system работами.

## Читать в первую очередь

- `architecture/overview.md` — высокоуровневая архитектура системы.
- `architecture/repository-structure.md` — ожидаемая структура monorepo.
- `architecture/backend-modules.md` — доменные границы backend.
- `architecture/account-role-model.md` — модель аккаунтов, ролей и базовые auth-инварианты.
- `architecture/design-reference-inventory.md` — первичная карта соответствия реализованного `ElevenHouseDesign/` production-поверхностям, доменным модулям, контрактам, текущему коду и design-system работам.
- `product/roadmap.md` — техническая roadmap разработки полной версии.
- `product/full-functional-scope.md` — полный функциональный scope продукта.
- `api/api-boundaries.md` — разделение public, astrologer и будущего admin API.
- `development/agent-runbooks/` — операционные ранбуки для агентов по типовым
  задачам: intake, дизайн→production, frontend, backend, DB, contracts/security,
  workers/events, local services, verification/git, docs maintenance.
- `decisions/` — architecture decision records.

## Что не является production-архитектурой

Папка `ElevenHouseDesign/` — канонический сверстанный дизайн экранов, UX-flow,
терминологии и видимого функционального scope. Её нужно использовать через
`architecture/design-reference-inventory.md`.

При этом файлы `ElevenHouseDesign/` не описывают production frontend
architecture. JSX-структура, `window.*` globals, `localStorage` state, mock
datasets, demo-router, `DemoSwitch` и `TweaksPanel` не переносятся в production
как архитектурная модель.

Не хранить в `docs/` исполненные agentic implementation plans/specs как источник правды. После реализации такие планы быстро расходятся с кодом и мешают агентам. Архитектурные решения фиксируются в `docs/architecture/` и `docs/decisions/`, а актуальное поведение проверяется по коду.

## Краткое описание продукта

ElevenHouse — закрытая SaaS/CRM-платформа для астрологов. Она помогает астрологам продавать консультации, управлять клиентами, вести бронирования и оплаты, доставлять материалы, запускать подписки и анализировать свою практику.

Платформа не является публичным маркетплейсом астрологов. Клиент попадает внутрь только по прямой ссылке астролога. В текущем scope платформа не должна рекомендовать конкурирующих астрологов или показывать публичный каталог. Клиентский кабинет может показывать только тех астрологов, с которыми у клиента уже есть явная связь через прямую ссылку, покупку, запись, лид-магнит или ручное добавление.

## Важное правило scope

ТЗ описывает полный функционал продукта. Документация проекта не должна самовольно менять продуктовый scope или бизнес-стратегию. Roadmap в этом репозитории означает техническую очередность разработки и управление зависимостями между частями полной системы.
