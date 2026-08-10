# Architecture Decision Records

`decisions/` хранит только durable решения. Перед изменением затронутой
границы прочитай exact record, а не весь каталог. Новый accepted record
заменяет старый через `Superseded`; он не переписывает историю решения.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-monorepo-and-app-boundaries.md) | Monorepo and app boundaries | Accepted |
| [0002](0002-react-vite-without-next.md) | React + Vite | Accepted |
| [0003](0003-nestjs-modular-backend.md) | Nest modular backend | Accepted |
| [0004](0004-payments-notifications-workers.md) | Payment and notification workers | Accepted |
| [0005](0005-custom-design-system.md) | Custom design system | Accepted |
| [0006](0006-drizzle-database-tooling.md) | Drizzle schema and migrations | Accepted |
| [0007](0007-cookie-auth-csrf-and-idempotency.md) | Cookie auth, CSRF and idempotency | Accepted |
| [0008](0008-private-calculation-pdf-contour.md) | Private calculation PDF | Accepted |
| [0009](0009-design-reference-authority.md) | Design reference authority | Accepted |
| [0010](0010-messaging-channel-architecture.md) | Messaging channels | Accepted |
| [0011](0011-flows-postgres-execution-authority.md) | Flows execution authority | Accepted |
| [0012](0012-prelaunch-production-baseline-reset.md) | One-time pre-launch reset | Accepted, completed |
| [0013](0013-refund-initiation-and-decision-ownership.md) | Refund initiation | Accepted |
| [0014](0014-hosted-checkout-capture-authority.md) | Hosted checkout capture | Accepted |
| [0015](0015-online-wallet-chain-commitment.md) | Online wallet commitment | Accepted |
