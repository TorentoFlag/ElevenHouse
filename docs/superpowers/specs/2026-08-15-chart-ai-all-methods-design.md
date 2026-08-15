# Chart AI for every chart method — Design

## Goal

Expose the existing editable AI-draft workflow for every saved, current
chart result: adult natal, child natal, transit, progression, synastry,
composite, solar return, astrocartography, and horary. The child calculation
uses the same private-draft lifecycle as adult natal; its only product
difference is a child-specific prompt and wording.

## Product decision

This design implements the user's 2026-08-15 instruction as product truth:

- child charts are not a separately restricted AI capability;
- no new consent gate, client-delivery gate, PDF restriction, or additional
  child-only lifecycle is introduced by this work;
- every generated result remains an astrologer-owned editable draft and is
  never automatically published or delivered to a client.

The existing calculation ownership, authenticated astrologer session, CSRF,
idempotency, stale-checksum guard, and safe typed provider errors remain
mandatory for every method.

## Current evidence

- The browser shows no AI tab for child, transit, progression, synastry,
  composite, solar return, or astrocartography.
- `ChartEngineWorkspace` only renders the tab when the calculation capability
  permits it and excludes `child` explicitly.
- `deriveChartCalculationCapabilities`, the controller entitlement decorator,
  `ChartsService.createAiDraft`, and `chartInterpretationDraftPromptV1` all
  currently hard-code adult natal-only eligibility.
- The chart worker and private chart engine already calculate canonical v2
  results for all requested methods. AI generation consumes an immutable saved
  calculation; it does not require new calculation-worker work.

## Considered approaches

1. One natal prompt with non-natal payloads forced into its natal schema.
   Rejected: it would discard method-specific factors and make unsupported
   interpretation claims.
2. A chart-AI registry with one validated context builder and prompt definition
   per result method, feeding one shared command/API lifecycle. Selected:
   preserves method semantics while retaining existing idempotency, persistence,
   approval, and UI mechanics.
3. One HTTP endpoint and a separate service/module for each method. Rejected:
   duplicates the command state machine and error/replay rules without creating
   a product boundary.

## Architecture

```text
saved v2 calculation + current checksum
  -> resolve chart-AI profile by method + natal interpretation mode
  -> capability response
  -> ChartEngineWorkspace exposes AI tab
  -> POST /charts/calculations/:id/ai-draft (CSRF + idempotency)
  -> ChartsService validates ownership, checksum, profile and entitlement
  -> profile context builder selects only calculated factors + dictionary entries
  -> structured-output AI prompt
  -> existing CalculationInterpretation draft + command replay record
```

`packages/ai` owns prompt definitions, input/output schemas, and pure context
builders. `packages/domain` owns reusable eligibility/capability decisions and
idempotent command semantics. `apps/astrologer-api` owns authenticated API
composition, tariff authorization, locale lookup, dictionary read, provider
call, and safe HTTP errors. The web app renders only the server-derived
capability and does not infer eligibility from a URL mode.

## Method profiles

All profiles emit the existing editable interpretation-draft structure, but
their input contract and wording are specific to the calculation result.

| Result method         | Context must include                                 | Prompt focus                                                                     |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| natal / `adult_natal` | points, houses, aspects, distributions               | existing natal interpretation                                                    |
| natal / `child`       | same calculated factors                              | child-appropriate, non-diagnostic wording                                        |
| transit               | natal wheel, transit wheel, aspects-to-natal, moment | time-bounded themes; no deterministic prediction                                 |
| progression           | natal and progressed factors, target date            | developmental reflection tied to target date                                     |
| solar_return          | natal and return factors, target year                | annual themes, not guaranteed events                                             |
| synastry              | both participant factors, cross-aspects, overlays    | relationship dynamics without claims about either person beyond supplied factors |
| composite             | composite factors plus two input snapshots           | shared-pattern reflection, not outcome prediction                                |
| astrocartography      | angular lines by point and angle                     | location themes, no city scoring or relocation verdict                           |
| horary                | question category, moment, factors                   | question-oriented reflection, never a verdict or certainty claim                 |

The child prompt differs only in system wording and output prose constraints;
its data lifecycle, API, UI, calculation storage, capability, approval, and
error semantics are identical to adult natal.

## Eligibility and authorization

AI is enabled only when all of the following are true:

- the calculation belongs to the authenticated astrologer;
- it is a non-archived, self-integral reproducible `chart-result.v2` whose
  method matches the saved calculation;
- its result checksum equals the submitted expected checksum;
- the chart-AI profile registry supports that method and, for natal, its
  persisted `adult_natal` or `child` interpretation mode;
- the current tariff has `ai` plus the method-owning chart capability;
- `ASTROLOGER_CHART_AI_ENABLED` is enabled.

The current hard-coded `ai + natal` controller policy must become a
resource-aware authorization step resolved from the persisted calculation.
The existing entitlement manifest already maps natal, transit, progression,
solar, synastry, and horary; composite and astrocartography must gain explicit
method ownership instead of remaining fail-closed unresolved values.

No new `ChartInterpretationMode` values are added. Existing non-natal records
remain `legacy_unclassified`; their eligibility derives from immutable method
and the profile registry. The child value remains on natal records and stops
removing `ai_draft` by itself.

## UI and visual contract

The panel stays the established `ChartAiPanel`. A current supported result
gets the same `AI` tab beside Planets, Aspects, Houses, and Interpretations.
Loading, result-stale, no saved calculation, tariff denial, provider failure,
idempotency-in-progress, retry, edit, save, and approve states remain explicit.

Astrocartography currently has a single Interpretations panel; this work adds
the AI tab while preserving its map and interpretation-table presentation.
The reference prototype's `window.AI_READINGS[type] || natal` helper is not
used: it is a demo fallback and not a production contract.

## Testing and acceptance

For every profile, use behavioral TDD:

- contracts/context: exact method result is accepted, wrong method or invalid
  result is rejected; only permitted calculated fields reach the prompt;
- domain/API: every supported method grants `ai_draft`; archived, stale,
  cross-owner, legacy-v1, wrong-method, missing tariff, disabled config, and
  idempotency replay remain fail-closed;
- UI: each eligible mode renders AI; no result/stale/denied states do not
  expose a deceptive generation control; child presents the same lifecycle;
- browser: authenticated local owner, one current result per mode, RU and EN,
  generate/edit/save/approve/reload/replay, keyboard focus, console/network,
  desktop and mobile visual comparison.

## Delivery order

1. Shared profile registry and generic API eligibility, with existing adult
   natal preserved.
2. Transit, progression, solar, synastry, composite, astrocartography, and
   horary profiles plus UI capabilities.
3. Child natal profile last, using the same lifecycle and only its prompt
   wording difference.
4. Full API/frontend/browser parity sweep and documentation reconciliation.

## Out of scope

- automatic client delivery or publishing of AI drafts;
- PDF/export additions for non-natal methods; child natal retains the same PDF
  behavior as adult natal;
- new chart calculations, worker methods, or provider math;
- city scoring, relocation verdicts, automated horary judgement, or any
  unsupported deterministic prediction;
- changes to unrelated Human Design or dictionary-AI flows.
