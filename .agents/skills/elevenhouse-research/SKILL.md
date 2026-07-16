---
name: elevenhouse-research
description: Use when an ElevenHouse task needs a new or risky architecture decision, unfamiliar framework or provider behavior, security/payment/data guidance, product alternatives, competitor pattern analysis, or evidence beyond the repository.
---

# ElevenHouse Research

## Core principle

Research the decision, not the topic in general. Produce current evidence and a
recommendation that fits ElevenHouse; do not turn external patterns into silent
scope changes.

Read `docs/development/research-strategy.md` before searching.

## Procedure

1. State the exact question and which product/architecture decision it affects.
2. Establish repository truth first: accepted ADR, canonical docs, current
   implementation, dependencies and constraints.
3. Select the research lane:
   - technical: official/vendor docs → standards/primary sources → maintainer
     material → mature reference implementation;
   - product: official product docs/help/public demos → platform/accessibility
     guidance → reputable UX research → public competitor flows.
4. Verify currency and applicable version. Record access date and direct links
   to the supporting section.
5. Separate sourced fact, repository evidence and inference. Use a bounded spike
   when documentation cannot establish runtime behavior.
6. Compare 2–3 viable options for material decisions across boundaries,
   security/privacy, data, reliability, testing, operations and migration cost.
7. Recommend one direction and record concrete rejection reasons for the rest.
8. Identify only decisions that truly require the user.

## Product boundary

For every product pattern, record the observed state, likely user problem,
ElevenHouse fit, privacy/consent/accessibility/trust implications and
alternatives. External products can improve state coverage and ergonomics; they
do not replace `ElevenHouseDesign` as visual contract.

Do not introduce discovery/cross-promo, new monetization, protected-data use,
roles, consent purpose or other functional scope without explicit approval.

## ADR boundary

Do not override an accepted ADR from research alone. Expose the conflict,
evidence and consequences; obtain the material decision; then update or
supersede the ADR together with implementation.

## Required output

Attach a concise `Research` section to the spec/ExecPlan with:

- question, affected decision and access date;
- linked sources with version/relevance;
- findings labeled fact/inference/repository evidence;
- options and trade-offs;
- recommendation;
- rejected alternatives;
- user decisions, or `none` when boundaries determine the answer.

Keep quotes short. Never cite a search-results page when a direct primary source
is available.
