# Architecture

## Product boundary

CAD_CAM_3D is not intended to reproduce every enterprise-CAD feature. The core problem is to make small functional parts easy to design, modify and print while preserving editable parametric intent.

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
Interactive viewport       STEP / exact queries
+ STL printing path        + topology evolution
       |                         |
       |                   face/edge picking
       |                   + durable refs
       |                         |
       +------------+------------+
                    v
          Manufacturing rules
        printer/material/process
```

## Core rules

1. `CadProject` is the source of truth. UI state and kernel handles must not become the geometry model.
2. Features are ordered and rebuildable. Editing an upstream parameter must rebuild downstream geometry.
3. The semantic feature history is independent from both the lightweight mesh path and the exact B-Rep path.
4. AI produces structured operations against the same parametric model; it does not bypass the model by generating an opaque mesh.
5. Printer, material and design-for-manufacture rules live outside the geometry kernels.
6. UAV, USV, UGV, robotics and electronics intelligence are domain modules layered over the general core.
7. Capability flags describe application-level integrations that actually work; underlying library APIs are not advertised as product capabilities until wired and validated.
8. Durable topology references may contain application-level semantic ancestry and geometric signatures, but never raw kernel handles or runtime-only hashes.

## Dual-kernel strategy

`src/cad/kernel.ts` defines the lightweight application geometry boundary. The current `mesh-mvp-v1` kernel remains the active interactive path because continuous editing should not wait for a multi-megabyte WebAssembly CAD engine.

`src/cad/exact-kernel.ts` is the lazy exact path. It rebuilds the same semantic feature history with OpenCascade only when exact manufacturing interchange or exact topology inspection is requested.

Current lightweight path:

- deterministic preview mesh;
- real through holes and rectangular cuts;
- STL export and mesh preflight;
- cached global X/Z coordinates retained for the current horizontal face-bound Hole/Cut workflow;
- no claim of B-Rep topology or exact fillet geometry.

Current exact path:

- OpenCascade B-Rep reconstruction for the MVP feature chain;
- cylindrical and rectangular Boolean cuts;
- exact four-outer-edge Fillet preset;
- exact single-edge Fillet resolved from a persisted `EdgeTopologyRef`;
- exact horizontal top/bottom face-bound Hole/Cut resolved from a persisted `FaceTopologyRef` + local U/V placement;
- B-Rep validity, exact bounds, volume and area;
- tessellation with per-face topology groups;
- sampled exact B-Rep edge curves for viewport picking;
- click selection and highlighting for exact faces and edges;
- face-lineage propagation through `*WithHistory` Boolean/Fillet operations;
- conservative transient selection remapping after common parameter rebuilds;
- STEP export.

App-level chamfer, shell, arbitrary oriented side-face features and an exact-kernel STL switch remain disabled until integrated and tested. See `docs/EXACT_KERNEL.md`.

## Topology boundary

`src/cad/topology-selection.ts` maps OpenCascade tessellation groups back to exact B-Rep faces, samples exact B-Rep edges, stores compact transient selection signatures, and remaps active viewport selections after a rebuild.

`src/cad/topology-evolution.ts` tracks semantic face ancestry across ordered exact operations. Base extrusion faces receive stable semantic roles. Hole, Cut and Fillet operations propagate, modify, delete or introduce lineages using OCCT shape-history data.

`src/cad/topology-ref.ts` is the durable-reference boundary.

### Edge references

`EdgeTopologyRef` contains:

```text
adjacent face lineage IDs
capture point in feature history
curve kind
length
midpoint
endpoints
```

A topology-bound Fillet resolves the reference against the exact edge set immediately before that Fillet executes. Semantic adjacency is preferred; geometry is a conservative disambiguator. Ambiguous matches are rejected.

### Face references

`FaceTopologyRef` contains:

```text
face lineage IDs
capture point in feature history
centroid
normal
area
```

For the schema-v3 face placement path, a deterministic local frame is derived from the resolved face plane. Hole/Cut persist local `uMm`/`vMm` values and the exact kernel resolves the face again before executing the feature. The first integrated scope accepts only horizontal base top/bottom descendants so the fast mesh/STL and exact STEP paths remain geometrically consistent.

This solves two narrow end-to-end topology-reference workflows; it does not claim to solve the general topological-naming problem for arbitrary CAD histories.

## Project persistence

Editable project files use a versioned JSON envelope rather than serializing transient UI state.

```text
format: cad-cam-3d-project
schemaVersion: 3
savedAt: ISO timestamp
project: CadProject
```

Migration chain:

- v1 -> legacy Fillet selection + global Hole/Cut coordinates;
- v2 -> durable selected-edge Fillet references;
- v3 -> durable selected-face references + local U/V Hole/Cut placement.

The loader accepts v1, v2 and v3 and validates fields before a project can enter the workspace. Unsupported feature definitions, invalid dimensions, malformed constraints, malformed topology references and unknown schema versions are rejected instead of being silently coerced.

Project JSON remains local engineering data owned by CAD_CAM_3D. It is not mirrored into the central Quản trị Ứng dụng control-plane.

## Planned modules

- Sketcher: primitives, snapping, dimensions and constraints.
- Parametric feature history: extrude, cut, hole, fillet, chamfer, shell, pattern, revolve.
- Oriented side/angled-face Hole/Cut with tool-axis transforms in both kernels.
- Selected-edge Chamfer using the same durable edge-reference model.
- 3D viewport: sectioning, measurement and richer selection inspection.
- AI planner: natural language -> validated feature operations.
- Component catalog: electronics, fasteners, bearings, tubes and common robotics parts.
- Manufacturing intelligence: build-volume, nozzle, material, tolerance, wall, bridging and orientation checks.
- Export pipeline: STEP for editable interchange; STL/3MF for printing.

## Current foundation

The project now has a deterministic semantic feature chain, a fast shared mesh path for preview/STL, schema-v3 project persistence with v1/v2 migration, a separately lazy-loaded exact OpenCascade B-Rep path for STEP, exact face/edge picking, topology evolution, durable selected-edge Fillet and the first durable selected-face Hole/Cut placement workflow.

The next core milestone is the oriented-tool path for side/angled faces, followed by selected-edge Chamfer and a stronger general sketcher, without coupling the UI to either kernel implementation.
