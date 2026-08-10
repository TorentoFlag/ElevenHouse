# Agent Runbooks

Эти ранбуки описывают, как агент должен выполнять типовые задачи в
ElevenHouse. Они не заменяют `AGENTS.md`, архитектурные ADR и inventory, а
превращают их в пошаговые рабочие процедуры.

## Как пользоваться

1. Начни с `00-task-intake.md` для любой нетривиальной задачи.
2. Выбери один или несколько специализированных ранбуков по области работы.
3. Перед финальным ответом всегда пройди `08-verification-and-git.md`.
4. Если менялись архитектура, scope, API boundaries или правила работы агентов,
   пройди `09-documentation-maintenance.md`.
5. Точные команды бери из `../commands.md`, TDD и evidence requirements — из
   `../testing-strategy.md`.
6. Для novel/risky architecture или product alternatives применяй
   `../research-strategy.md` и repo skill `elevenhouse-research`.
7. Для non-trivial feature используй `elevenhouse-feature-delivery`; для любого
   visible UI — также `elevenhouse-design-parity`.

## Индекс

- `00-task-intake.md` — shared-main baseline, контекст, owned paths и безопасные
  concurrent edits.
- `01-design-to-production.md` — перенос `ElevenHouseDesign/` в production.
- `02-frontend-production.md` — React/Vite apps, design system, UI-поверхности.
- `03-backend-feature-module.md` — Nest feature modules и domain use cases.
- `04-database-and-migrations.md` — Drizzle schema, migrations, adapters, reset.
- `05-api-contracts-security.md` — contracts, API boundaries, auth, CSRF,
  idempotency.
- `06-workers-and-events.md` — outbox, queues, payments, notifications, charts.
- `07-local-services.md` — диагностика и запуск локальных сервисов.
- `08-verification-and-git.md` — проверки, shared index и path-scoped
  commit/push discipline.
- `09-documentation-maintenance.md` — когда и как обновлять документацию.
- `10-telegram-business-hookdeck.md` — bounded Hookdeck/Telegram Business
  verification; requires explicit authority for external changes.

Repo-scoped skills:

- `.agents/skills/elevenhouse-feature-delivery/SKILL.md` — полный autonomous
  feature pipeline;
- `.agents/skills/elevenhouse-research/SKILL.md` — architecture/product
  research;
- `.agents/skills/elevenhouse-design-parity/SKILL.md` — browser-backed visual
  fidelity.

## Базовые правила

- `docs/architecture/design-reference-inventory.md` связывает design areas с
  production surfaces и readiness; он не определяет product priority.
- `ElevenHouseDesign/` задаёт visual contract соответствующего screen/state, но
  не business logic, persistence или production frontend architecture.
- Не добавляй admin/moderator/super_admin workflows в `public-api` или
  `astrologer-api`; для них нужен отдельный `admin-api`.
- Не запускай, не останавливай и не перезапускай локальные long-running
  процессы без явной команды пользователя.
- Не трогай чужие изменения без необходимости. Если они пересекаются с задачей,
  адаптируйся к ним.
