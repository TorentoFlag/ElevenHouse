# Media Storage Architecture

## Goal

Add a production media contour for product covers, profile avatars/covers, public page images, content media, session materials and future recordings without coupling business modules to a specific storage vendor.

## Current State

- Product and astrologer profile records already store `coverMediaId` and profile records also store `avatarMediaId`.
- These fields are plain text values with no media table, no owner validation, no upload lifecycle and no renderable URL contract.
- Product constructor and profile settings show media controls, but they do not upload files.
- `ElevenHouseDesign/app/image-slot.js` is a visual/UX reference only. It must not become production architecture.

## Target Architecture

Media is a separate cross-cutting domain contour. Business modules reference media by id and validate ownership/purpose through media domain use cases.

```text
astrologer-web
  -> astrologer-api /media/upload-intents
  -> S3-compatible object storage direct upload
  -> astrologer-api /media/:mediaId/complete
  -> media domain/store
  -> image processing and variants
  -> products/profile/public page reference media ids
```

## Local And Production Storage

- Local development uses MinIO because it is S3-compatible and gives close parity with production object storage.
- Production uses an S3-compatible provider: AWS S3, Yandex Object Storage, Selectel, Cloudflare R2 or another equivalent.
- Application code depends on `ObjectStoragePort`, not on a provider SDK directly.
- MinIO is infrastructure, not a product fallback. Tests should use fake storage for unit/e2e and MinIO for opt-in integration tests.

## Upload Lifecycle

1. The frontend validates obvious client-side constraints: file selected, accepted MIME, size hint.
2. `astrologer-web` calls `POST /media/upload-intents` with `purpose`, `fileName`, `mimeType` and `sizeBytes`.
3. `astrologer-api` authenticates the astrologer, validates purpose/limits and creates `media_asset(status="uploading")`.
4. Backend returns a short-lived presigned upload target and the media asset id.
5. Browser uploads the file directly to S3/MinIO.
6. Frontend calls `POST /media/:mediaId/complete`.
7. Backend verifies object existence, size and content type, then marks the asset `processing` or `ready`.
8. Image processing creates variants and strips metadata.
9. Business entities save only `coverMediaId`, `avatarMediaId` or other media references after the asset is owned by the same user and has the expected purpose.

## Media Purposes

Initial purposes:

- `product_cover`
- `profile_avatar`
- `profile_cover`

Future purposes:

- `public_page_image`
- `content_image`
- `content_attachment`
- `session_material`
- `session_recording`

Each purpose owns limits for file size, dimensions, allowed MIME types, public/private visibility and variant recipe.

## Data Model

`media_assets`:

- `id`
- `owner_user_id`
- `purpose`
- `status`: `uploading | processing | ready | failed | deleted`
- `visibility`: `public | private`
- `storage_bucket`
- `storage_key`
- `original_file_name`
- `mime_type`
- `size_bytes`
- `checksum_sha256`
- `width`
- `height`
- `alt_text`
- `failure_reason`
- `created_at`
- `updated_at`

`media_variants`:

- `id`
- `media_asset_id`
- `variant`
- `storage_bucket`
- `storage_key`
- `mime_type`
- `width`
- `height`
- `size_bytes`
- `public_url`
- `created_at`

## API Boundaries

`astrologer-api` owns authenticated media management for astrologer workspace uploads:

- `POST /media/upload-intents`
- `POST /media/:mediaId/complete`
- `GET /media/:mediaId`
- `DELETE /media/:mediaId`

`public-api` will later serve public read models that embed public media variants. It must not expose arbitrary private media ids.

## Product Integration

Product create/update must reject a `coverMediaId` when:

- media does not exist;
- media is not owned by the current astrologer;
- media purpose is not `product_cover`;
- media is deleted or failed.

Product responses should include both:

- `coverMediaId` for write compatibility;
- `coverMedia` for UI rendering when present.

## Frontend UX

The product constructor cover dropzone should support:

- click to browse;
- drag and drop;
- local preview before upload completion;
- upload progress;
- upload error and retry;
- remove/replace;
- disabled save/publish while upload is in flight;
- preview card rendering using the uploaded media variant.

The reusable frontend split should be:

- `features/media/api/*` for media API calls;
- `features/media/model/*` for upload state and validation;
- `components/MediaDropzone` only if it stays generic and business-agnostic;
- product-specific wiring remains inside ProductConstructor sections.

## Implementation Plan

### Phase 1: Contracts And Domain

1. Add shared validation values for media purposes, status, visibility and upload limits.
2. Add media contracts for upload intent, complete and response.
3. Add domain media types, store port and storage port.
4. Add use cases for creating upload intent, completing upload and resolving media for business modules.

### Phase 2: Database

1. Add `media_assets` and `media_variants` schema.
2. Add Drizzle store adapter.
3. Rebuild the current baseline migration according to project DB rules.
4. Add schema/store tests.

### Phase 3: Storage Infrastructure

1. Add MinIO to `docker-compose.yml`.
2. Add `.env.example` media storage variables.
3. Add S3-compatible object storage adapter.
4. Add bucket CORS setup documentation and optional MinIO init container.

### Phase 4: Astrologer API

1. Add Nest `media` feature module.
2. Add authenticated, CSRF-protected upload intent and complete routes.
3. Wire media store and object storage adapter in the module.
4. Add e2e tests with fake object storage.

### Phase 5: Product Guardrails

1. Update products service to validate `coverMediaId`.
2. Embed `coverMedia` in product responses.
3. Update products tests and contracts.

### Phase 6: Frontend

1. Add media API calls and upload state machine.
2. Add media dropzone UI with drag/drop, preview, progress, error and remove.
3. Integrate product constructor cover upload.
4. Render uploaded cover in constructor preview and product cards.
5. Reuse the same contour for profile avatar/cover after product cover is stable.

## Verification

- Contract and validation tests.
- Domain use-case tests with fake store/storage.
- DB schema and adapter tests.
- Astrologer API e2e tests with fake object storage.
- Frontend model/component tests for upload states.
- Browser visual QA for product constructor cover upload.
- `pnpm --filter @elevenhouse/design-system build` only if UI primitives change.
- `pnpm --filter @elevenhouse/astrologer-web typecheck && pnpm --filter @elevenhouse/astrologer-web build`.
- Relevant API package typecheck/build/tests.
