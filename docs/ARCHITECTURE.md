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
       |                   + durable edge refs
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
- no claim of B-Rep topology or exact fillet geometry.

Current exact path:

- OpenCascade B-Rep reconstruction for the MVP feature chain;
- cylindrical and rectangular Boolean cuts;
- exact four-outer-edge Fillet preset;
- exact single-edge Fillet resolved from a persisted topology reference;
- B-Rep validity, exact bounds, volume and area;
- tessellation with per-face topology groups;
- sampled exact B-Rep edge curves for viewport picking;
- click selection and highlighting for exact faces and edges;
- face-lineage propagation through `*WithHistory` Boolean/Fillet operations;
- conservative transient selection remapping after common parameter rebuilds;
- STEP export.

App-level chamfer, shell, face-bound features and an exact-kernel STL switch remain disabled until they are integrated and tested. See `docs/EXACT_KERNEL.md`.

## Topology boundary

`src/cad/topology-selection.ts` maps OpenCascade tessellation groups back to exact B-Rep faces, samples exact B-Rep edges, stores compact transient selection signatures, and remaps active viewport selections after a rebuild.

`src/cad/topology-evolution.ts` tracks semantic face ancestry across ordered exact operations. Base extrusion faces receive stable semantic roles. Hole, Cut and Fillet operations propagate, modify, delete or introduce lineages using OCCT shape-history data.

`src/cad/topology-ref.ts` is the durable-reference boundary. The first persisted reference type is `EdgeTopologyRef`, which contains:

```text
adjacent face lineage IDs
capture point in the feature history
curve kind
length
midpoint
endpoints
```

It deliberately excludes OCCT handles and runtime hashes. During an exact rebuild, a topology-bound Fillet resolves its reference against the exact edge set that exists immediately before that Fillet executes. Semantic adjacency is preferred; geometry is used as a conservative disambiguator. Ambiguous matches are rejected.

This solves the first narrow end-to-end topology-reference workflow; it does not claim to solve the general topological-naming problem for arbitrary CAD histories.

## Project persistence

Editable project files use a versioned JSON envelope rather than serializing transient UI state.

```text
format: cad-cam-3d-project
schemaVersion: 2
savedAt: ISO timestamp
project: CadProject
```

Schema v2 can persist topology-bound Fillets. The loader still accepts schema v1 and migrates the legacy `outer-vertical-edges` Fillet selection into the explicit v2 preset representation.

Loading is validated field-by-field before a project can enter the workspace. Unsupported feature definitions, invalid dimensions, malformed constraints, malformed topology references and unknown schema versions are rejected instead of being silently coerced.

Project JSON remains local engineering data owned by CAD_CAM_3D. It is not mirrored into the central Quản trị Ứng dụng control-plane.

## Planned modules

- Sketcher: primitives, snapping, dimensions and constraints.
- Parametric feature history: extrude, cut, hole, fillet, chamfer, shell, pattern, revolve.
- Persisted face references + face-local coordinate frames for Hole/Cut.
- Selected-edge Chamfer using the same durable reference model.
- 3D viewport: sectioning, measurement and richer selection inspection.
- AI planner: natural language -> validated feature operations.
- Component catalog: electronics, fasteners, bearings, tubes and common robotics parts.
- Manufacturing intelligence: build-volume, nozzle, material, tolerance, wall, bridging and orientation checks.
- Export pipeline: STEP for editable interchange; STL/3MF for printing.

## Current foundation

The project now has a deterministic semantic feature chain, a fast shared mesh path for preview/STL, schema-v2 project persistence with v1 migration, a separately lazy-loaded exact OpenCascade B-Rep path for STEP, exact face/edge picking, topology evolution, and the first durable selected-edge feature workflow: select an exact edge -> create Fillet -> save/reload -> modify upstream dimensions -> resolve and reapply the intended exact edge Fillet.

The next core milestone is persisted face references and face-local feature placement for Hole/Cut, followed by a stronger general sketcher, without coupling the UI to either kernel implementation.
