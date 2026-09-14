# Exact B-Rep kernel

CAD_CAM_3D uses two geometry paths for different jobs.

## Interactive path

`mesh-mvp-v1` remains the default interactive kernel for simple vertical Sketch/Extrude/Hole/Cut work. It rebuilds the current semantic feature history into a deterministic printable mesh quickly enough for continuous viewport updates and direct STL export.

Projects that contain exact-only geometry are automatically promoted to the exact path. Current promotion triggers include enabled Fillet features and Hole/Cut features bound to non-horizontal planar faces. This prevents the viewport or STL export from silently omitting geometry that only OpenCascade can currently rebuild correctly.

## Exact manufacturing and topology path

`occt-wasm-v5` is lazy-loaded when exact topology, exact-only preview, STEP or adaptive STL is required. The exact path rebuilds the same semantic project into an OpenCascade B-Rep.

Current exact feature coverage:

- centered rectangular base profile;
- extruded solid;
- global vertical through cylindrical holes;
- global vertical through rectangular cuts;
- face-bound through Hole/Cut on supported planar descendants of all six base-extrusion faces;
- local U/V placement rebuilt from the resolved face plane;
- oriented tool axis rebuilt from the resolved face normal;
- outer vertical-edge Fillet preset;
- single selected-edge Fillet bound to a persisted `EdgeTopologyRef`;
- ordered execution of Hole / Cut / Fillet according to the semantic feature history;
- B-Rep validity check;
- exact bounding box, volume and surface area;
- B-Rep tessellation for inspection and adaptive STL export;
- exact face and edge picking;
- face-to-edge adjacency data;
- face lineage/evolution tracking through Boolean and Fillet operations;
- STEP export.

The exact path does **not** yet expose app-level Chamfer, Shell, general curved-surface drilling, arbitrary sketch planes or a full interactive sketcher. Angled planar faces are supported by the oriented-tool math once such faces exist in the feature vocabulary; the current base solid exposes top/bottom and orthogonal side planes.

## Topology identity

Raw OCCT shape handles and hashes are transient. The adapter keeps all face-related hash operations in the same `2147483647` hash domain used by OCCT tessellation groups so face picking, operation history and edge adjacency can be compared during one exact rebuild.

`src/cad/topology-evolution.ts` decodes OCCT `*WithHistory` streams and maintains semantic face lineages. Base extrusion faces are seeded with roles such as `top`, `bottom`, `side:+x`, `side:-x`, `side:+depth` and `side:-depth`. Each Hole, Cut or Fillet records its modified/generated/deleted face evolution. Faces introduced by an operation but not attributed to an input face receive a feature-owned lineage rather than becoming anonymous topology.

The final exact snapshot exposes runtime face hashes together with semantic lineage IDs. Exact edges also carry adjacent face hashes and adjacent face-lineage IDs. Transient viewport selection remapping uses this priority:

```text
runtime hash
    -> semantic face lineage
        -> conservative geometry signature
            -> drop selection if confidence is insufficient
```

This is a practical topology-evolution layer, not a claim that the general topological-naming problem is solved.

## Persisted edge references

Project schema v2 introduced `EdgeTopologyRef`. It deliberately stores no OCCT handle or runtime hash. The durable payload is semantic adjacent-face ancestry plus a compact edge geometry signature.

The first end-to-end topology-bound feature is Fillet:

```text
select exact edge
    -> Add Fillet
        -> persist EdgeTopologyRef
            -> edit upstream dimensions
                -> rebuild topology/evolution
                    -> resolve the intended edge
                        -> exact OpenCascade fillet
```

Weak or ambiguous matches are rejected instead of silently applying a feature to the wrong edge.

## Persisted face references and oriented local placement

Project schema v3 adds `FaceTopologyRef` and face-local placement for Hole/Cut. Schema v1 and v2 files remain loadable; older Hole/Cut features are migrated to explicit `global-xz` placement.

A face reference stores:

