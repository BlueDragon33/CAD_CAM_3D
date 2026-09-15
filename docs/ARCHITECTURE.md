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
10. Profile promotion must preserve preview/STL/STEP parity.

## Dual-kernel strategy

`mesh-mvp-v1` handles simple vertical Sketch/Extrude/Hole/Cut work and direct STL quickly. `occt-wasm-v5` is lazy-loaded for exact topology, exact edge treatments, oriented face features, STEP and adaptive STL.

`src/cad/project-analysis.ts` promotes models automatically when the fast kernel would be incomplete. Current exact triggers include Fillet, Chamfer and non-horizontal face-bound Hole/Cut.

### Lightweight path

- deterministic preview mesh;
- global vertical through Hole/Cut;
- horizontal face-bound Hole/Cut through cached X/Z;
- direct STL + mesh preflight.

### Exact path

- ordered OpenCascade B-Rep reconstruction;
- global and oriented face-bound Hole/Cut;
- selected-edge and four-edge-preset Fillet;
- selected-edge and four-edge-preset Chamfer;
- topology evolution through Hole/Cut/Fillet/Chamfer;
- exact face/edge picking and durable reference resolution;
- exact preview tessellation;
- adaptive STL + preflight;
- STEP.

## Sketch pipeline

The sketcher now separates editable geometry from manufacturing-profile selection:

```text
Line / Circle / Arc
      ↓
deterministic constraints
      ↓
closed-loop/profile validation
      ↓
explicit profile promotion
      ↓
mesh + exact-kernel parity
```

`src/cad/profile.ts` validates future profile candidates without changing the current solid. It currently recognizes one simple closed Line loop or one Circle and checks endpoint closure, connected components, vertex degree, area, perimeter, winding, repeated vertices, open/branched geometry, multiple loops and non-adjacent self-intersections.

A candidate marked `promotable` is only ready for the next stage. The current manufacturing solid remains the centered named-parameter rectangle until a later schema explicitly selects the candidate and both kernels can extrude it identically. See `docs/SKETCH_PROFILE.md`.

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

Current manufacturing binding accepts descendants of the six planar base-extrusion faces. Curved Hole walls and Fillet/Chamfer surfaces remain inspection-only.

## Project persistence

Current editable project schema is v5.

Migration chain:
- v1: legacy Fillet selection + global Hole/Cut;
- v2: durable edge references for Fillet;
- v3: durable face references + local U/V Hole/Cut;
- v4: Chamfer using durable edge references;
- v5: persisted Line/Circle/Arc construction entities and entity constraints.

The loader accepts v1-v5 and validates supported fields before a project enters the workspace.

Project JSON, B-Rep and manufacturing files remain owned by CAD_CAM_3D and are not mirrored into Quản trị Ứng dụng.

## Planned modules

- explicit promotion of a validated Line-loop/Circle into the manufacturing profile with mesh/exact parity;
- mixed Line/Arc loops, nested loops and holes;
- arbitrary planar sketches;
- Shell and richer exact surface metadata;
- pattern/revolve/loft/sweep after sketch-profile foundations are stronger;
- sectioning and measurement;
- AI planner producing validated feature operations;
- component catalog for electronics/robotics;
- manufacturing intelligence for tolerance, wall, bridging, orientation and split logic;
- 3MF workflow.

## Current foundation

The project now supports a deterministic feature history, schema-v5 persistence with migration, constrained interactive Line/Circle/Arc sketch entities, closed-profile validation, lightweight and exact preview/STL paths, STEP, topology evolution, durable face/edge references, oriented planar-face Hole/Cut, exact Fillet and exact Chamfer.

The next core milestone is explicit manufacturing-profile promotion for one validated Line loop or Circle, with matching mesh and OpenCascade extrusion plus bounds/volume parity checks before expanding to arcs, multiple loops and arbitrary sketch planes.
