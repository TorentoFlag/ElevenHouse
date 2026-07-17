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
5. составляет self-contained living ExecPlan для сложной работы;
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

Никогда не запускай, не останавливай, не перезапускай и не убивай frontend,
API, workers, Docker, PostgreSQL, Redis, queues и другие long-running процессы
без прямой команды пользователя. Сначала используй read-only `lsof`, `ps`,
`curl` или аналог. Если required port не слушается, сообщи blocker; не запускай
сервис, не выбирай другой порт и не меняй lifecycle.

Перед destructive DB command установи фактическую local ElevenHouse DB и Docker
port по `docs/development/commands.md`. Никогда не направляй reset в production
или non-local host. При изменении schema пересобери актуальную baseline
migration и выполни требуемый local `db:reset`; production baseline меняется
только через fail-closed reconciliation, не reset.

External writes, deploy, secrets, purchases, account/permission changes,
production data mutation, commit/push/PR и destructive actions требуют authority
из запроса или соответствующего runbook. Read-only research и диагностика
разрешены в scope задачи.

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
