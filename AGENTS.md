# ElevenHouse: инструкции для агентов

ElevenHouse — production-кодовая база закрытой SaaS/CRM-платформы для
астрологов. Это не MVP, прототип, публичный маркетплейс или discovery-сервис.
Клиент входит по прямой ссылке конкретного астролога; каталог, поиск,
рекомендации и cross-promo астрологов запрещены. Клиентский кабинет показывает
только астрологов, с которыми уже существует явная связь.

Один account может совмещать роли клиента и астролога. Moderator, admin и
super-admin — внутренние роли. Русский и английский поддерживаются с запуска;
время хранится в UTC и отображается в timezone пользователя; деньги хранятся в
minor units с explicit currency; sensitive data, recordings и обезличенное
использование требуют consent records.

## Источники истины

Различай виды истины и не подменяй один другим:

1. **Product truth:** последняя инструкция пользователя, затем
   `docs/product/`, принятые ADR и domain/contracts. Research и дизайн могут
   предложить варианты, но не меняют scope молча.
2. **Architecture truth:** `docs/architecture/`, `docs/api/`,
   `docs/decisions/`, security/data/operations docs и проверенный current code.
3. **Visual truth:** точный screen/state в `ElevenHouseDesign/` задаёт внешний
   вид: layout, controls, spacing, typography, colors, borders, radii, shadows,
   icons и responsive presentation.
4. **Implemented-state evidence:** production code, generated schema, tests,
   runtime state, logs, network и browser evidence доказывают, что существует
   сейчас.
5. **Execution procedure:** `docs/development/` и agent runbooks определяют,
   как выполнять работу. Specs/plans — execution artifacts, не current truth.

`ElevenHouseDesign/` не определяет бизнес-правила, API state machines,
authorization, persistence, production component boundaries или runtime data.
Допустимо изменить prototype flow ради утверждённой бизнес-логики, но visual
language соответствующего состояния сохраняется один в один. Видимое
отклонение требует конкретного product, accessibility или production
обоснования в плане и evidence report.

Перед нетривиальной задачей начни с
`docs/development/agent-runbooks/00-task-intake.md`, затем читай только
релевантные источники:

- карта документов: `docs/README.md`;
- architecture/repository/modules: `docs/architecture/`;
- product invariants/scope: `docs/product/`;
- API/security boundaries: `docs/api/api-boundaries.md`;
- workflow: `docs/development/agent-workflow.md`;
- research: `docs/development/research-strategy.md`;
- commands: `docs/development/commands.md`;
- testing/evidence: `docs/development/testing-strategy.md`;
- task routing: `docs/development/agent-runbooks/README.md`;
- decisions: `docs/decisions/`.

## Skills и исследование

Перед ответом или действием проверь доступные skills/plugins/MCP и проектные
runbook'и. Для ElevenHouse используй repo skills, когда совпадает trigger:

- `.agents/skills/elevenhouse-feature-delivery/` — полный non-trivial feature
  contour;
- `.agents/skills/elevenhouse-research/` — architecture/product research;
- `.agents/skills/elevenhouse-design-parity/` — любая видимая UI-работа.

Перед новой feature architecture, backend module, API surface, auth/security,
payment/data workflow, queue/worker, infrastructure contour или незнакомой
возможностью стека проведи current technical research. Приоритет: repository
ADR/current code → official/vendor docs → standards/primary sources → mature
reference implementations. Факты отделяй от inference, сохраняй прямые ссылки
и дату доступа; неизвестное поведение проверяй bounded spike.

Product research выполняй, когда пользователь просит варианты или workflow
неоднозначен. Исследуй established patterns, edge states, privacy,
accessibility и trust, но не копируй competitor behavior и не добавляй новый
scope без решения пользователя.

## Обязательный рабочий цикл

Для любой нетривиальной feature или изменения поведения агент самостоятельно:

1. фиксирует outcome, in/out of scope, definition of done, owned paths,
   authority и current evidence;
2. трассирует весь контур: UI/route → contracts → domain → DB → events/workers
   → security/config/observability → tests/deploy;
