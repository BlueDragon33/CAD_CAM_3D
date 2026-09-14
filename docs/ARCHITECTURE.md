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
Simple preview/STL       exact preview / STEP / STL
                               + topology evolution
                               + oriented face tools
                               + face/edge picking
                               + durable refs
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
9. Preview and manufacturing export must use a geometry path capable of representing every enabled feature; silent lightweight approximations are not acceptable.

## Dual-kernel strategy

`src/cad/kernel.ts` defines the lightweight application geometry boundary. `mesh-mvp-v1` remains the preferred path for simple vertical Sketch/Extrude/Hole/Cut work because continuous editing should not wait for a multi-megabyte WebAssembly CAD engine.

`src/cad/exact-kernel.ts` is the lazy exact path. It rebuilds the same semantic feature history with OpenCascade when exact topology, exact-only geometry, STEP or adaptive STL is required.

`src/cad/project-analysis.ts` decides when the lightweight path is insufficient. Enabled Fillet features and non-horizontal face-bound Hole/Cut currently promote the default viewport and STL export to the exact kernel.

Current lightweight path:

- deterministic preview mesh;
- real vertical through holes and rectangular cuts;
- direct STL export and mesh preflight;
- horizontal face-bound Hole/Cut remains representable through cached X/Z coordinates;
- no claim of B-Rep topology or exact Fillet geometry.

Current exact path:

- OpenCascade B-Rep reconstruction for the semantic feature chain;
- global cylindrical and rectangular Boolean cuts;
- oriented through Hole/Cut on supported planar top/bottom/side face descendants;
- tool-axis rotation from the resolved face-local frame;
- exact four-outer-edge Fillet preset;
- exact single-edge Fillet resolved from a persisted `EdgeTopologyRef`;
- face-local Hole/Cut resolved from a persisted `FaceTopologyRef` + local U/V placement;
- B-Rep validity, exact bounds, volume and area;
- tessellation with per-face topology groups;
- sampled exact B-Rep edge curves for viewport picking;
- click selection and highlighting for exact faces and edges;
- face-lineage propagation through `*WithHistory` Boolean/Fillet operations;
- conservative transient selection remapping after common parameter rebuilds;
- STEP export;
- exact-tessellation STL export when the project requires exact geometry.

App-level Chamfer, Shell, curved-surface drilling and arbitrary interactive sketch planes remain disabled until integrated and tested. See `docs/EXACT_KERNEL.md`.

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

A deterministic local frame is derived from the resolved face plane. Hole/Cut persist local `uMm` / `vMm` values and the exact kernel resolves the face again before executing the feature. The resolved normal is aligned to the persisted reference orientation so local coordinates do not mirror after ordinary Boolean rebuilds.

The current manufacturing binding accepts descendants of the six planar base-extrusion faces: top, bottom, ±X sides and ±depth sides. This covers orthogonal side drilling today and gives the oriented-tool layer the correct math for future non-orthogonal planar faces once the feature vocabulary can generate them. Cylindrical Hole walls and curved Fillet faces remain inspection-only.

This is a practical pair of end-to-end topology-reference workflows; it does not claim to solve the general topological-naming problem for arbitrary CAD histories.

## Oriented through-feature path

`src/cad/oriented-tool.ts` converts application-space U/V/normal vectors into the OCCT coordinate convention, derives a deterministic axis-angle rotation, and transforms canonical cylinder/box tools onto the resolved face frame.

Through tools are longer than twice the part diagonal and centered at the selected face point. This guarantees that a Boolean traverses the whole current part even if the face normal points outward rather than inward.

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
canonical cylinder/box
          ↓
rotate + translate
          ↓
OCCT through Boolean
```

## Preview and manufacturing parity

Simple projects remain on `mesh-mvp-v1`. Exact-only projects automatically use OpenCascade tessellation in the default viewport. Adaptive STL follows the same decision and runs the standard STL manifold/finite-coordinate preflight on the exact tessellation before download.

This means a side-face Hole, side-face Cut or exact Fillet is no longer omitted from the default manufacturing mesh simply because the lightweight kernel cannot express it.

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

- Sketcher: primitives, snapping, dimensions, constraints and arbitrary planar sketch support.
- Parametric feature history: extrude, cut, hole, fillet, chamfer, shell, pattern, revolve.
- Selected-edge Chamfer using the same durable edge-reference model.
- Surface-type persistence before curved-surface feature placement is enabled.
- 3D viewport: sectioning, measurement and richer selection inspection.
- AI planner: natural language -> validated feature operations.
- Component catalog: electronics, fasteners, bearings, tubes and common robotics parts.
- Manufacturing intelligence: build-volume, nozzle, material, tolerance, wall, bridging and orientation checks.
- Export pipeline: STEP for editable interchange; STL/3MF for printing.

## Current foundation

The project now has a deterministic semantic feature chain, a lightweight mesh path for simple preview/STL, schema-v3 persistence with v1/v2 migration, a lazy OpenCascade exact path for topology/STEP/exact STL, durable selected-edge Fillet, durable selected-face Hole/Cut, and oriented through-feature tools for all supported planar base-face descendants including side faces.

The next core milestone is selected-edge Chamfer, followed by stronger general sketch interaction and arbitrary planar sketch generation without coupling the UI to either kernel implementation.
