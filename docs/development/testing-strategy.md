# Testing Strategy

Verification является частью реализации. Evidence level выбирается по
наблюдаемому поведению и затронутому dependency surface, а не по удобству
доступной проверки. Более узкий тест не доказывает более широкий claim.

## TDD contract

1. Write or update the smallest failing test that proves the requested behavior.
2. Run it and confirm the failure is caused by missing or incorrect behavior.
3. Implement the smallest production change that makes it pass.
4. Run the targeted test again.
5. Refactor only while the targeted test stays green.
6. Expand verification according to the changed dependency surface.

Тест проверяет observable production behavior, не факт вызова mock. Не добавляй
test-only API в production-код, не угадывай contracts и не mock'ай зависимость,
пока не понятны её side effects и полный data/error contract.

## Evidence ladder

### 1. Domain and contracts

Проверяй schemas, formulas, invariants, error types, state transitions и use
cases без infrastructure. Граничные/ошибочные cases обязательны вместе с happy
path.

### 2. Adapters and integration

Проверяй SQL constraints, transaction boundaries, concurrency, uniqueness,
hydration, outbox/job persistence и real provider adapter semantics на
изолированной local infrastructure. Tests владеют своими данными и следуют
`commands.md`.

### 3. API and security

Проверяй parsing, response schema, auth/authorization, CSRF metadata,
idempotency/replay, safe error translation и no-leak behavior на
service/controller/e2e уровне.

### 4. Frontend behavior

Проверяй validated query/mutation data, loading/empty/success/validation/error/
disabled/retry states, navigation, optimistic/invalidation behavior, keyboard
contract и отсутствие frontend-owned domain arithmetic/state transitions.

Component/DOM test не доказывает network wiring, actual CSS geometry или browser
flow.

## Runtime E2E

Runtime E2E обязателен для нового или изменённого user-visible workflow и для
integration, которую невозможно доказать внутри одного process. Проверяется
реальная network-backed production surface:

- exact app, route и state;
- authenticated role/owner boundary;
- RU/EN или затронутый locale;
- representative persisted data;
- affected loading, empty, success, validation, error, disabled и retry paths;
- network requests/responses и отсутствие unexpected console errors;
- side effects и повторный read после mutation;
- keyboard/focus behavior для interactive UI.

Используй Browser/Computer Use для rendered interaction и Developer mode/CDP
для DOM, computed styles, console и network. Сначала read-only проверь required
ports и используй уже запущенные процессы. Эта стратегия не даёт authority
запускать/останавливать services.

Если required service или browser surface недоступен, Runtime E2E имеет status
`blocked`. Unit/component tests не превращают blocked E2E в pass.

## Design Parity

Design parity обязательна для любой visible UI creation/change/completion claim.
Сравнение выполняется между exact `ElevenHouseDesign` screen/state и
утверждённым production screen/state при одинаковом viewport и эквивалентных
данных.

До implementation зафиксируй:

- route/state, role, locale, viewport;
- reference screenshot;
- dimensions, padding, gaps, type styles, colors, borders, radii, shadows,
  z-index, overflow;
- hover/focus/active/disabled/open/closed и responsive states, которые меняются.

После implementation повтори measurements и screenshot в production, сравни
geometry/tokens/interactions и устрани различия. Для modal, select, dropdown,
table, sidebar и overlay оценки «на глаз» недостаточно.

В evidence report перечисли reference/production artifact paths, measured
states и intentional deviations. Отклонение допустимо только с конкретным
product, accessibility или production constraint и его source/approval.
Prototype business flow может отличаться; визуальный контракт approved state —
нет.

## Accessibility evidence

Для изменённых interactive surfaces проверь semantic roles/names, labels,
keyboard order, visible focus, modal focus containment/return, error association,
touch targets и color contrast. Automated accessibility scan полезен, но не
заменяет keyboard/browser exercise.

## Generated artifacts and async contours

Для generated PDF:

- `pdfinfo` подтверждает валидность и pages;
- `pdftotext` подтверждает required deterministic sections и отсутствие private
  metadata;
- каждая страница рендерится и проверяется на clipping, overlap, glyphs, page
  breaks, contrast и footer collisions;
- affected mode/locale fixtures проверяются отдельно;
- recalculation делает старый download недоступным и создаёт current-checksum
  job.

Для async contour проверяй idempotency, retry exhaustion, permanent/transient
errors, transactional outbox relay, private storage, cleanup ordering,
readiness и graceful shutdown assumptions. Renderer unit test не заменяет DB
integration и real API + worker flow.

## Repository verification

Для shared contracts/domain/db, app composition, scripts/config или нескольких
surfaces заверши широкой проверкой:

```bash
pnpm verify
```

Для agent documentation:

```bash
git diff --check
```

Broad gate не заменяет targeted red/green proof и Runtime E2E/Design Parity.

## Final evidence report

Для каждой acceptance claim укажи:

- command/scenario и fresh result;
- автоматизированный, integration, runtime, accessibility или visual level;
- artifact/log/screenshot path, если применимо;
- skipped/blocked check и фактическую причину;
- residual risk, который остаётся из-за gap;
- unowned changes, замеченные и не затронутые.

Не используй «готово» для requested visible scope, если Runtime E2E или Design
Parity обязательны и не выполнены.
