# Copilot Instructions for shared-travel-expenses

## Project Snapshot
- Stack: Next.js 16 (App Router), React 19, TypeScript strict mode, Tailwind CSS v4, MongoDB native driver (`mongodb`).
- App purpose: track trips and split travel expenses between participants.
- Main folders:
  - `src/app`: routes, pages and API route handlers.
  - `src/lib/mongodb.ts`: MongoDB connection and caching.
  - `src/types/index.ts`: shared domain types (`Trip`, `Expense`, `Balance`).

## Critical Framework Rule
- This project uses a Next.js version with breaking changes versus older conventions.
- Before implementing or refactoring framework-level behavior, check the relevant docs under `node_modules/next/dist/docs/`.
- Prefer current App Router patterns already used in this codebase.

## Code Style and Architecture
- Use TypeScript for all new code (`.ts`/`.tsx`) and keep types explicit at API and DB boundaries.
- Respect strict mode (`tsconfig.json`) and avoid `any` unless unavoidable.
- Use import alias `@/*` (example: `@/lib/mongodb`, `@/types`).
- Keep components as Server Components by default; add `"use client"` only when hooks, browser APIs, or client events are required.

## API Route Conventions (src/app/api)
- Use `NextRequest` and `NextResponse` from `next/server`.
- Validate required input fields and return `400` for invalid payloads.
- Validate IDs with `ObjectId.isValid(...)` for `[id]` routes.
- Return `404` when resource is not found.
- Return `500` with stable error messages for unexpected failures.
- Log server errors with route context (existing pattern: `console.error("METHOD /api/... error:", error)`).

## MongoDB Conventions
- Always reuse `getDb()` from `src/lib/mongodb.ts`; do not create ad-hoc connections.
- Keep using native MongoDB collections (`trips`, `expenses`) without Mongoose.
- Persist `createdAt` and `updatedAt` in inserts; update `updatedAt` on mutations.
- Preserve current `tripId` handling in expenses (`ObjectId` when valid).

## Domain and Data Rules
- `Trip` requires: `name`, `startDate`, `participants[]`.
- `Expense` requires: `tripId`, `description`, `amount`, `currency`, `paidBy`, `splitAmong[]`, `date`.
- `amount` must be a positive number.
- Keep balance math deterministic and easy to audit (`computeBalances` pattern in trip detail page).

## UI and UX Conventions
- Use Tailwind utility classes and existing visual language (rounded cards, zinc palette, subtle borders, compact spacing).
- Preserve responsive behavior used in current pages.
- Keep explicit loading and error states in forms.
- Keep accessibility basics (labels for form fields, readable button text, semantic sections).

## Task Planning with ai-team-producer
- Use the `ai-team-producer` agent for planning and coordination tasks, not implementation tasks.
- Trigger it for: sprint planning, backlog prioritization, bug triage, context recovery, and plan handoff preparation.
- Keep role boundaries strict:
  - `ai-team-producer` may update planning docs (`docs/`, `PROJECT_BRIEF.md`, `README.md`).
  - `ai-team-producer` must not edit application source files (`src/**/*.ts`, `src/**/*.tsx`, CSS, HTML).
- Planning artifacts to request from `ai-team-producer`:
  - sprint plan at `docs/sprint-N/plan.md`
  - progress tracking at `docs/sprint-N/progress.md`
  - done checklist at `docs/sprint-N/done.md`
  - implementation handoff prompt with prioritized tasks, acceptance criteria, and explicit scope boundaries
- Recommended development flow:
  - Step 1: Ask `ai-team-producer` to produce/update sprint plan and define scope.
  - Step 2: Implement code changes from that plan with the coding agent.
  - Step 3: Send results back to `ai-team-producer` for progress tracking, triage updates, and next-task sequencing.
- For bug workflow, prefer `ai-team-producer` to classify severity (`blocker`, `major`, `minor`) before coding starts.

## Implementation with ai-team-dev
- Use the `ai-team-dev` agent for implementation work: features, bug fixes, API changes, UI components, styling, and sprint execution.
- Trigger it after scope is defined by `ai-team-producer` (or when a clearly scoped coding task already exists).
- Team role model for execution:
  - Nova: frontend components, client state, UX interaction details
  - Sage: backend/API/database, validation, error handling, security checks
  - Milo: visual polish, responsive behavior, animation and consistency
- Working flow for `ai-team-dev`:
  - Step 1: read context (`PROJECT_BRIEF.md` and sprint plan, when available)
  - Step 2: implement in small increments and keep diffs focused
  - Step 3: update progress notes at `docs/sprint-N/progress.md`
  - Step 4: prepare handoff (`docs/sprint-N/done.md`) and return status to `ai-team-producer`
- Guardrails for `ai-team-dev`:
  - do not merge PRs (producer responsibility)
  - do not silently rewrite sprint scope; escalate scope conflicts back to `ai-team-producer`
  - prioritize blocker issues first when bugs are present
  - keep API responses and error contracts consistent with existing endpoints

## Quality Gates
- Run lint after meaningful changes: `npm run lint`.
- For larger changes, also verify app build: `npm run build`.
- Prefer minimal diffs and avoid unrelated refactors.

## Do / Avoid
- Do align with existing file structure and naming.
- Do keep API behavior backward-compatible unless explicitly requested.
- Avoid introducing new dependencies unless clearly justified.
- Avoid large stylistic rewrites when implementing small features/fixes.
