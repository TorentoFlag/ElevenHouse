# ADR 0002: React + Vite без Next.js

## Status

Accepted

## Decision

Использовать React с Vite для frontend applications. По умолчанию не использовать Next.js.

## Rationale

ElevenHouse не является публичным SEO-маркетплейсом. Личные страницы астрологов — direct-link surfaces и в текущей продуктовой модели не должны индексироваться как discovery pages.

Основные frontend-потребности: authenticated SaaS interfaces, booking flows, быстрая итерация и собственная design system. React + Vite хорошо подходит и не приносит SSR complexity без сильной продуктовой причины.

## Consequences

- Frontend apps — SPA-first.
- Public pages могут обслуживаться `client-web` через `public-api`.
- Если позже понадобятся social previews или selective pre-rendering, решать это точечно, а не внедрять Next.js во весь продукт.
