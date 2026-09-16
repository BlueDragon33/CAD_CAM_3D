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
                               + sketch-entity face lineage
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
9. A sketch region must pass application-level validation before either kernel may use it as manufacturing geometry.
10. Profile promotion is explicit and preview/STL/STEP must consume the same resolved manufacturing region.
11. Ambiguous nested topology is rejected rather than silently assigned Boolean meaning.
12. Exact base side faces are anchored to their originating sketch entity whenever the surface can be matched safely.

## Dual-kernel strategy

`mesh-mvp-v1` handles direct profile extrusion and lightweight STL quickly. `occt-wasm-v5` is lazy-loaded for exact topology, exact edge treatments, oriented face features, STEP, adaptive STL and promoted-profile Boolean operations.

`src/cad/project-analysis.ts` promotes models automatically when the fast kernel would be incomplete. Current exact triggers include Fillet, Chamfer, non-horizontal face-bound Hole/Cut, and Hole/Cut on a promoted sketch profile.

### Lightweight path

- deterministic rectangle, Line-loop, Circle, mixed Line+Arc, or one-region-with-holes extrusion;
- region outer contour -> `THREE.Shape`;
- region direct inner loops -> `Shape.holes`;
- legacy rectangle global vertical through Hole/Cut;
- horizontal rectangle face-bound Hole/Cut through cached X/Z;
- direct STL + mesh preflight.

### Exact path

- ordered OpenCascade B-Rep reconstruction;
- rectangle, Line-loop, Circle, mixed Line+Arc or classified region base solid;
- region outer prism minus overrun hole prisms;
- semantic base-face roles from originating outer/hole Line/Arc/Circle sketch entities;
- global and oriented face-bound Hole/Cut;
- promoted planar Line-side Hole/Cut binding;
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

The sketcher separates editable geometry, construction geometry and the active manufacturing region:

```text
Line / Circle / Arc
      ↓
deterministic constraints
      ↓
closed-loop extraction
      ↓
region classification
      ↓
explicit `Use candidate as profile`
      ↓
semantic ManufacturingProfile / ManufacturingRegionProfile
      ↓
mesh + exact-kernel parity
```

`src/cad/profile.ts` extracts simple closed Line loops, Circles and mixed Line+Arc loops. It orders Line/Arc edges into deterministic traversal and records signed Arc sweep so an Arc can be consumed forward or reversed without rewriting persisted sketch intent.

`src/cad/profile-region.ts` classifies multiple valid loops. The enabled region model is intentionally narrow: exactly one depth-0 outer contour plus zero or more depth-1 direct holes. Pairwise touching/intersection, multiple outer islands and nesting depth greater than one are rejected.

Profile validation checks endpoint closure, connected components, vertex degree, exact line/arc perimeter, signed area/winding, repeated vertices, open/branched geometry and sampled non-adjacent self-intersections for curved paths. Region validation then adds pairwise loop intersection checks and containment-depth classification.

Schema v5 already persists each sketch entity's `construction` flag, so profile promotion reuses that durable distinction instead of changing the file format solely for selection state. `construction: false` marks membership in the active manufacturing region; zero non-construction entities means the named width/depth rectangle is active.

If a promoted region becomes invalid after editing, semantic rebuild blocks the solid rather than silently reverting to another profile. `scripts/profile-parity-smoke.mjs` gates single-loop Line/Circle/Line+Arc extrusion; `scripts/region-parity-smoke.mjs` gates one outer contour with multiple holes against Three.js/OpenCascade bounds and volume.

See `docs/SKETCH_PROFILE.md`.

## Topology references

`EdgeTopologyRef` stores adjacent face-lineage IDs plus edge curve kind, length, midpoint and endpoints. Both Fillet and Chamfer consume this same durable reference model.

`FaceTopologyRef` stores face lineages, centroid, normal and area. Hole/Cut store local U/V coordinates and rebuild a deterministic face-local frame at execution time.

Exact base lineage now uses semantic roles tied to sketch entities, for example:

```text
<extrude-id>:side:outer:line:<entity-id>
<extrude-id>:side:outer:arc:<entity-id>
<extrude-id>:side:hole:1:line:<entity-id>
<extrude-id>:side:hole:2:circle:<entity-id>
```

Line-derived side faces are known planar surfaces and may participate in the existing face-local Hole/Cut workflow. Arc/Circle side faces receive durable ancestry for selection/remapping but remain inspection-only for face-bound manufacturing operations until cylindrical local coordinates are implemented.

References are resolved against topology immediately before the owning feature executes. Ambiguous references are rejected instead of retargeting silently. See `docs/TOPOLOGY_LINEAGE.md`.

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

For the named rectangle, manufacturing binding accepts descendants of the six planar base-extrusion faces. Promoted regions additionally allow planar side faces generated by Line sketch entities, including direct inner-hole Line walls. Curved Arc/Circle side surfaces remain inspection-first because they require a cylindrical surface-parameter model rather than the planar U/V frame.

## Project persistence

Current editable project schema is v5.

Migration chain:
- v1: legacy Fillet selection + global Hole/Cut;
- v2: durable edge references for Fillet;
- v3: durable face references + local U/V Hole/Cut;
- v4: Chamfer using durable edge references;
- v5: persisted Line/Circle/Arc entities, entity constraints and durable construction/manufacturing membership.

The loader accepts v1-v5 and validates supported fields before a project enters the workspace. Multi-loop region membership and side-face semantic lineage reuse schema-v5 entity IDs/flags, so no file-format bump is required for these milestones.

Project JSON, B-Rep and manufacturing files remain owned by CAD_CAM_3D and are not mirrored into Quản trị Ứng dụng.

## Planned modules

- arbitrary planar sketch attachment via durable face reference + local sketch frame;
- explicit nested islands / multi-body semantics;
- cylindrical-surface local coordinates for curved-face placement;
- Shell and richer exact surface metadata;
- pattern/revolve/loft/sweep after sketch-profile foundations are stronger;
- sectioning and measurement;
- AI planner producing validated feature operations;
- component catalog for electronics/robotics;
- manufacturing intelligence for tolerance, wall, bridging, orientation and split logic;
- 3MF workflow.

## Current foundation

The project now supports deterministic feature history, schema-v5 persistence with migration, constrained interactive Line/Circle/Arc sketch entities, closed-loop validation, explicit Line/Line+Arc/Circle region promotion, direct inner-hole classification, mesh/OpenCascade parity gating, sketch-entity semantic side-face lineage, planar promoted-side Hole/Cut binding, lightweight and exact preview/STL paths, STEP, topology evolution, durable face/edge references, oriented planar-face Hole/Cut, exact Fillet and exact Chamfer.

The next topology milestone is arbitrary planar sketch attachment using a durable face reference and local sketch plane. Nested islands should only be enabled together with explicit island/multi-body semantics.
