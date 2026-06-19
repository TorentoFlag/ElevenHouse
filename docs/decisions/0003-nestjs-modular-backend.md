# ADR 0003: Модульный backend на Nest.js

## Status

Accepted

## Decision

Использовать Nest.js и TypeScript для backend applications. Структурировать backend logic вокруг явных domain modules и use cases.

## Rationale

Nest.js подходит проекту, потому что даёт strong module boundaries, dependency injection, guards, decorators, OpenAPI support, integrations для background processing и понятную структуру для большого TypeScript backend.

Backend должен быть modular-first, а не casual CRUD monolith. Domain modules должны иметь clear APIs и избегать прямой cross-module data mutation.

## Consequences

- Controllers должны быть thin.
- Use cases/domain services владеют workflows.
- Cross-module effects должны идти через events/jobs там, где уместно.
- Future extraction модулей возможен, потому что boundaries существуют до extraction.