3. исследует current best practices и существующие patterns репозитория;
4. выносит пользователю только material product/architecture decisions;
5. фиксирует план по lifecycle из `agent-workflow.md` для сложной работы;
6. реализует через behavioral TDD и focused files/components;
7. запускает targeted checks, затем проверки всего затронутого dependency
   surface;
8. для user-visible scope проходит real network-backed E2E через
   Browser/Computer Use и при необходимости Developer mode/CDP;
9. сравнивает UI с точным reference state, делает self-review diff и повторяет
   implement → verify → inspect до доказанного результата или внешнего blocker.

Не останавливайся после первого passing test, если requested flow шире. Не
спрашивай пользователя о routine implementation details, которые можно вывести
из кода, docs, research и принятых boundaries.

## Shared-main concurrency

Работай в существующем checkout ElevenHouse на `main`. Без прямой команды
пользователя не создавай Git worktree/ветку и не выполняй `git checkout`,
`switch`, `stash`, `rebase` или `cherry-pick`. Эта repo policy имеет приоритет
над generic worktree/feature-branch skill.

Checkout, filesystem и Git index общие. В intake зафиксируй branch, status,
staged и owned paths. Перед каждой связной группой правок перечитай target files
и `git diff -- <path>`; после неё обнови diff/status. Не применяй stale patch.

При пересечении сохрани совместимые намерения и проверь combined state.
Остановись только при несовместимом product/architecture/security/data
semantic conflict; назови exact paths и варианты. Не откатывай и не скрывай
чужое изменение.

Staging/commit требуют authority задачи. Проверь cached diff, добавляй exact
owned paths и не очищай общий index через broad add/reset/unstage. При чужих
staged changes не создавай combined commit: оставь свои изменения
незакоммиченными либо запроси решение пользователя.

## Архитектурные границы

Deployable apps:

- frontend: `apps/landing`, `apps/client-web`, `apps/astrologer-web`,
  `apps/admin-web`;
- backend: `apps/public-api`, `apps/astrologer-api`, `apps/admin-api`;
- async: `apps/workers`, `apps/payment-worker`,
  `apps/notification-worker`, `apps/chart-worker`.

Правила dependency direction:

- apps могут импортировать packages; packages не импортируют apps;
- `packages/domain` объявляет use cases/services/ports и не импортирует
  `packages/db`;
- `packages/db` владеет Drizzle schema, migrations, runtime и adapters;
- apps связывают ports/adapters в composition roots;
- frontend использует validated shared/generated contracts, не backend
  internals и не вручную скопированные DTO;
- admin/moderator/super-admin workflows живут только в `admin-api` и вызывают
  domain use cases с audit logging.

Nest feature живёт в `apps/<api>/src/modules/<module>/`; root `app.module.ts`
импортирует feature modules и не собирает их controllers/providers напрямую.
Controllers thin. Cross-module side effects идут через explicit events/jobs.
Payment/booking transitions, idempotency, ledger и notifications не прячутся в
controller scripts.

Frontend page остаётся app-owned composition. По умолчанию один focused React
component на файл; derived feature logic/state transitions выносятся в
`features/*/model`. В `packages/design-system` попадают только стабильные
reusable visual primitives, не unresolved business workflow.

## Production integrity

- Абсолютный инвариант данных: для каждого domain concept существует один
  canonical contract, schema shape и state machine. Запрещены ad hoc `v1`/`v2`/
  `vN`, parallel DTO/schema/event/cache/table/column namespaces, compatibility
  readers/writers, fallback branches, silent converters, backfills, old-data
  migrations и поддержка старых данных в базе как production behavior.
- Если контракт меняется, все production, local и test contours в scope должны
  перейти на новый единый контракт или fail closed с observable error. Forward
  schema migrations допустимы только как механика установки/эволюции этой
  единственной canonical schema, не как слой совместимости, legacy translator
  или сохранение параллельной модели данных.
- Не выдавай temporary workaround за конечное состояние.
- Не добавляй mocks, fake success, browser-only business state, silent
  fallback, guessed response shape или скрыто disabled behavior вместо
  отсутствующего production-контура.
- Не маскируй provider/DB/security/data-integrity failure значением по
  умолчанию. Делай typed observable failure и устраняй root cause в scope.
