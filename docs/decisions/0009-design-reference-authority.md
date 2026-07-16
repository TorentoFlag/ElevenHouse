# ADR 0009: Design reference authority

Date: 2026-07-16

## Status

Accepted

## Context

`ElevenHouseDesign/` содержит реализованные экраны и interaction states, но
также prototype routing, mock data, localStorage, browser globals и упрощённые
business flows. Если считать весь prototype единым источником продукта и
архитектуры, агенты либо копируют demo state в production, либо произвольно
отступают от визуального языка, объясняя это архитектурными отличиями.

Нужны независимые authority boundaries для product behavior, production
architecture и visual fidelity.

## Decision

ElevenHouse использует три отдельных вида истины:

- product behavior — current user instruction, accepted product docs, ADR,
  contracts и domain rules;
- production architecture — accepted architecture/API/security/data/operations
  docs и verified current code;
- visual presentation — exact corresponding screen/state в
  `ElevenHouseDesign/`.

Visual authority включает layout, hierarchy, control appearance, spacing,
typography, colors, borders, radii, shadows, icons и responsive presentation.
Он не включает authorization, persistence, API/state-machine design, production
component boundaries, mock datasets или prototype business rules.

Production workflow может отличаться от prototype flow, когда product truth
этого требует. Approved production states сохраняют reference visual language.
Любое intentional visible deviation требует concrete product, accessibility или
production constraint, записанный в plan/evidence.

## Consequences

- Любая visible UI работа требует exact reference/production state pair,
  screenshots, computed-style evidence и real browser verification.
- Prototype JSX/runtime нельзя переносить как production architecture.
- Product research и prototype interactions предлагают options, но не меняют
  scope без user decision.
- `design-reference-inventory.md` остаётся mapping/readiness inventory, а не
  product roadmap или source of priority.
- Component tests без Runtime E2E и Design Parity не закрывают visible
  completion claim.
- ADR 0005 продолжает определять shared design-system ownership; его прежняя
  широкая формулировка design authority уточняется этим ADR.
