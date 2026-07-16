# Media Storage Architecture

## Goal

Keep media lifecycle, ownership, purpose validation and object storage outside
business modules while allowing Products, AstrologerProfile, Verification and
generated calculation artifacts to reference safe media assets.

## Implemented baseline

The current repository implements:

- shared validation and contracts for media purpose, status, visibility, MIME,
  upload limits, upload intents, completion and safe responses;
- domain `MediaAssetStore` and `ObjectStoragePort` plus upload-intent/completion
  use cases;
- Drizzle `media_assets`, `media_variants`, constraints, relations and adapter;
- S3-compatible presigned PUT/object-head adapter in `astrologer-api`;
- authenticated CSRF-protected `POST /media/upload-intents` and
  `POST /media/:mediaId/complete` routes;
- local MinIO public/private buckets through Docker Compose and `minio-init`;
- frontend direct-upload API flow in `astrologer-web`;
- Product cover upload UI and owner/purpose/ready validation;
- AstrologerProfile avatar/cover owner/purpose/ready validation and explicit
  read-model integrity issues;
- private Verification document purposes;
- private calculation PDF assets, lifecycle and cleanup through the generic
  calculation-PDF contour.

Product/profile records store media IDs, while API read models resolve safe
media responses. Business modules do not store provider credentials, bucket
policies or presigned upload logic.

## Ownership and dependency direction

```text
astrologer-web
  -> astrologer-api media feature
  -> media domain use cases and ports
  -> packages/db media adapter
  -> S3-compatible ObjectStoragePort
```

Business modules validate a referenced asset by owner, expected purpose and
ready status before saving its ID. They consume media ports/read models; they do
not call provider SDKs directly.

## Purposes and visibility

Browser-uploadable purposes:

- `product_cover` — public image;
- `profile_avatar` — public image;
- `profile_cover` — public image;
- `verification_identity_document` — private image/PDF;
- `verification_qualification_document` — private image/PDF.

`calculation_report_pdf` is private and worker-created; it is deliberately not
a browser upload purpose.

Each purpose owns exact MIME/size/visibility rules in
`packages/validation/src/media`. Do not duplicate those limits in apps.

## Upload lifecycle

1. Frontend validates the selected file through shared media schemas.
2. `POST /media/upload-intents` authenticates the astrologer, validates purpose
   and limits, creates an owner-scoped `uploading` asset and returns a
   short-lived presigned PUT target.
3. Browser uploads directly to the S3-compatible store with returned headers.
4. `POST /media/:mediaId/complete` verifies ownership and object existence/
   metadata, then transitions the asset to ready and returns a safe response.
5. A business mutation accepts the media ID only after owner/purpose/ready
   validation.

Frontend never decides bucket, storage key, visibility or asset ownership.

## Local and production storage

- Local development uses MinIO with `elevenhouse-local-media` and
  `elevenhouse-local-private`.
- Production uses an S3-compatible provider configured behind
  `ObjectStoragePort`.
- Public URLs are resolved through backend configuration; private artifacts use
  short-lived owner-scoped presigned download URLs.
- MinIO is local infrastructure, not a product fallback.

## API boundaries

Implemented `astrologer-api` commands:

- `POST /media/upload-intents`;
- `POST /media/:mediaId/complete`.

Business read models embed safe media data when needed. There is no generic
public route for arbitrary asset IDs, and `public-api` must not expose private
verification or calculation assets.

## Product integration

Products reject `coverMediaId` when the asset is missing, belongs to another
owner, has another purpose or is not ready. Product responses include
`coverMediaId` and resolved `coverMedia` when valid.

AstrologerProfile applies the same checks for avatar/cover. Reads surface typed
integrity issues when a stored reference cannot resolve instead of guessing a
replacement image or silently hiding data corruption.

Verification accepts only owner-scoped private identity/qualification assets.
Calculation PDF creation is worker-owned and follows ADR 0008.

## Remaining explicit gaps

The following are not implied by the existing upload baseline and require their
own feature changes:

- asynchronous image processing, metadata stripping and generated variants;
- generic replace/delete lifecycle with reference checks and retention rules;
- public-page/content/session/recording purposes and access policies;
- profile avatar/cover upload UX completion where a surface still lacks it;
- CDN/image transformation policy beyond current public URL resolution;
- malware scanning and recording-specific compliance/retention.

Do not fake these capabilities with a local URL, placeholder asset or provider
fallback. Add purpose-specific contracts, domain behavior and integration tests
when each contour is implemented.

## Verification

- validation/contract and domain use-case tests;
- schema/adapter integration tests for constraints and ownership;
- API service/e2e tests with controlled object-storage adapter;
- real MinIO integration when storage semantics are changed;
- frontend upload state tests and real browser upload flow;
- owner/purpose/visibility negative cases;
- Design Parity for every visible upload control/state.
