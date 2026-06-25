> Archived 2026-06-24. Superseded by docs/MASTER_PLAN.md.

# Plan 05: Brand Memory Management Page

## Rank

5 of 5.

## Goal

Create a dedicated Brand Memory workbench so users can review, accept, reject, filter, and understand proposed brand voice rules before those rules affect future generation.

## Why This Matters

The system can already create brand-memory proposals from approved edits. The missing product surface is a durable management workflow where operators can inspect learning evidence and control what becomes active brand guidance.

## Requirements

- Add a dashboard page for brand memory proposals.
- Show proposal evidence:
  - original text
  - edited text
  - inferred rule
  - confidence
  - scope
  - status
  - source run or approval reference
  - created/reviewed timestamps
- Add filters:
  - pending
  - accepted
  - rejected
  - scope
  - platform
  - confidence range
- Add proposal actions:
  - accept
  - reject
  - bulk accept selected
  - bulk reject selected
- Keep active brand rules human-reviewed only.
- Apply accepted memory rules to future generation through the existing brand-profile tool path.
- Ensure rejected proposals do not affect future generation.
- Add audit-friendly UI copy without implying agents self-modify brand policy.
- Keep workspace scoping strict.

## Key Existing Files

- `lib/brand-memory/proposals.ts`
- `lib/brand-memory/schemas.ts`
- `app/api/brand-memory/proposals/route.ts`
- `app/api/brand-memory/proposals/[id]/route.ts`
- `lib/agents/tools/read-brand-profile.ts`
- `components/create/review-step.tsx`
- `components/agents/agents-console.tsx`
- `db/schema.ts`
- `tests/brand-memory/proposals.test.ts`
- `tests/agents/content-workflow.test.ts`
- `tests/components/review-step.test.ts`

## Implementation Steps

1. Read brand-memory schemas, repository, API routes, and tests.
2. Decide route location:
   - recommended: `app/(dashboard)/brand-memory/page.tsx`
3. Add navigation item if the app sidebar/top nav supports it.
4. Build server-side initial state loader for proposals.
5. Build client workbench component:
   - filters
   - proposal list
   - detail panel
   - accept/reject actions
   - bulk actions
   - loading/error states
6. Add API support for bulk review if single-item route would cause too many sequential requests.
7. Update `read-brand-profile` or related brand profile composition so accepted proposals can shape future generation.
8. Keep rejected proposals excluded from generation inputs.
9. Add tests for:
   - listing proposals by status/scope
   - accepting one proposal
   - rejecting one proposal
   - bulk action if implemented
   - accepted rules included in brand profile
   - rejected rules excluded
10. Add e2e coverage for the workbench if page/nav is added.
11. Run gates, open PR, wait for CodeRabbit, fix, merge, sync.

## Acceptance Criteria

- Users can review pending brand-memory proposals in a dedicated dashboard surface.
- Users can accept or reject proposals with visible evidence.
- Accepted rules affect future brand-profile reads.
- Rejected rules do not affect future generation.
- The page is workspace-scoped and does not leak other workspace proposals.
- UI is operational and compact, consistent with existing dashboard patterns.

## Verification

```powershell
npm test -- tests/brand-memory/proposals.test.ts tests/agents/content-workflow.test.ts tests/components/review-step.test.ts
npm run lint
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

If schema changes are required:

```powershell
npm run db:generate
npm test -- tests/brand-memory/proposals.test.ts
```

## Risks

- Applying accepted rules too broadly can degrade content quality.
- Bulk acceptance can approve weak inferred rules too easily.
- The UI can accidentally imply autonomous self-modification; keep human review language explicit.

## `/goal` Prompt

```text
/goal implement docs/next-feature-plans/05-brand-memory-management-page.md until no issues.

Read brand-memory schemas, repository, routes, and tests first. Build the Brand Memory dashboard workbench with proposal evidence, filters, accept/reject and optional bulk actions, accepted-rule application to future generation, rejected-rule exclusion, workspace scoping, and e2e coverage if page/nav changes. Run all required gates, self-review the diff, open a non-draft PR only after local gates pass, wait for CodeRabbit findings, fix every actionable finding, wait for the follow-up review to settle, merge to main, and sync local main before declaring complete.
```
