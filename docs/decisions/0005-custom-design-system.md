# ADR 0005: Собственная design system

## Status

Accepted

## Decision

Создать собственную design system ElevenHouse в `packages/design-system` и использовать её во всех frontend applications.

## Rationale

У ElevenHouse три поверхности, которые должны ощущаться целостно, но обслуживать разные workflow: client booking, astrologer CRM и admin operations. Собственная design system даёт контроль над tokens, primitives, layouts, forms, feedback states и domain-specific components.

`ElevenHouseDesign/` является каноническим visual contract для соответствующего
screen/state. Product behavior, terminology with business meaning и functional
scope определяются product/domain sources. Подробное разделение authority
зафиксировано в ADR 0009.

## Consequences

- Shared UI primitives и components живут в `packages/design-system`.
- Product apps не должны локально форкать visual primitives без ясной причины.
- Reusable primitives and workflow components are extracted from the design only
  when they have stable production contracts and cross-surface reuse.
- Design system должна поддерживать responsive layouts, accessibility, русский/английский текст, form-heavy CRM screens и high-trust payment/booking flows.
