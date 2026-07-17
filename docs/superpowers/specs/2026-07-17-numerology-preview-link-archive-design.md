# Numerology Preview, Linking, And Archive-As-Delete Design

Date: 2026-07-17
Status: Accepted; implementation verified except live browser acceptance

## 1. Outcome

Numerology can calculate individual and compatibility results for manual people
without creating CRM clients or persisted calculations. A calculation becomes a
saved record only when at least one participant is an existing CRM client and
the astrologer explicitly links the result.

For the current delivery, the visible `Удалить расчёт` action reuses the
existing owner-scoped archive mutation. The archived record disappears from the
active workspace and cannot be restored through the UI. Physical deletion from
PostgreSQL and private object storage is explicitly deferred.

This document supersedes the manual-persistence and `В архив` UI sections of
`2026-07-14-numerology-saved-workspace-design.md`. It does not change the
canonical Pythagorean formulas, result shape, AI context, PDF renderer or client
publication rules.

## 1.1 Research

Question: how should Numerology support zero, one or two CRM participants while
preventing orphan saved calculations, and how should the interim delete action
behave?

Decision affected: Numerology preview, persistence/linking and active-workspace
removal semantics.

Accessed: 2026-07-17.

Sources:

- current repository contracts and service show that each participant already
  supports `crm_client` or `manual`, while persistence currently accepts zero
  CRM participants;
- the calculation store already creates links for the CRM participant ids it
  receives and archives owner-scoped records without physical deletion;
- [European Commission: purpose limitation and data minimisation](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/principles-gdpr/overview-principles/what-data-can-we-process-and-under-which-conditions_en)
  supports collecting only data necessary for the stated calculation purpose;
