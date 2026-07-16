# Документация ElevenHouse

`docs/` — versioned system of record для продукта, архитектуры и выполнения
работы в ElevenHouse. Корневой `AGENTS.md` служит короткой картой и набором hard
invariants; подробные знания загружаются по задаче через этот индекс, runbook'и
и repo-scoped skills.

## Виды истины и приоритет

### Product truth

1. Последняя явная инструкция пользователя.
2. `product/full-functional-scope.md` и другие принятые product documents.
3. Accepted ADR, shared contracts и domain rules.

Product research и `ElevenHouseDesign` могут выявить варианты или edge states,
но не меняют business scope, роли, consent или закрытую direct-link модель без
явного решения пользователя.

### Architecture truth

1. Accepted records в `decisions/`.
2. Canonical architecture/API/security/data/operations documents.
3. Проверенный current production code и generated schema для фактически
   реализованного состояния.

Если код и canonical architecture расходятся, агент устанавливает факты,
исправляет drift в scope задачи и не строит новую работу поверх скрытого
конфликта.

### Visual truth

Exact screen/state в `ElevenHouseDesign/` — визуальный контракт для layout,
controls, spacing, typography, colors, borders, radii, shadows, icons и
responsive presentation. Mapping к production surface живёт в
`architecture/design-reference-inventory.md`.

Prototype business logic, JSX boundaries, `window.*`, localStorage, mock data,
demo-router, `DemoSwitch`, `TweaksPanel` и browser persistence не являются
product или architecture truth. Production workflow может отличаться по
утверждённым бизнес-правилам, сохраняя visual language соответствующего
состояния.

### Evidence и procedure

- Current behavior доказывают code, tests, runtime, logs, network и browser
  evidence.
- `development/` и runbook'и определяют процедуру выполнения.
- Specs/plans помогают исполнению, но не заменяют current canonical docs.

## Canonical ownership

- `product/` — product invariants и полный утверждённый scope.
- `architecture/` — system map, module ownership, data/infrastructure design и
  design-to-production inventory.
- `api/api-boundaries.md` — API ownership, contracts, authorization и browser
  security.
- `decisions/` — durable accepted architecture decisions и consequences.
- `development/agent-workflow.md` — автономный feature pipeline и living
  ExecPlan contract.
- `development/research-strategy.md` — technical и product research.
- `development/testing-strategy.md` — TDD, runtime E2E, design parity и evidence
  ladder.
- `development/commands.md` — проверенные commands и authority requirements.
- `development/agent-runbooks/` — task-specific procedures.
- `.agents/skills/` — reusable task workflows с progressive disclosure.

## Стартовый маршрут агента

Для нетривиальной задачи:

1. `development/agent-runbooks/00-task-intake.md`;
2. релевантный product/architecture/API/ADR context;
3. соответствующий repo skill и specialized runbook;
4. `development/agent-workflow.md` для полного pipeline;
5. `development/agent-runbooks/08-verification-and-git.md` перед завершением;
6. `development/agent-runbooks/09-documentation-maintenance.md`, если изменились
   behavior, boundaries, workflow или status.

## Быстрый индекс

- `architecture/overview.md` — high-level system map.
- `architecture/repository-structure.md` — apps/packages и dependency direction.
- `architecture/backend-modules.md` — domain/module ownership.
- `architecture/account-role-model.md` — accounts, roles и authorization
  invariants.
- `architecture/design-reference-inventory.md` — current mapping design areas к
  production surfaces и readiness.
- `product/full-functional-scope.md` — полный крупный functional scope.
- `product/roadmap.md` — technical dependency order, не business strategy.
- `api/api-boundaries.md` — public/astrologer/admin API split.
- `development/local-setup.md` — local environment facts без authority на
  process lifecycle.

## Specs и plans

`docs/superpowers/specs/` хранит согласованные design artifacts, а
`docs/superpowers/plans/` — self-contained living ExecPlans. Они обязаны иметь
явный status/progress и observable acceptance, но после реализации не являются
источником текущего поведения.

Durable decisions из выполненного плана переносятся в product/architecture/API,
ADR или runbook. Исторические планы не переписываются задним числом под current
code; их status и retrospective объясняют outcome и remaining gaps.

## Documentation quality gate

После изменения `AGENTS.md`, canonical docs, runbook'ов или `.agents/skills`
запусти:

```bash
pnpm docs:check:test
pnpm docs:check
git diff --check
```

Verifier проверяет обязательную структуру, repo skills, relative links и
известные противоречивые active statements. Он read-only и позже может быть
подключён к hooks/CI без изменения документационного контракта.
