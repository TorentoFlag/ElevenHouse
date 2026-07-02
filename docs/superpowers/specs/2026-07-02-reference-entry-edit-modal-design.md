# Reference Entry Edit Modal Design

## Context

The reference page in `apps/astrologer-web` already renders entry cards with an `Изменить` / `Edit` action, but `ReferencePage` currently wires that action to `undefined`. The existing `ReferenceEntryModal` supports only creating custom dictionary entries.

Dictionary entries have three effective sources:

- `platform`: original ElevenHouse platform entries.
- `modified`: platform entries with an astrologer-owned override.
- `custom`: astrologer-created entries.

The backend already supports creating custom entries, upserting platform entry overrides, deleting astrologer entries, resetting all astrologer entries, and resetting one platform override. It does not yet support updating an existing custom entry.

## Goal

Clicking `Изменить` / `Edit` opens the same modal UI used for creation, prefilled with the selected entry data, and lets the astrologer save edits.

## Recommended Behavior

The modal becomes a shared create/edit form with two modes:

- `create`: initialized from the selected category and optional title seed.
- `edit`: initialized from the selected effective entry.

The form remains controlled by React state. On edit, the draft starts with the entry's `categoryId`, `title`, and `content`. The modal keeps the same validation and delayed field-error behavior as creation.

Submit behavior depends on entry source:

- `platform`: call `PUT /dictionary/platform-entries/:platformEntryId/override`.
- `modified`: call the same platform override endpoint using `platformEntryId`.
- `custom`: call a new `PUT /dictionary/custom-entries/:entryId` endpoint.

The custom update endpoint is required for full feature coverage. Recreating custom entries on edit would change IDs, timestamps, ordering semantics, and delete/reset behavior, so it is not acceptable for production.

## Architecture

Shared request/response contracts stay in `packages/contracts`. Domain workflow stays in `packages/domain` through a new `updateDictionaryCustomEntry` use case and `DictionaryStore.updateCustomEntry` port. Drizzle implementation stays in `packages/db`. Nest route wiring stays inside the existing `apps/astrologer-api/src/modules/dictionary` feature module and uses `@RequireCsrf()` for state-changing browser requests.

Frontend API functions stay in `apps/astrologer-web/src/features/dictionary/api`. TanStack Query mutation options stay in `features/dictionary/model` and invalidate `dictionaryQueryKeys.all()` after successful saves. `ReferenceEntryModal` remains the container for draft state and submit orchestration; `ReferenceEntryModalView` remains presentation-only.

## Accessibility And UX

The current design-system `Modal` remains the dialog primitive. The edit flow must preserve modal focus handling, close/cancel controls, submit disabled state while invalid or pending, and screen-reader field error links. The title and close label should be localized for create vs edit so assistive technology announces the right task.

Category editing remains allowed for custom entries. For platform and modified entries, the category is displayed as selected but not changed by submit because the existing platform override contract updates only title/content and must not move platform-owned entries between categories.

## Error Handling

Invalid drafts keep using local Zod-backed validation. Failed network or server mutations show the existing generic modal error. `NotFound` from backend maps to the generic user-facing error in this screen; the query invalidation after successful mutations refreshes the list and category counts.

## Testing

Use TDD. Add failing tests before production code for:

- contracts parsing custom update requests;
- domain use case normalizing custom update input;
- Nest service/controller/e2e behavior for `PUT /dictionary/custom-entries/:entryId`;
- frontend API functions sending `PUT` with CSRF and shared schemas;
- mutation options invalidating dictionary queries after update/override;
- modal draft initialization and edit submit routing;
- page container opening edit modal with selected entry data.

## Best-Practice References

- WAI-ARIA APG Modal Dialog Pattern: focus stays inside modal, Escape closes, close control remains visible, and focus returns logically after close.
- React input docs: controlled inputs need synchronous `onChange` updates and localized state to avoid unnecessary page re-renders.
- TanStack Query mutation invalidation docs: related queries should be invalidated after successful writes.
- OWASP CSRF Prevention Cheat Sheet: cookie-auth state-changing requests require CSRF protection.
- Drizzle update docs: PostgreSQL update with `returning()` is the right fit for owner-scoped custom entry updates.

## Scope Boundaries

This design does not add deletion confirmation, optimistic updates, version conflict detection, audit logs, or category reassignment for platform entries. Those are separate workflows.
