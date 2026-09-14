# Exact B-Rep kernel

CAD_CAM_3D uses two geometry paths for different jobs.

## Interactive path

`mesh-mvp-v1` remains the default interactive kernel. It rebuilds the current parametric feature history into a deterministic printable mesh quickly enough for continuous viewport updates and STL export.

## Exact manufacturing and topology path

`occt-wasm-v5` is lazy-loaded only when an exact operation is requested. The exact path rebuilds the same semantic project into an OpenCascade B-Rep, exposes selectable topology and can export STEP.

Current exact feature coverage:

- centered rectangular base profile;
- extruded solid;
- through cylindrical holes;
- through rectangular cuts;
- outer vertical-edge fillet preset;
- single selected-edge Fillet bound to a persisted `EdgeTopologyRef`;
- horizontal top/bottom face-bound Hole/Cut through a persisted `FaceTopologyRef` + local U/V coordinates;
- ordered execution of Hole / Cut / Fillet according to the semantic feature history;
- B-Rep validity check;
- exact bounding box, volume and surface area;
- B-Rep tessellation for inspection;
- exact face and edge picking;
- face-to-edge adjacency data;
- face lineage/evolution tracking through Boolean and Fillet operations;
- STEP export.

The exact path does **not** yet expose app-level chamfer, shell, arbitrary side-face/angled-face drilling, exact STL export switching, or general interactive sketch geometry. Capability flags must describe what CAD_CAM_3D actually exposes, not every operation available in the underlying OCCT wrapper.

## Topology identity

Raw OCCT shape handles and hashes are transient. The adapter keeps all face-related hash operations in the same `2147483647` hash domain used by OCCT tessellation groups so face picking, operation history and edge adjacency can be compared during one exact rebuild.

`src/cad/topology-evolution.ts` decodes OCCT `*WithHistory` streams and maintains semantic face lineages. Base extrusion faces are seeded with roles such as `top`, `bottom`, `side:+x`, `side:-x`, `side:+depth` and `side:-depth`. Each Hole, Cut or Fillet then records its modified/generated/deleted face evolution. Faces introduced by an operation but not attributed to an input face receive a feature-owned lineage rather than becoming anonymous topology.

The final exact snapshot exposes runtime face hashes together with their semantic lineage IDs. Exact edges also carry adjacent face hashes and adjacent face-lineage IDs. Transient viewport selection remapping uses this priority:

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

## Persisted face references and local placement

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

`src/cad/topology-ref.ts` builds a deterministic local frame for the referenced face. The frame origin is the world origin projected onto the face plane, U is the projected global X direction where possible, and V completes the in-plane frame. Hole/Cut then store local `uMm` / `vMm` values rather than depending only on transient runtime topology.

Current end-to-end face workflow:

```text
select exact horizontal top/bottom face
    -> Add Hole / Cut
        -> persist FaceTopologyRef + local U/V
            -> save/reload schema v3
                -> change upstream width/depth/height
                    -> rebuild topology evolution
                        -> resolve intended face conservatively
                            -> rebuild local frame
                                -> exact through Hole/Cut
```

For this first face-bound milestone, only horizontal faces descended from the base `top`/`bottom` lineages are accepted. This restriction keeps the lightweight mesh/STL path and the exact STEP path aligned. Arbitrary side-face and angled-face drilling requires an oriented-tool path in both kernels and is intentionally not claimed yet.

## Feature order

Exact operations must follow the semantic feature tree. `rebuildProject()` exposes an ordered `operationSequence`; the exact kernel must not regroup all holes, all cuts and all fillets by type because Boolean results may be geometrically similar while topology ancestry differs.

A topology reference is resolved at the point in the ordered history where its owning feature executes, against the exact shape and semantic lineages that exist immediately before that operation.

## Project schema migration

Editable project files now save as schema v3.

- schema v1: legacy Fillet string + global Hole/Cut coordinates;
- schema v2: durable edge refs for Fillet;
- schema v3: durable face refs + local U/V placement for Hole/Cut.

The loader accepts v1, v2 and v3. Unsupported or malformed topology references are rejected before a project can enter runtime state.

## Next topology milestone

The next target is an oriented face-tool path:

```text
select exact side/angled face
    -> resolve FaceTopologyRef
        -> construct current local frame
            -> orient Hole/Cut tool along face normal
                -> preserve fast-preview parity
```

After that, selected-edge Chamfer can reuse the same durable edge-reference model.

## Threading and lifecycle

The OCCT kernel is arena-based. Exact operations are serialized through one operation queue and all temporary shape handles are released after each exact rebuild. The WebAssembly package itself is lazy-loaded so the default workspace does not pay exact-kernel startup cost until required.

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

The tessellation adapter swaps OCCT Y/Z when converting to Three.js and reverses triangle winding to preserve face orientation.

## Product boundary

`CadProject` and the ordered feature history remain the source of truth. Persisted topology references contain application-level semantic ancestry and geometric signatures only. B-Rep handles, OCCT runtime hashes and WASM objects remain transient and must never leak directly into the project schema or the central Quản trị Ứng dụng control-plane.
