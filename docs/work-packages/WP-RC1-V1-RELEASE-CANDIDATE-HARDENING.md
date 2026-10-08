# WP-RC1 — CAD_CAM_3D v1 Release Candidate Hardening

Status: **ACTIVE**
Target: **v1.0.0 local-first production candidate**

## Product boundary

v1 is a local-first AI-assisted parametric CAD workspace for small functional 3D-printable parts.

The release-critical job is:

```text
idea / bounded text command / manual sketch
  → editable parametric feature history
  → exact rebuild when required
  → manufacturing readiness
  → optional exact split + registration alignment
  → Save/Open/Recovery
  → STL / STEP / Core 3MF
```

## In-scope release capabilities

- versioned `CadProject` schema + migrations through v13;
- Line/Circle/Arc/rectangle sketch foundations and deterministic constraints;
- durable planar face attachment;
- Extrude, Pad, Pocket, Hole, Cut;
- Fillet, Chamfer, inward Shell;
- Linear Pattern, Mirror, Datum Axis, additive Revolve;
- durable topology references with fail-closed ambiguity behavior;
- exact OpenCascade B-Rep path plus lightweight preview path;
- STL, STEP, single-object 3MF;
- exact split multi-object 3MF;
- single-axis registration-only aligned split 3MF;
- persisted registration clearance calibration;
- bounded AI command Preview → Commit/Cancel;
- local Save/Open, autosave Recovery, offline production shell;
- bounded Undo/Redo of canonical project state;
- component-catalog semantic foundation;
- optional Application Management boundary without CAD data ownership.

## Explicit v1 non-goals

The following are not required to call v1 complete and must remain truthful limitations:

- full nonlinear sketch solver;
- curved-surface sketch attachment;
- Sweep/Loft;
- nested-island/multi-body modeling semantics;
- structural-joint analysis;
- slicer-equivalent support calculation;
- Bambu-specific project metadata;
- mandatory cloud/account/billing/collaboration;
- remote AI dependency.

These remain post-v1 roadmap items unless a release blocker proves otherwise.

## Autonomous verification authority

On 2026-10-08 the Product Owner authorized completion without further routine intervention and requested automatic checking when uncertain.

Therefore intermediate manual spot-check gates may be replaced by reproducible automated evidence where technically possible. No automated result may be described as human observation.

The same Product Owner message grants conditional merge and Production authority **only after the final exact revision passes the release gates below**.

## RC gates

### RC-A — Canonical correctness

- typecheck;
- unit regression;
- schema migration regression;
- deterministic rebuild tests;
- exact B-Rep smoke suite;
- export preflight tests;
- no weakened/skipped required test.

### RC-B — State safety

- bounded Undo/Redo;
- Open/Recover/Reset start a clean history;
- async manufacturing evidence is bound to its input project and stale results fail closed;
- save/open schema v13 round-trip;
- recovery still uses the normal parser/migration chain.

### RC-C — Manufacturing truth

- build-volume/orientation analysis;
- exact split volume conservation;
- aligned split full-material corridor verification;
- registration calibration drives pocket clearance;
- no structural/slicer/Bambu parity overclaim.

### RC-D — Offline / dependency sovereignty

- production build contains JS/CSS/exact WASM;
- service worker/offline manifest smoke passes;
- no mandatory remote account/provider for core path;
- no new paid/essential runtime dependency.

### RC-E — Release resilience

- release revision recorded;
- deterministic production build from that revision;
- Production deployment happens only after CI success for the same main revision;
- rollback procedure documented;
- prior release commit remains recoverable.

### RC-F — Product UX evidence

Previously human-accepted:
- flat Split 3MF;
- Aligned Split 3MF.

For later RC changes, automated evidence is permitted by Product Owner delegation, but must be labeled automated. No claim is made that an unobserved browser behavior was manually witnessed.

## Merge / Production rule

Do not merge or publish from the feature branch merely because one CI run is green.

Sequence:

1. finish RC implementation;
2. all branch gates green;
3. mark PR ready;
4. merge exact reviewed head;
5. CI must pass on resulting `main` exact revision;
6. Production Pages workflow deploys that exact successful main revision;
7. verify deployment workflow conclusion and record release evidence.

If main CI fails, Production must not deploy.

## Rollback

Normal rollback is a revert on `main` to the previously known-good release state, followed by the same CI → Production deployment path. Do not force-push user history for a routine rollback.

## Exit criteria

v1.0.0 is complete when the exact main revision has:
- all RC gates PASS with evidence;
- production deployment PASS;
- PR/release docs record the exact revision;
- no known release-blocking regression.

## Ratified v1 regression budgets

Budgets were set **after** measurement, not invented as PASS criteria.

Measured CI baseline on 2026-10-08:
- production assets total: 22.148 MiB;
- JavaScript: 0.937 MiB;
- CSS: 0.015 MiB;
- exact OCCT WASM: 21.197 MiB;
- browser navigation p95: 357.8 ms across five CI samples;
- browser exact STEP export: 992 ms;
- browser aligned split 3MF: 885 ms.

v1 CI regression guards:
- total assets <= 28 MiB;
- JavaScript <= 1.25 MiB;
- CSS <= 0.10 MiB;
- exact WASM <= 24 MiB;
- navigation p95 <= 1500 ms;
- STEP <= 10 s;
- aligned split <= 15 s.

These are CI regression budgets with deliberate variance headroom. They are not public end-user SLAs.
