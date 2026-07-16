# Research Strategy

Research уменьшает архитектурные догадки и помогает находить зрелые product
patterns. Он является входом в решение, а не разрешением менять утверждённый
scope или копировать чужую реализацию.

## When Research Is Required

Technical research обязателен перед проектированием:

- новой feature architecture или domain/backend module;
- нового API surface или shared contract strategy;
- auth, authorization, CSRF, sensitive-data или consent flow;
- payment, ledger, booking, idempotency или reconciliation workflow;
- DB/migration, queue/worker, storage, observability или deployment contour;
- незнакомой/новой возможности Nest, React, Drizzle, BullMQ или provider SDK;
- решения, которое конфликтует с accepted ADR или существующим pattern.

Product research уместен, когда пользователь просит варианты, approved workflow
недоопределён, reference показывает неоднозначное interaction, либо mature
products/research могут раскрыть важные states и trust/accessibility risks.
Narrow implementation с однозначным contract не требует ритуального поиска.

## Technical Research

### Source order

1. Accepted repository ADRs, canonical docs и current implementation.
2. Official framework, vendor и protocol documentation.
3. Standards, OWASP/MDN/W3C и другая релевантная primary guidance.
4. Primary research или maintainer-authored material.
5. Mature reference implementation для integration details, которых нет в
   primary docs.
6. Secondary articles только как supporting context, не единственная основа.

Для technical question используй только current primary/official sources, если
они существуют. Проверяй дату/version и сохраняй direct link на конкретный
section. Отделяй прямой факт от собственного inference.

Если docs недостаточно, создай bounded spike: минимальный isolated experiment,
точный success/failure criterion и решение удалить либо promote результат.
Spike не становится production fallback.

### ADR conflict

Research не отменяет ADR молча. При конфликте:

1. опиши accepted decision и фактический conflict;
2. покажи current evidence и последствия сохранения/замены;
3. предложи recommended direction;
4. запроси решение пользователя, если меняется durable architecture;
5. после решения обнови или supersede ADR вместе с implementation.

## Product Research

Исследуй official product docs/help centers, public demos, platform guidelines,
reputable UX research, accessibility standards и при необходимости public
competitor flows. Screenshots и competitor behavior — evidence возможного
pattern, не visual truth и не requirement to clone.

Для каждого pattern зафиксируй:

- что наблюдалось и в каком state/context;
- какую user problem pattern, вероятно, решает;
- совместимость с direct-link closed SaaS model ElevenHouse;
- privacy, consent, accessibility, trust и abuse implications;
- альтернативы и trade-offs;
- recommendation для ElevenHouse;
- какие product decisions остаются за пользователем.

Product research не может без explicit approval добавлять discovery/cross-promo,
новую monetization/business model, protected-data use, role, consent purpose или
иной functional scope. Для UI он помогает полноте states и ergonomics, но
`ElevenHouseDesign` остаётся visual contract.

## Research Output

Research note входит в spec/ExecPlan или отдельный task artifact и содержит:

```markdown
## Research

Question:
Decision affected:
Accessed: YYYY-MM-DD

### Sources
- [Direct official/primary source](https://example.com) — relevance/version

### Findings
- Sourced fact: ...
- Inference: ...
- Repository evidence: `path/to/file`

### Options
1. Option, benefits, risks, migration/operations impact.
2. Option, benefits, risks, migration/operations impact.

### Recommendation
Selected direction and why it fits ElevenHouse.

### Rejected alternatives
Alternative and concrete rejection reason.

### User decisions
Only material product/architecture decisions that cannot be derived safely.
```

Не вставляй длинные цитаты или копии чужой документации. Пересказывай выводы,
соблюдай source word limits/licensing и сохраняй ссылки рядом с claims.

## Research Done Checklist

- Question и affected decision определены.
- Repository facts проверены до web assumptions.
- Current official/primary sources использованы там, где доступны.
- Version/date и direct links записаны.
- Fact и inference разделены.
- Options/rejected alternatives присутствуют для material decision.
- Product/ADR conflict явно обработан.
- Recommendation включает security, reliability, testing и operations impact.
- Research не расширил scope без решения пользователя.