- [WAI-ARIA Authoring Practices: Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
  distinguishes editable and selection-only combobox behavior and informs the
  decision to keep CRM identity selection separate from explicit manual entry.

Repository evidence: mixed CRM/manual requests already fit the participant
union and the service already derives link ids from CRM participants. The
incorrect breadth is that the persist schema and editor also allow saving with
zero CRM participants.

Inference: preview-first plus explicit link-to-save gives the smallest clear
persistence boundary, while separate CRM/manual source controls avoid treating
unmatched free text as a CRM identity.

User decisions: saving requires at least one CRM client; manual-only calculation
remains available as preview; the current delivery shows `Удалить расчёт` but
continues to archive rather than physically delete.

## 2. Product Invariant

The participant source and the persistence boundary are separate concepts:

- a participant may be an existing `crm_client` or a calculation-scoped
  `manual` person;
- preview accepts any valid participant combination;
- persistence requires at least one `crm_client` participant;
- persistence and linking are one explicit user action;
- no active saved Numerology calculation exists without at least one client
  link;
- manual participants never create, update or become searchable CRM records.

The invariant applies to individual and compatibility modes. For compatibility,
the supported matrix is:

| Participants    | Result                             | Persistence | Client links    |
| --------------- | ---------------------------------- | ----------- | --------------- |
| manual + manual | server preview                     | forbidden   | none            |
| CRM + manual    | server preview, then explicit link | allowed     | one             |
| manual + CRM    | server preview, then explicit link | allowed     | one             |
| CRM + CRM       | server preview, then explicit link | allowed     | two, atomically |

## 3. User Flow

### 3.1 Existing CRM flow

Selecting a CRM client remains read-only until the server preview succeeds.
Compatibility with a second CRM client also remains preview-first. Selection
does not persist a calculation as a side effect.

When a valid preview contains one or two CRM participants, the toolbar exposes
the existing bounded action `Привязать к клиенту`.

The link action recalculates from the validated request on the server and
persists the calculation and all required client links in the same operation.
The returned linked record replaces the preview in the workspace.

### 3.2 New calculation

`Новый расчёт` opens the existing inline editor. It supports individual and
compatibility modes and lets each participant use either an existing CRM client
or manual name and birth date input.

If the editor is opened while a CRM client is already selected in the main
workspace, that client is prefilled as the subject. The astrologer can keep the
participant, replace it with another CRM client, or switch it to manual input.

The editor primary action is `Рассчитать`, not `Рассчитать и сохранить`. It
closes the editor only after a successful server preview and shows that preview
in the canonical result workspace.

The editor does not require a calculation title. When linking, the frontend
derives the existing canonical title from participant names and mode and sends
it through the persist contract. Renaming a linked calculation remains part of
the existing recalculation workflow and is outside this change.

### 3.3 Manual-only preview

A preview with no CRM participants:

- remains visible for the current in-memory workspace session;
- can use the existing screen presentation because presentation reads the
  current deterministic result;
- does not enter the saved-calculation list;
- exposes no link, AI interpretation, approval or PDF action;
- is cleared by navigation/reload according to ordinary frontend state;
- is not written to local storage or another browser persistence mechanism.

The preview API remains authenticated and read-only. Request bodies containing
manual names or birth dates must not be added to application logs, analytics or
queue payloads.

## 4. Persistence Contract

The shared preview schema continues to accept manual and CRM participants in
the valid role/order combinations.

The shared persist schema adds a cross-participant refinement requiring at
least one `source = crm_client`. The astrologer API repeats this invariant at
the use-case boundary before calculation creation so another caller cannot
bypass it.

The existing Numerology create operation remains responsible for server-side
CRM hydration, canonical calculation, exact-request handling and atomic
creation of all CRM participant links. A mixed calculation stores the manual
participant as a snapshot inside the linked calculation only.

Existing active Numerology records with no client links are legacy data. They
are excluded from the active saved-workspace read model and are not silently
linked or converted into CRM clients. A future physical-deletion/reconciliation
task may purge them under an explicit data operation.

## 5. Archive-As-Delete Interaction

For a selected linked calculation, the action-menu row that currently reads
`Привязано к клиенту` becomes an enabled destructive action:

- label: `Удалить расчёт`;
- icon: design-system `trash`;
- tone: `danger`;
- behavior: open the existing confirmation modal;
- unavailable while another mutation is pending.

The saved-calculation disclosure uses the same `Удалить расчёт` wording instead
of `В архив`, so the two entry points do not expose conflicting terminology.

The modal contract is:

- title: `Удалить расчёт?`;
- body: `«<название>» исчезнет из рабочего пространства. Восстановить его через интерфейс не получится.`;
- destructive action: `Удалить`;
- pending action: `Удаление…`;
- secondary action: `Отмена`.

On confirmation the frontend calls the existing
`POST /calculations/:calculationId/archive` mutation. On success it closes the
modal, removes the record from active queries, selects the next active
calculation when available, and otherwise returns to the empty workspace.

On failure the selected result stays visible, the modal can be retried, and a
safe error is shown. No optimistic success or browser-only archive state is
allowed.

The UI wording is a temporary product abstraction over archive persistence.
The product decision authorizing that difference is the user's instruction on
2026-07-17. Documentation and code continue to name backend/domain operations
`archive`; they must not claim physical deletion.

## 6. Privacy And Consent Boundaries

A persisted mixed calculation necessarily contains the manual participant name
and birth-date snapshot needed to reopen and verify the deterministic result.
It does not contain a phone number, email, account, CRM relationship or reusable
birth-data profile for that person.

The snapshot remains owner-scoped and astrologer-private until the existing
explicit publication rules make the calculation visible to a linked CRM client.
The manual participant does not gain cabinet access.

This change does not introduce a new manual-participant data category or
processing purpose: the current production contract already persists manual and
mixed participant snapshots. It narrows that behavior by forbidding persistence
when no CRM link exists. No new consent wording, inferred legal basis or fake
consent flag is added in this slice.

The repository currently has no implemented generic Consent record contour, so
this change cannot claim to close the broader consent/provenance requirement for
birth data. That is a pre-existing compliance gap and remains explicit residual
risk. Future Consent work must be able to record who entered a manual snapshot,
for which calculation purpose and when, without converting the person into a
CRM client.

The design follows purpose limitation and data minimisation: collect only the
manual name and birth date required by the active Pythagorean calculation.

## 7. Architecture And File Boundaries

- `packages/contracts/src/numerology.ts` owns preview-versus-persist validation.
- `apps/astrologer-api/src/modules/numerology/numerology.service.ts` enforces the
  persistence invariant and continues to compose the generic calculation store.
- `numerologyFormModel.ts` owns CRM-participant counting, title derivation and
  preview/persist request projection.
- `numerologySavedWorkspaceModel.ts` owns editor state and legacy-unlinked
  filtering for the Numerology saved workspace.
- `numerologyToolbarActionsModel.ts` owns link/delete action derivation, labels,
  icons, disabled reasons and destructive tone.
- `NumerologyCalculationEditor.tsx` renders the context-aware preview action; it
  does not decide persistence.
- `NumerologyArchiveDialog.tsx` keeps its current focused component boundary but
  renders the approved delete wording.
- `NumerologyPageView.tsx` maps the derived action to either link or archive
  handlers without duplicating state rules.
- `useNumerologyPageController.ts` orchestrates preview, persist/link and archive
  mutations and guards stale async responses.

No schema migration, new worker, hard-delete endpoint, localStorage state or
new design-system component is in scope.

## 8. Accessibility And Visual Contract

The existing `ActionMenu`, modal and toolbar geometry remain unchanged. The
user-provided linked-state screenshot is the exact reference for menu placement,
spacing, typography, border, radius and shadow. The approved business
difference is replacing the disabled linked row with an enabled danger action.

- The trash icon is decorative; `Удалить расчёт` is the accessible name.
- The danger row remains keyboard reachable and activates through Enter/Space.
- The modal traps focus, closes with Escape when not pending and restores focus
  to the menu trigger.
- Pending state disables close/confirm actions that could submit twice.
- Desktop and mobile menu/modal states retain the existing design-system
  responsive behavior.

## 9. Error And Concurrency Rules

- Preview failure preserves the editor inputs and creates no saved record.
- Persist/link failure preserves the preview and allows retry.
- Duplicate submission is guarded while a mutation is pending.
- A stale preview response cannot overwrite a newer participant selection.
- Archive success is trusted only after the server response and query
  invalidation.
- Archived, missing or foreign calculations remain inaccessible through the
  existing owner-scoped API boundaries.

## 10. Verification

Behavioral TDD covers:

- preview accepts manual/manual, CRM/manual, manual/CRM and CRM/CRM;
- persist rejects zero CRM participants and accepts one or two;
- mixed persistence creates only the CRM participant links;
- the editor uses `Рассчитать` and does not require a title;
- a selected client prefills a new editor;
- manual-only preview has no AI, PDF or persistence action;
- linked preview exposes the correct singular/plural link action;
- linked saved state exposes `Удалить расчёт` with trash/danger treatment;
- both delete entry points open the confirmation modal;
- confirmation still calls the archive mutation;
- success selects the next active record or empty state;
- failure and pending states preserve data and prevent duplicate actions;
- legacy unlinked records do not enter the active list.

Targeted contract, API service/e2e, frontend model/component/controller tests run
before affected package typecheck/build. Runtime E2E uses the existing signed-in
astrologer Chrome tab and real network-backed `/numerology` flow. Design parity
captures the closed/open action menu and confirmation modal at the reference
viewport plus the affected responsive state, with keyboard/focus, console and
network evidence.

## 11. Alternatives

### Selected: preview-first, link-to-save, archive-as-delete

This matches the approved product meaning, prevents orphan calculations and
reuses the proven archive mutation for the shortest safe delivery.

### Rejected for now: physical hard delete

This is the correct eventual persistence meaning for `Удалить`, but it requires
reliable calculation-row deletion plus private object cleanup and broader
integration evidence. It is deferred by explicit user decision to keep the
current delivery narrow.

### Rejected: automatic persistence when a CRM client is selected

Selection is exploratory and may change several times. Automatic writes would
create surprising intermediate records and duplicate-cleanup pressure.

### Rejected: require every manual participant to become a CRM client

This pollutes the CRM with people who have no client relationship and conflicts
with the direct-link relationship model.

### Rejected: keep `В архив` in the visible UI

This is technically exact but does not match the approved user-facing mental
model. Backend/domain names remain exact so the temporary abstraction is not
mistaken for physical deletion by maintainers.

## 12. Deferred Work

- Physical hard deletion of calculation rows and private object-storage
  artifacts.
- Restore/archive management UI.
- Explicit legacy-data purge/reconciliation.
- AI or PDF generation for manual-only previews.
- Creating CRM clients from manual participants.
- New consent wording or legal-policy decisions.
