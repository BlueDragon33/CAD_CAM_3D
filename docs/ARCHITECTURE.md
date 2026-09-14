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
+ STL printing path        + topology snapshot
       |                         |
       |                   face/edge picking
       |                   + conservative remap
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
- cylindrical and rectangular boolean cuts;
- exact outer vertical-edge fillet for the current Fillet semantic;
- B-Rep validity, exact bounds, volume and area;
- tessellation with per-face topology groups;
- sampled exact B-Rep edge curves for viewport picking;
- click selection and highlighting for exact faces and edges;
- conservative face/edge remapping across common parameter rebuilds using geometry signatures;
- STEP export.

App-level chamfer, shell, durable project-level topology naming and an exact-kernel STL switch remain disabled until they are integrated and tested. See `docs/EXACT_KERNEL.md`.

## Topology boundary

Exact topology is transient runtime data. `src/cad/topology-selection.ts` maps OpenCascade tessellation groups back to exact B-Rep faces, samples exact B-Rep edges, stores compact selection signatures, and attempts conservative remapping after a rebuild.

A face selection contains a runtime hash plus centroid, normal and approximate triangulated area. An edge selection contains a runtime hash plus curve type, length, midpoint and endpoints. When a runtime hash survives a rebuild it is reused directly; otherwise geometry-signature scoring can preserve common selections after dimension edits. If confidence is too low, the selection is dropped rather than silently targeting the wrong topology.

This is deliberately not yet called durable topology naming. Persistent feature references such as “Fillet these exact user-selected edges” or “Place this hole on this selected face” require operation-history/evolution mapping before references are written into `CadProject`.

Kernel-specific handles, hashes, B-Rep objects and WebAssembly instances remain transient and never enter the project JSON schema.

## Project persistence

Editable project files use a versioned JSON envelope rather than serializing transient UI state.

```text
format: cad-cam-3d-project
schemaVersion: 1
savedAt: ISO timestamp
project: CadProject
```

Loading is validated field-by-field before a project can enter the workspace. Unsupported feature definitions, invalid dimensions, malformed constraints and unknown schema versions are rejected instead of being silently coerced.

Project JSON remains local engineering data owned by CAD_CAM_3D. It is not mirrored into the central Quản trị Ứng dụng control-plane.

## Planned modules

- Sketcher: primitives, snapping, dimensions and constraints.
- Parametric feature history: extrude, cut, hole, fillet, chamfer, shell, pattern, revolve.
- Exact-kernel topology evolution and durable feature references.
- 3D viewport: sectioning, measurement and richer selection inspection.
- AI planner: natural language -> validated feature operations.
- Component catalog: electronics, fasteners, bearings, tubes and common robotics parts.
- Manufacturing intelligence: build-volume, nozzle, material, tolerance, wall, bridging and orientation checks.
- Export pipeline: STEP for editable interchange; STL/3MF for printing.

## Current foundation

The project now has a deterministic semantic feature chain, a fast shared mesh path for preview/STL, validated project save/reload, a separately lazy-loaded exact OpenCascade B-Rep path for STEP, and real face/edge picking in the viewport. The next core milestone is to connect selected topology to feature creation through operation-history/evolution mapping, then expand the sketch/feature vocabulary without coupling the UI to either kernel implementation.