```text
kind: face
lineageIds[]
capturedAfterFeatureId
signature:
  centroid
  normal
  areaMm2
```

`src/cad/topology-ref.ts` builds a deterministic local frame for the referenced face. The frame origin is the world origin projected onto the face plane, U is the projected global X direction where possible, and V completes the right-handed in-plane frame. If tessellation orientation flips after a Boolean rebuild, the resolved normal is aligned back to the persisted reference normal before the local frame is rebuilt.

Current face workflow:

```text
click exact planar face at desired point
    -> Add Hole / Cut
        -> persist FaceTopologyRef + local U/V
            -> save/reload schema v3
                -> change upstream dimensions
                    -> rebuild topology evolution
                        -> resolve intended face conservatively
                            -> rebuild local frame
                                -> orient tool along face normal
                                    -> exact through Boolean
```

`src/cad/oriented-tool.ts` converts the application frame into the OCCT coordinate convention, derives a deterministic axis-angle rotation, and creates a through tool longer than twice the part diagonal. The tool is centered on the selected face point so the Boolean remains valid whether the resolved normal points inward or outward.

Current face binding deliberately accepts only faces whose lineage descends from one of the six planar base-extrusion faces. This safely covers top, bottom and all orthogonal side faces while rejecting cylindrical Hole walls and curved Fillet faces until persistent surface-type metadata is added.

## Preview and STL parity

`src/cad/project-analysis.ts` decides when a project requires exact geometry. Simple projects continue to use `mesh-mvp-v1`; oriented face features and Fillet promote the default viewport to the exact tessellation path.

STL export follows the same policy:

```text
simple vertical project
    -> mesh-mvp-v1
    -> STL

exact-only/oriented project
    -> OpenCascade B-Rep
    -> exact tessellation
    -> STL preflight
    -> STL
```

This keeps the rendered manufacturing geometry, STL and STEP semantics aligned instead of exporting the lightweight approximation for features it cannot represent.

## Feature order

Exact operations must follow the semantic feature tree. `rebuildProject()` exposes an ordered `operationSequence`; the exact kernel must not regroup all holes, all cuts and all fillets by type because Boolean results may be geometrically similar while topology ancestry differs.

A topology reference is resolved at the point in the ordered history where its owning feature executes, against the exact shape and semantic lineages that exist immediately before that operation.

## Project schema migration

Editable project files save as schema v3.

- schema v1: legacy Fillet string + global Hole/Cut coordinates;
- schema v2: durable edge refs for Fillet;
- schema v3: durable face refs + local U/V placement for Hole/Cut.

The loader accepts v1, v2 and v3. Unsupported or malformed topology references are rejected before a project can enter runtime state.

## Next topology milestone

The next geometry milestone is selected-edge Chamfer using the same durable edge-reference model. In parallel, the sketcher needs arbitrary planar sketch support so the already-general oriented face frame can be exercised on non-orthogonal planes produced by future features.

## Threading and lifecycle

The OCCT kernel is arena-based. Exact operations are serialized through one operation queue and all temporary shape handles are released after each exact rebuild. The WebAssembly package itself is lazy-loaded so simple projects do not pay exact-kernel startup cost until required.

A later performance stage can move exact rebuilds to a dedicated Web Worker without changing `CadProject` or the semantic rebuild layer.

## Coordinate convention

The exact adapter builds OCCT geometry as:

```text
X = width
Y = depth
Z = height
```

The application viewport uses:

```text
X = width
Y = height
Z = depth
```

The tessellation adapter swaps OCCT Y/Z when converting to Three.js and reverses triangle winding to preserve face orientation. The oriented-tool adapter performs the same application-to-OCCT axis conversion before generating its rotation.

## Product boundary

`CadProject` and the ordered feature history remain the source of truth. Persisted topology references contain application-level semantic ancestry and geometric signatures only. B-Rep handles, OCCT runtime hashes and WASM objects remain transient and must never leak directly into the project schema or the central Quản trị Ứng dụng control-plane.
