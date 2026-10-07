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

Current project schema: v12 with explicit legacy migrations.

Next breadth: Sweep/Loft and broader datum/path semantics only after their contracts can be added without weakening topology/persistence truth.

## Printable-part intelligence — active

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

## AI engineering layer — bounded foundation active

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

## Component/domain intelligence — semantic foundation active

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

## Local-first resilience — automated foundation active

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

## Human acceptance gate — current next gate

Automated engineering has now changed several critical product journeys:

- design command changed from immediate mutation to Preview → Commit/Cancel;
- manufacturing readiness gained adaptive exact analysis and orientation/overhang advice;
- 3MF was added;
- recovery was added;
- production offline behavior was added.

Before these surfaces are treated as **commercial/release-quality UX**, the Product Owner must perform a real browser journey and confirm that the interaction hierarchy is understandable and worth keeping. CI success proves implementation integrity, not premium usability.

After this human UX gate, continue automatically into the next justified manufacturing/component Work Packages. Merge and Production remain separate explicit authorities.
