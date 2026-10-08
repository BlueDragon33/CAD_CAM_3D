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

C. Capture reproducible real-browser timings (navigation, STEP, aligned 3MF) as evidence, with raw samples and P50/P95 and **UNSET** performance budgets until approved/measured. Do not invent target thresholds.

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
