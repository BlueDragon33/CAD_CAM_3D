# Roadmap

The roadmap progresses from a general system into deep domain workflows. Each stage must remain useful and evidence-backed before the next stage expands scope. “100-floor ready” means future capacity, not speculative layers.

## Foundation — established

- Web engineering workspace shell.
- Versioned parametric project schema and migration chain.
- 3D viewport and exact topology selection.
- Ordered semantic feature history.
- Local-first save/open plus browser recovery foundation.
- Managed-client boundary under Quản trị Ứng dụng without surrendering CAD data ownership.
- Century-grade B4 project blueprint, constitutional adoption and dependency budget.

Exit evidence: repository builds cleanly; canonical CAD meaning is separated from UI/providers; local project ownership remains explicit.

## Exact CAD core — established foundation

- OpenCascade/WASM behind the exact geometry path.
- Sketch primitives: Line, Circle, Arc and rectangle convenience.
- Constraint diagnostics and deterministic application-level solve.
- Base and attached planar Sketch.
- Extrude, Pad, Pocket, Hole, Cut.
- Fillet, Chamfer and inward Shell.
- Linear Pattern and Mirror for the accepted narrow source-feature scope.
- Durable Datum Axis.
- Exact additive Revolve.
- Durable FaceTopologyRef / EdgeTopologyRef and topology evolution.
- STEP + STL export.
- Deterministic rebuild from project JSON.

Current project schema: v13 with explicit legacy migrations and persisted registration-fit calibration.

Next breadth: Sweep/Loft and broader datum/path semantics only after their contracts can be added without weakening topology/persistence truth.

## Printable-part intelligence — established v1 foundation

Implemented foundations:

- configurable printer/material/nozzle profile;
- adaptive final-geometry readiness path;
- exact final dimensions for exact-only projects;
- build-volume fit plus all 90° axis-aligned orientation permutations;
- split-required recommendation when no axis-aligned orientation fits;
- nozzle-relative small-Hole and Shell-wall heuristics;
- geometry-based downward-overhang heuristic with build-plane exclusion;
- STL manufacturing coordinate correction to slicer Z-up;
- portable local Core 3MF with explicit millimeter units;
- STEP;
- exact/lightweight adaptive export path.

Next automated depth:

- clearance and interference heuristics;
- richer wall/thickness analysis where exact surface evidence supports it;
- bridge/orientation scoring;
- explicit split planning with alignment/fastening strategy as its own Work Package;
- richer 3MF metadata only when CAD has canonical data to support it.

Exit gate: a real functional part receives understandable, actionable warnings and exports correctly to the declared slicer workflow. Heuristics must remain labeled as heuristics.

## AI engineering layer — bounded v1 foundation

Implemented:

- deterministic text grammar → typed design proposal;
- proposal preview is non-mutating;
- project fingerprint and exact-topology selection fingerprint protect against stale commit;
- explicit Commit/Cancel;
- normal `CadProject`/feature creation remains the only mutation path;
- unsupported language remains non-mutating.

Next:

- richer typed operation vocabulary;
- structured multi-operation plan with transaction/rollback semantics;
- feature-repair suggestions;
- component/manufacturing-aware design proposals;
- optional model-provider adapter only after privacy/dependency budget review.

AI may assist but may not become canonical CAD state, authorization or Production authority.

## Component/domain intelligence — semantic v1 foundation

Implemented:

- stable component ID + revision contract;
- mechanical envelope;
- mounting holes;
- keep-out / connector / cable clearance volumes;
- provenance;
- optional mass/fastener/tags;
- offline local provider and strict JSON import validation;
- synthetic tests clearly separated from real manufacturer data.

Next:

- authoritative verified packs for electronics/robotics parts;
- stable project-reference/update policy;
- enclosure/mount workflows that create editable parametric features rather than fixed meshes.

Priority domains:

- electronics boards and housings;
- fasteners, inserts and bearings;
- carbon/aluminium tubes;
- motors/servos;
- batteries;
- GPS/cameras/LiDAR/antennas;
- UAV/UGV/USV mounts and serviceable interfaces.

## Local-first resilience — v1 foundation

Implemented:

- explicit versioned Save/Open;
- bounded local recovery snapshots;
- restore through normal validation/migration;
- production-only service worker;
- build-generated offline asset manifest;
- app shell, JS/CSS and exact-kernel WASM included in offline production cache;
- no external PWA dependency.

Next:

- browser human acceptance for recovery/offline journeys;
- stronger filesystem/IndexedDB recovery provider if project-size evidence requires it;
- desktop/PWA packaging only when it materially improves filesystem, performance or distribution.

## Commercial multi-user platform — intentionally deferred

Do **not** build billing/account/cloud collaboration merely to appear commercial.

Adopt only when the core product is demonstrably worth paying for. When activated, preserve:

`Identity != Authorization != Entitlement != CAD Project Ownership != Production Authority`.

Future commercial adapters may include identity, normalized entitlements, seat/device licensing, optional sync and collaboration. Local project ownership, portability and degraded behavior remain contractual requirements.

## v1 release candidate — active

The Product Owner authorized autonomous completion on 2026-10-08, including automatic investigation/fix/retest of uncertain behavior and conditional merge/Production after exact-revision release evidence passes.

The v1 release candidate now prioritizes:

- canonical project/state safety, including bounded Undo/Redo;
- schema v13 migration and reproducible print-fit calibration;
- stale async-evidence protection;
- exact export/manufacturing regressions;
- offline/local-first integrity;
- release/rollback automation;
- exact-revision main CI before Production deployment.

See `docs/work-packages/WP-RC1-V1-RELEASE-CANDIDATE-HARDENING.md`.

Post-v1 breadth such as Sweep/Loft, curved-surface sketching and cloud commercial infrastructure remains intentionally deferred rather than blocking a truthful usable v1.
