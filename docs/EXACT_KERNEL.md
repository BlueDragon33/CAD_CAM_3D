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
- outer vertical-edge fillet;
- ordered execution of Hole / Cut / Fillet according to the semantic feature history;
- B-Rep validity check;
- exact bounding box, volume and surface area;
- B-Rep tessellation for inspection;
- exact face and edge picking;
- face-to-edge adjacency data;
- face lineage/evolution tracking through Boolean and Fillet operations;
- STEP export.

The exact path does **not** yet expose app-level chamfer, shell, durable selected-topology feature references, exact STL export switching, or general interactive sketch geometry. Capability flags must describe what CAD_CAM_3D actually exposes, not every operation available in the underlying OCCT wrapper.

## Topology identity

Raw OCCT shape handles are transient. The adapter keeps all face-related hash operations in the same `2147483647` hash domain used by OCCT tessellation groups so face picking, operation history and edge adjacency can be compared directly.

`src/cad/topology-evolution.ts` decodes OCCT `*WithHistory` streams and maintains semantic face lineages. Base extrusion faces are seeded with roles such as `top`, `bottom`, `side:+x`, `side:-x`, `side:+depth` and `side:-depth`. Each Hole, Cut or Fillet then records its modified/generated/deleted face evolution. Faces introduced by an operation but not attributed to an input face receive a feature-owned lineage rather than becoming anonymous topology.

The final exact snapshot exposes runtime face hashes together with their semantic lineage IDs. Exact edges also carry adjacent face hashes and adjacent face-lineage IDs. Selection remapping therefore uses this priority:

```text
runtime hash
    -> semantic face lineage
        -> conservative geometry signature
            -> drop selection if confidence is insufficient
```

This is a practical topology-evolution layer, not a claim that the general topological-naming problem is solved. Runtime selections are still transient UI state and are not written to `CadProject` yet.

## Feature order

Exact operations must follow the semantic feature tree. `rebuildProject()` now exposes an ordered `operationSequence`; the exact kernel must not regroup all holes, all cuts and all fillets by type because Boolean results may be geometrically similar while topology ancestry differs.

This ordering is essential before selected topology can become a feature input.

## Next topology milestone

The next milestone is an application-level persisted `TopologyRef` and a project-schema migration. The first end-to-end target is:

```text
select exact edge
    -> create Fillet referencing that edge lineage/signature
        -> rebuild upstream parameters
            -> resolve the intended edge safely
                -> apply exact OpenCascade fillet
```

After that, face references can drive Hole/Cut placement on selected faces.

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

`CadProject` and the ordered feature history remain the source of truth. B-Rep handles, OCCT runtime hashes and WASM objects are transient runtime data and must never leak directly into the persisted project schema or the central Quản trị Ứng dụng control-plane.
