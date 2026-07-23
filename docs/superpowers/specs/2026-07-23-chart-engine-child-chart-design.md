# Chart Engine Child Chart Interpretation Mode Design

## Purpose

Add `Детская карта` to `/chart-engine` as a production interpretation mode for
children. It uses the same astronomical natal calculation as `Натал`, but frames
the result, Dictionary lookups and UI copy for parent-facing, development-safe
interpretations.

This is not a new ephemeris method and not a separate Python calculation. The
observable user outcome is:

- an astrologer can choose a CRM client, switch to `Детская`, calculate or
  reopen a saved chart;
- the wheel, planets, houses, aspects and distributions come from a canonical
  natal `chart-result.v1`;
- the interpretation tab looks up only `child.*` Dictionary codes and offers the
  existing missing-entry creation path when a child interpretation is absent;
- UI labels honestly explain that this is a child interpretation mode over a
  natal chart;
- PDF remains disabled for this mode until a child-specific report source and
  renderer are designed.

## Product Boundary

In scope:

- Add a visible `Детская` chart mode in `/chart-engine`.
- Use one owner-scoped CRM client with complete birth data.
- Reuse natal backend job creation, result persistence and restore semantics.
- Add a frontend result view mode that keeps `method: "natal"` data but changes
  display copy and Dictionary code generation to child-specific anchors.
- Add state matrix copy for missing birth data, no time, approximate time,
  calculating, failed/retry, stale and saved/current child-mode results.
- Use soft, parent-facing Russian labels.

Out of scope:

- New Python provider endpoint or DB `method = "child"`.
- Public sharing, AI generation, delivery workflow or child-specific PDF.
- Medical, psychological, diagnostic or deterministic claims.
- A separate “child profile” domain object.

## Architecture

The calculation authority stays unchanged:

```text
astrologer-web child mode
  -> POST /charts/natal/jobs
  -> chart_calculation_jobs.method = natal
  -> chart-worker
  -> apps/chart-engine /v1/natal
  -> stored payload method = natal
  -> frontend renderMode = child
```

The frontend owns the interpretation mode because child chart semantics are
presentation and content semantics, not astronomical method semantics. Saved URLs
should preserve the view mode separately from the persisted calculation method,
for example through an existing route-state mechanism such as
`mode=child_chart` if the current chart-engine URL helper supports that safely.

Contracts do not need a new calculation payload schema. If shared frontend/API
types need a method-like value for route state, it must be named as a view mode
or interpretation mode, not as a provider calculation method.

## UI Design

`Детская` appears as an enabled chart-engine mode near `Натал`, because it is a
single-client chart and shares the natal wheel. The screen should keep the
existing visual language: top toolbar, left rail, central wheel, right tables
and Dictionary tab.

Mode copy:

- Empty/current state: “Детская карта” / “Натал ребёнка будет рассчитан из CRM
  birth data, а трактовки откроются в мягком детском режиме.”
- Success state: “Детская карта рассчитана” / “Расчёт использует натальные
  положения; трактовки адаптированы для родительского чтения.”
- PDF tooltip: “PDF для детской карты будет отдельным контуром.”

The right-side tabs remain `Планеты`, `Аспекты`, `Дома`, `Трактовки`. The
`Трактовки` tab must visibly show child framing through section/meta labels, not
by changing chart data.

## Dictionary Contract

Child interpretations use deterministic anchors derived from the current natal
result:

```text
child.<point>.<sign>
child.<point>.house.<houseNumber>
child.house.<houseNumber>
child.aspect.<pointA>.<aspectType>.<pointB>
```

The codes deliberately do not fall back to `natal.*`. If a child-specific entry
is missing, the UI uses the established honest missing-entry card and offers to
create the missing Dictionary entry in the relevant category. This avoids
presenting adult natal copy as child-safe content.

Dictionary entry tone requirements:

- describe potential, needs, temperament and supportive environment;
- avoid diagnosis, pathology, fatalism and fixed identity claims;
- avoid medical, mental-health or legal advice;
- avoid deterministic predictions about future success, relationship outcomes
  or parental duties.

## Data Flow

1. Astrologer selects one CRM client.
2. Frontend mode is `child_chart`.
3. Calculation action calls the existing natal job API with CRM-resolved birth
   data only.
4. Job polling and saved result retrieval are unchanged.
5. The result is rendered through existing single-wheel natal components.
6. The interpretation builder receives `interpretationMode = "child"` and emits
   only `child.*` lookup codes.
7. URL restore loads the saved natal calculation and restores the child view
   mode.

## Error Handling And State Matrix

The state matrix mirrors natal for data readiness:

- no client: ask to select a CRM client;
- missing birth date, timezone, coordinates or required place data: block
  calculation with current birth-data copy;
- no exact time: allow only if current natal behavior allows it, preserving
  warnings and approximation copy;
- calculating: show child-mode calculating copy without frontend queue claims;
- failed: show retry with the natal job error details;
- stale after birth data/settings change: mark child view stale and recalculate
  through natal;
- saved/current: show `Актуальная карта` with child-mode success copy.

## Testing And Acceptance

Automated verification:

- model tests for route-state restore and child mode using natal calculation ids;
- API/client tests proving child mode does not create a new provider method and
  calculation requests still use the natal job endpoint;
- interpretation tests proving `child.*` codes are generated and `natal.*`
  fallback is not used;
- component tests for mode tab, copy, PDF disabled state and missing-entry
  affordance.

Runtime verification:

- authenticated `/chart-engine` browser scenario: choose client, switch
  `Детская`, calculate, wait for natal job result, open `Трактовки`, confirm
  `child.*` lookup network/request data or UI evidence, reload and confirm the
  child view restores;
- console and network must be clean except expected development tooling logs;
- `chart-worker`, `astrologer-api` and `chart-engine` readiness remains green.

Documentation:

- roadmap marks child-chart interpretation mode as first slice only after
  browser evidence;
- design-reference inventory notes that it is a natal-backed interpretation
  mode, not a new calculation method.

## Risks

- Treating child chart as a new provider method would create false product
  semantics and duplicate persistence paths.
- Falling back to adult `natal.*` Dictionary text would be unsafe content
  behavior; missing child entries must be explicit.
- Saved URL state can be confused if method and view mode share the same field.
  Implementation must keep persisted calculation method and UI interpretation
  mode distinct.
