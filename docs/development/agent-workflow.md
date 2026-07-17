# Agent Workflow

Этот документ определяет стандартный end-to-end pipeline нетривиальной работы в
ElevenHouse. Цель — дать агенту автономию в техническом исполнении при явных
product, architecture, security и external-authority границах.

## Task Intake Output

До планирования зафиксируй:

- Outcome и observable definition of done.
- In scope и out of scope.
- Product, architecture, visual и implemented-state sources of truth.
- Owned paths и замеченные unowned changes.
- Risks, invariants, security/data/payment/consent impact.
- Required technical/product research.
- Current runtime/service state и доступная browser surface.
- Verification matrix: automated, integration, runtime E2E, design parity.
- External authority и destructive actions.

Точные команды бери из `commands.md`, research contract — из
`research-strategy.md`, evidence levels — из `testing-strategy.md`.

## Autonomous Feature Pipeline

### 1. Establish evidence

Проверь `git status`, релевантный current code, recent history, canonical docs и
реальное состояние сервисов read-only командами. Не исходи из плана или memory,
если факт легко проверить в checkout/runtime.

### 2. Trace the complete contour

До решения перечисли весь затронутый путь:

```text
user route/state
  -> frontend composition and feature model
  -> shared/generated contract
  -> owning API module
  -> domain use case and ports
  -> DB adapter/schema/transaction
  -> events/jobs/providers
  -> security/config/observability
  -> tests/deploy/operations
```

Прочитай существующие sibling implementations и reusable primitives. Не
создавай второй parallel pattern без доказанной необходимости.

### 3. Research unknowns

Новая или risky architecture требует current technical research. Неоднозначный
product workflow может требовать product research. Зафиксируй question,
sources, sourced facts, inference, alternatives, recommendation и conflicts с
ADR/product scope. Следуй `research-strategy.md`.

### 4. Decide at the right level

Самостоятельно выбирай routine implementation details внутри принятых
boundaries. Пользователю выноси только решения, которые меняют product meaning,
accepted architecture, security/privacy, destructive authority, external state
или долгосрочный subsystem contract.

Если запрос ведёт к костылю, silent fallback или security/reliability debt,
объясни проблему evidence-first и предложи production target state.

### 5. Plan the observable outcome

Для multi-step работы создай living ExecPlan. План разбивает работу по
independently verifiable behavior, а не по техническим слоям без результата.
Каждый milestone заканчивается командой и наблюдаемым acceptance.

### 6. Implement with behavioral TDD

Для каждого behavior:

1. напиши минимальный failing test;
2. подтверди правильную причину failure;
3. внеси production change;
4. подтверди green;
5. refactor при green;
6. расширь verification по dependency surface.

Не меняй тест, чтобы скрыть неверное production behavior. Не добавляй fake
provider success, browser-only domain state, test-only production API или
silent fallback.

### 7. Exercise the real system

Если scope видим пользователю, automated tests недостаточно. Используй уже
запущенные сервисы, exact role/route/locale/data state и настоящий браузер.
Browser/Computer Use проверяет rendered interaction; Developer mode/CDP — DOM,
computed styles, console и network. Lifecycle процессов не меняется без прямой
команды пользователя.

### 8. Prove visual fidelity

Для UI выполни `elevenhouse-design-parity`: reference screenshot/measurements
до правок, production screenshot/measurements после, одинаковые viewport/state,
edge/responsive states и список обоснованных deviations. Business behavior
берётся из product/domain truth, visual treatment — из reference.

### 9. Review and iterate

Перед завершением перечитай весь diff и проверь:

- correctness, security, idempotency и data integrity;
- dependency/module ownership;
- missing edge/error/retry states;
- silent fallback, mock или placeholder behavior;
- duplicated/oversized files и derived logic в JSX;
- tests, runtime/browser evidence и stale docs;
- accidental unrelated edits.

Повторяй implement → test → runtime inspect → compare → review, пока весь
requested scope не доказан либо не останется genuine external blocker.

## Living ExecPlan

ExecPlan для сложной работы — self-contained living document. Новый агент без
предыдущего thread context должен суметь выполнить его end-to-end.

Обязательные sections:

- `Purpose / Big Picture`: user-visible outcome и как его увидеть.
- `Progress`: timestamped completed, pending и partial items.
- `Surprises & Discoveries`: неожиданные факты с evidence.
- `Decision Log`: decision, rationale, date/author.
- `Outcomes & Retrospective`: achieved behavior, gaps, lessons.
- `Context and Orientation`: current state, exact paths, defined terms.
- `Interfaces and Dependencies`: signatures/contracts и dependency direction.
- `Plan of Work`: milestones и decomposition.
- `Concrete Steps`: exact commands, working directory и expected observation.
- `Validation and Acceptance`: automated/runtime/visual proof.
- `Idempotence and Recovery`: safe retry, destructive boundaries и cleanup.
- `Artifacts and Notes`: concise evidence locations.

Обновляй progress, discoveries, decisions и outcomes во время исполнения. Не
оставляй `TBD`, vague «add tests/error handling» или ссылки на незафиксированный
контекст. После утверждённого плана продолжай между milestones самостоятельно,
пока не пересечена authority/decision boundary.

## Shared Checkout Protocol

ElevenHouse выполняется в существующем checkout на `main`; worktree и отдельная
feature branch не являются этапами подготовки. Без прямой команды пользователя
не вызывай generic worktree workflow и не выполняй `checkout`, `switch`,
`stash`, `rebase` или `cherry-pick`. Если checkout находится не на `main`, не
переключай branch самостоятельно: сообщи точное состояние как blocker.

В intake зафиксируй shared baseline:

```bash
git branch --show-current
git status --short
git diff --cached --name-status
```

Раздели ожидаемые owned paths, существующие unowned paths и staged entries.
Dirty tree ожидаем при параллельной работе и сам по себе не блокирует задачу.

Перед каждой связной группой edits:

1. заново прочитай complete target files;
2. выполни `git diff -- <path>` для каждого target;
3. сравни current content с предпосылками плана;
4. только затем примени минимальный patch.

После группы правок снова проверь target diff и `git status --short`. Перед
verification и final response обнови shared baseline ещё раз. Если target
изменился параллельно, перечитай combined file, сохрани совместимые намерения и
перезапусти affected checks. Не применяй stale patch и не откатывай чужую
работу.

Пользователю выносится только semantic conflict, который нельзя разрешить без
выбора между несовместимыми product, architecture, security или data
намерениями. Report содержит exact paths, оба намерения и варианты решения.
Shared-index правила staging/commit определяет
`agent-runbooks/08-verification-and-git.md`.

## Parallel Work

Делегируй только когда пользователь или applicable instruction/skill явно
разрешает subagents и задачи независимы. Каждый worker получает bounded scope,
owned paths, inputs, outputs и verification. Main agent независимо проверяет
diff/evidence; agent report не считается proof. Все workers видят тот же
checkout: delegation не создаёт filesystem или Git isolation.

Без разрешения на delegation выполняй тот же pipeline inline. Всегда сохраняй
unowned changes и не смешивай их с текущим scope.

## Completion

Перед final response пройди `agent-runbooks/08-verification-and-git.md`.
Completion claim разрешена только после свежих команд и observable evidence.
Если process/browser/external dependency недоступна, соответствующая acceptance
остаётся blocked и указывается вместе с residual risk.