- Не строй поверх нарушения ADR, security, dependency direction,
  payment/idempotency или consent rules. Сначала исправь простой in-scope
  prerequisite либо вынеси material blocker/trade-off пользователю.
- Не делай unrelated cleanup/refactor/formatting.
- Чужие изменения считай валидной работой пользователя или другого агента; не
  откатывай и не переписывай их. При пересечении адаптируй решение, а спрашивай
  только если безопасно разрешить конфликт нельзя.

## Process, database и external authority

### Standing local-development authority

В этом checkout пользователь постоянно разрешил проверять, запускать,
останавливать, перезапускать и завершать local-only processes; выбирать
свободный local port; выполнять local DB reset/migrate/seed; создавать,
изменять и удалять local test accounts, roles, orders, payments и data.
Перед destructive action установи exact target read-only проверкой и используй
только `localhost`, `127.0.0.1` или local Docker. Authority не относится к
production, remote/shared host, external account/credential, deploy, purchase,
push/PR и non-local data: для них нужна отдельная authority.

Перед destructive DB command установи фактическую local ElevenHouse DB и Docker
port по `docs/development/commands.md`. Никогда не направляй reset в production
или non-local host. При изменении schema добавь следующую focused forward
migration, не переписывая committed SQL/journal/snapshot artifacts; выполни
требуемый local `db:reset`, который применяет всю committed lineage. Production
evolves forward-only through fail-closed lineage preflight/reconciliation, not
reset.

External writes, deploy, secrets, purchases, account/permission changes,
production data mutation и commit/push/PR требуют authority из запроса или
соответствующего runbook. Read-only research и диагностика разрешены в scope
задачи.

## Visual implementation contract

До UI-правок:

1. найди mapping в `docs/architecture/design-reference-inventory.md`;
2. открой exact reference route/state и production route/state в настоящем
   браузере;
3. прочитай релевантные `ElevenHouseDesign/app/*` только для visual/interaction
   evidence;
4. сними reference screenshots на нужных viewport'ах;
5. измерь DOM/computed styles: dimensions, padding, gaps, typography, colors,
   borders, radii, shadows, z-index, overflow и interactive states;
6. согласуй visible states с утверждённой production business logic.

После реализации повтори тот же сценарий в production: реальная роль, locale,
network data, loading/empty/success/validation/error/disabled/retry states,
responsive viewport, keyboard/focus, console и network. Сравни screenshots и
metrics; исправляй расхождения. Для select/dropdown/modal/table/sidebar
визуальной оценки «на глаз» недостаточно.

Если browser surface или required service недоступен, UI acceptance остаётся
**blocked**, а не считается пройденным по component tests. Не называй видимый
scope завершённым без browser evidence и reference comparison.

## Verification и завершение

Работай по `docs/development/testing-strategy.md`: red → green → refactor,
targeted → affected surface → repository gate. Тест проверяет observable
behavior, не факт вызова mock. Перед финалом используй
`docs/development/agent-runbooks/08-verification-and-git.md` и запускай свежие
команды, доказывающие каждую claim.

Финальный отчёт строго разделяет:

- реализовано;
- проверено с командами/evidence;
- частично реализовано;
- намеренно отложено;
- заблокировано;
- пропущенные проверки и residual risk;
- замеченные, но не затронутые чужие изменения.

Не используй «работает», «готово» или «production-ready», если весь requested
scope не реализован и не подтверждён обязательным evidence.

## GitNexus

Перед правкой функции, класса или метода выполни upstream `impact` и сообщи
пользователю direct callers, affected processes и risk; HIGH/CRITICAL требует
предупреждения до edit. Перед commit выполни `detect_changes()`; для compare —
`base_ref: "main"`. Не переименовывай символы text replacement: используй
`rename`. Для unfamiliar code сначала `query`, затем `context`; для security —
`explain`. Полные procedure и tool reference находятся в
`.claude/skills/gitnexus/`; выбери skill по типу задачи перед вызовом инструмента.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ElevenHouse** (36708 symbols, 94489 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ElevenHouse/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ElevenHouse/clusters` | All functional areas |
| `gitnexus://repo/ElevenHouse/processes` | All execution flows |
| `gitnexus://repo/ElevenHouse/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
