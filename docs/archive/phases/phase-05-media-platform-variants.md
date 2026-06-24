> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# Phase 5: Media and Platform Variants

## Purpose

Support uploaded media, ImageKit transformations, platform previews, and agent-aware variant checks.

## Task Packets

### Task 1: ImageKit Upload Backend

Files:
- `lib/media/imagekit.ts`
- `app/api/media/upload-auth/route.ts`

Acceptance:
- Authenticated users can request upload auth.
- Media metadata is ready for persistence.

Verification:
- Integration test for upload auth route.

### Task 2: Media Library UI

Files:
- `app/(dashboard)/media/page.tsx`
- `components/media/upload-dropzone.tsx`
- `components/media/media-grid.tsx`
- `components/media/transform-panel.tsx`

Acceptance:
- User can upload, browse, and select media.

Verification:
- Playwright media flow with mocked upload.

### Task 3: Composer Media Integration

Files:
- `components/create/media-picker.tsx`
- `components/create/platform-preview-card.tsx`
- `lib/agents/tools/generate-platform-variant.ts`

Acceptance:
- Media can be attached to per-platform variants.
- Platform warnings include media constraints.

Verification:
- Unit tests for variant warnings.
