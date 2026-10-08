# WP CAD-QA-002 — Safe Export Ownership and Stale Download Rejection

Status: **RELEASE CANDIDATE — BROWSER + AUTOMATED GATES PASS**
Authority: Universal Constitution 1.2.0 / B4 CAD Commercial Blueprint / execution prompt
Related: `WP-CAD-QA-001-ENGINEERING-RELIABILITY.md`
Zone: Floors 51–60 + 91–100.

## Risk

The UI presently guards each export button by a React busy flag, which updates on the next render; same-task duplicate clicks can still invoke two async exports. More seriously, delayed OCCT generation may download and label an STL, STEP, Core 3MF, Split 3MF or Aligned Split 3MF from an earlier version of the project after the user edits it.

## Desired invariant

- One heavy manufacturing/export task owns an exclusive slot across Analyze Print and all export formats; duplicate triggers before React repaint do not initiate another task.
- When a CAD project is edited, opened, reset, undone or redone, outstanding work is no longer authorized to publish a result or start a **download**. A running kernel operation may finish and release resources; no false cancellation claim.
- A download is permitted only after a final current-input check immediately before the file is offered to the browser.
- Existing standalone `downloadProject*` adapter APIs remain backwards compatible when no guard is supplied.
- UI status never replaces a more recent project-edit status with stale export success/failure.
- Real output validation and compatibility remain unchanged. Do not lower geometric safety or testing thresholds.

## Implementation

- Reuse the already-tested in-memory exclusive job gate from QA-001 for Analyze Print and all heavy export actions;
- add a small optional `mayDownload` callback at the browser-download adapter boundary, called after artifact generation but **before** `anchor.click()`;
- check both job ownership and deterministic manufacturing input fingerprint from `CadProject`;
- preserve canonical CAD data/local-first, no new persisted state, dependency or remote side effects;
- disable competing output buttons while a long-running operation is active.

## Verification

- unit: guarded download rejects stale/false and permits current/true;
- browser: rapid duplicate STEP click followed by fit calibration edit in one task; no obsolete STEP download/status; next clean export still succeeds;
- full TypeScript, Vitest, exact B-Rep, build and Chrome CI;
- Constitution dependency check;
- final exact SHA checks, normal PR merge and conditional Production.

## Remaining scope

This slice does not claim measured long-run heap stability, OS-native cancellable OCCT work, print-bed physics or slicer certification. Long-running stress and memory measurements remain separate evidence requirements.

## Evidence — 2026-10-08

- Code HEAD `320ea4f778f706bb82ae49340a1158e9b45e4aae`.
- CI `37809070708`: **19 Vitest suites PASS**, TypeScript PASS, exact B-Rep smoke PASS, production build PASS, Chrome critical journey PASS.
- Constitution `37809071594`: governance + dependency sovereignty **PASS**.
- Chrome: duplicate STEP + same-task calibration edit caused **no obsolete STEP download**; clean subsequent STEP and Aligned Split 3MF both PASS.
- Chrome: prior STEP PASS label disappears immediately after canonical project edit. Existing Save/Open (including out-of-order reads), Undo/Redo, Recovery and Offline regression PASS.
- Chrome navigation 5 samples P50 69.0ms/P95 123.9ms; STEP single observation 347ms; aligned split single 774ms. These are CI runner measurements, **not** guarantees for end-user machines.
- Sanitized CI artifact `cad-browser-performance` ID `11564446290`. Does not include CAD geometry, projects or prompts.

Remaining long-run memory / high-vertex stress and physical-slicer validation must retain distinct gates; this release does not claim those checks were performed.
