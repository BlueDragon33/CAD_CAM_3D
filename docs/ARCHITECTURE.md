# Architecture

## Product boundary

CAD_CAM_3D targets small functional printable parts with editable parametric intent rather than reproducing every enterprise-CAD function at once.

## Layer model

```text
User intent / sketch / measurements
              |
              v
       Interaction layer
   UI + command interpretation
              |
              v
       Parametric model
 sketch -> constraints -> features
              |
              v
       Semantic rebuild layer
              |
       +------+------------------+
       |                         |
       v                         v
Fast mesh kernel          Exact B-Rep kernel
 mesh-mvp-v1              occt-wasm-v5 (lazy)
       |                         |
       v                         v
simple preview/STL       exact preview / STEP / STL
                               + topology evolution
                               + oriented face tools
                               + Fillet / Chamfer
                               + durable refs
       |                         |
       +------------+------------+
                    v
          Manufacturing rules
        printer/material/process
```

## Core rules

1. `CadProject` is the source of truth; UI state and kernel handles are not geometry data.
2. Features are ordered and rebuildable; upstream parameter changes rebuild downstream geometry.
3. Semantic feature history is independent from both geometry kernels.
4. AI emits validated structured operations against the same feature tree.
5. Manufacturing rules stay outside the geometry kernels.
6. Capability flags describe only integrations that actually work.
7. Durable topology references may contain semantic ancestry and geometry signatures, never raw kernel handles/hashes.
8. Preview and export must choose a kernel capable of representing every enabled feature.
9. A sketch loop must pass application-level profile validation before either kernel may use it as manufacturing geometry.
10. Profile promotion is explicit and preview/STL/STEP must consume the same resolved manufacturing profile.

## Dual-kernel strategy

`mesh-mvp-v1` handles simple direct profile extrusion and lightweight STL quickly. `occt-wasm-v5` is lazy-loaded for exact topology, exact edge treatments, oriented face features, STEP, adaptive STL and promoted-profile Boolean operations.

`src/cad/project-analysis.ts` promotes models automatically when the fast kernel would be incomplete. Current exact triggers include Fillet, Chamfer, non-horizontal face-bound Hole/Cut, and Hole/Cut on a promoted sketch profile.

### Lightweight path

- deterministic rectangle or promoted Line-loop/Circle extrusion;
- legacy rectangle global vertical through Hole/Cut;
- horizontal rectangle face-bound Hole/Cut through cached X/Z;
- direct STL + mesh preflight.

### Exact path

- ordered OpenCascade B-Rep reconstruction;
- rectangle or promoted Line-loop/Circle base solid;
- global and oriented face-bound Hole/Cut;
- promoted-profile Hole/Cut Boolean handling;
- selected-edge and four-edge-preset Fillet;
- selected-edge and four-edge-preset Chamfer;
- topology evolution through Hole/Cut/Fillet/Chamfer;
- exact face/edge picking and durable reference resolution;
- exact preview tessellation;
- adaptive STL + preflight;
- STEP.

The four-outer-vertical-edge preset remains rectangle-specific. Promoted profiles should use explicit exact-edge selection for Fillet/Chamfer.

## Sketch pipeline

The sketcher separates editable geometry, construction geometry and the active manufacturing profile:

```text
Line / Circle / Arc
      ↓
deterministic constraints
      ↓
closed-loop/profile validation
      ↓
explicit `Use candidate as profile`
      ↓
semantic ManufacturingProfile
      ↓
mesh + exact-kernel parity
```

`src/cad/profile.ts` currently recognizes one simple closed Line loop or one Circle. It checks endpoint closure, connected components, vertex degree, area, perimeter, winding, repeated vertices, open/branched geometry, multiple loops and non-adjacent self-intersections.

Schema v5 already persists each sketch entity's `construction` flag, so profile promotion reuses that durable distinction instead of changing the file format solely for selection state. `construction: false` marks membership in the active manufacturing profile; zero non-construction entities means the named width/depth rectangle is active.

If a promoted profile becomes invalid after editing, semantic rebuild blocks the solid rather than silently reverting to another profile. `scripts/profile-parity-smoke.mjs` gates representative Line-loop and Circle extrusion against both Three.js and OpenCascade dimensions/volume.

See `docs/SKETCH_PROFILE.md`.

## Topology references

`EdgeTopologyRef` stores adjacent face-lineage IDs plus edge curve kind, length, midpoint and endpoints. Both Fillet and Chamfer consume this same durable reference model.

`FaceTopologyRef` stores face lineages, centroid, normal and area. Hole/Cut store local U/V coordinates and rebuild a deterministic face-local frame at execution time.

References are resolved against topology immediately before the owning feature executes. Ambiguous references are rejected instead of retargeting silently.

## Oriented through-feature path

```text
FaceTopologyRef + local U/V
          ↓
resolve current exact face
          ↓
rebuild local frame
          ↓
point = origin + U*u + V*v
axis  = resolved face normal
          ↓
rotate + translate canonical tool
          ↓
OCCT through Boolean
```

For the named rectangle, manufacturing binding accepts descendants of the six planar base-extrusion faces. Promoted arbitrary profile sides are currently not assigned rectangle side roles; top/bottom remain usable while curved or arbitrary side surfaces stay inspection-first until richer surface lineage is added.

## Project persistence

Current editable project schema is v5.

Migration chain:
- v1: legacy Fillet selection + global Hole/Cut;
- v2: durable edge references for Fillet;
- v3: durable face references + local U/V Hole/Cut;
- v4: Chamfer using durable edge references;
- v5: persisted Line/Circle/Arc entities, entity constraints and durable construction/manufacturing membership.

The loader accepts v1-v5 and validates supported fields before a project enters the workspace.

Project JSON, B-Rep and manufacturing files remain owned by CAD_CAM_3D and are not mirrored into Quản trị Ứng dụng.

## Planned modules

- mixed Line/Arc manufacturing loops;
- nested loops and holes;
- richer promoted-profile side-face lineage and placement;
- arbitrary planar sketches;
- Shell and richer exact surface metadata;
- pattern/revolve/loft/sweep after sketch-profile foundations are stronger;
- sectioning and measurement;
- AI planner producing validated feature operations;
- component catalog for electronics/robotics;
- manufacturing intelligence for tolerance, wall, bridging, orientation and split logic;
- 3MF workflow.

## Current foundation

The project now supports deterministic feature history, schema-v5 persistence with migration, constrained interactive Line/Circle/Arc sketch entities, closed-profile validation, explicit Line-loop/Circle manufacturing-profile promotion, mesh/OpenCascade parity gating, lightweight and exact preview/STL paths, STEP, topology evolution, durable face/edge references, oriented planar-face Hole/Cut, exact Fillet and exact Chamfer.

The next sketch/manufacturing milestone is mixed Line+Arc closed profiles and nested-loop hole classification, while the exact-kernel track should strengthen side-face semantic lineage for arbitrary promoted profiles.
