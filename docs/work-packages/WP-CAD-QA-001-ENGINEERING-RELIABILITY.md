# WP CAD-QA-001 — Engineering Reliability & Measured Performance

Status: **ACTIVE — slice A: manufacturing single-flight / stale completion protection**
Authority: Universal Constitution 1.2.0 → B4 CAD Commercial Blueprint → Master Century-Grade Execution Prompt
Zone: Floors 91–100 (QA/Operations), with manufacturing domain boundary in Floors 51–60

## User job / problem

Keep a reliable local-first CAD workspace through repeated clicks, rapid parameter changes, slow exact-kernel work, recovery and file operations. CI green on a single sequence is necessary but insufficient for concurrency and performance claims.

Verified audit finding: `Analyze Print` uses a React busy flag, but a second event can enter the async handler before render. A slow earlier analysis can later clear a newer manufacturing report, overwrite status, or set the busy state incorrectly. The project-evidence fingerprint already exists but does not establish single-flight ownership.

## Scope / delivery order

A. Introduce a small, in-memory exclusive operation gate for Analyze Print. Enforce synchronous ownership, revision invalidation on project edits/Open/Reset/Undo/Redo, and ignore stale success/failure. Preserve canonical `CadProject` and offline operation.

B. Extend Chrome critical journey with a rapid repeated-click case and an edit-while-analysis-running case; ensure only one analysis is launched and stale results never reappear.

C. Preserve the previously ratified v1 CI regression budgets (navigation P95 1500 ms, STEP 10000 ms, aligned split 15000 ms). Write a sanitized artifact per Chrome run containing raw navigation samples, valid P50/P95, single-export durations (without falsely labeling them P50/P95), environment/revision and documented limitations. These guards are not hardware-neutral latency SLAs.

D. Audit remaining export/open async completion paths, worker isolation and memory under realistic stress before claiming long-running robustness. Subsequent slices need their own evidence.

## Non-goals for this slice

- no new external provider, billing, remote control, or project schema;
- no silent cancellation of an in-progress OpenCascade call;
- no speculative Web Worker rewrite;
- no false claims of printer/slicer physical verification;
- no changes to Application-Management ownership boundaries.

## Contracts / lifecycle

- one Analyze Print operation owns the slot until it settles;
- a second begin while busy is rejected synchronously;
- an edit invalidates that operation's ability to publish result/status but does not pretend to abort the kernel;
- release is owner-checked; older completion cannot release a newer ticket;
- project evidence fingerprint remains a separate independent precondition;
- derived reports are cleared on project edits as before;
- status and artifact truth are only published for the current owner.

## Tests and gates

- unit: first begin, second begin blocked, invalidate, stale success and stale failure rejected, slot held until finish, stale tickets cannot release another owner;
- browser: rapid duplicate Analyze Print click, project edit while in-flight, subsequent clean analysis succeeds;
- existing TypeScript/unit/exact B-Rep/build/browser critical journey all PASS on exact SHA;
- record limitations; no weakening of existing tests.

## Trust, migration, rollback

No new dependency, external essential service, credential, network send, schema or data owner. Rollback by reverting changes under ordinary reviewed Git history; run full suite again.

## Exit

Close slice A/B only when exact-HEAD CI + real Chrome critical journey pass. WP remains active for later performance/memory slices; do not label the whole commercial product finished solely because this slice passes.

## Slice A/B/C implementation evidence contract

- `src/platform/exclusive-job.ts` prevents double-begin before React's next paint and does not pretend to cancel running kernel work.
- `src/App.tsx` invalidates job publication on project edits, Open/Reset, Undo/Redo; stale failures cannot overwrite newer UI truth.
- `scripts/browser-smoke.mjs` exercises double Analyze + synchronous edit, then a fresh Analyze followed by real Save/Open, export and offline journeys.
- `scripts/browser-metrics.mjs` uses observed nearest-rank percentiles for multiple navigation samples. A **single** STEP/aligned-split observation is reported only as duration, never as P50/P95.
- `.github/workflows/ci.yml` uploads `cad-browser-performance` (14-day retention), containing only timing numbers and CI revision; no project, mesh or private prompts.
- `scripts/browser-metrics.test.mjs` is Vitest-native, avoiding a conflicting nested Node test runner.

This document must not state that the entire WP is complete while export/file-import race and memory/load investigation (slice D) is still open.
