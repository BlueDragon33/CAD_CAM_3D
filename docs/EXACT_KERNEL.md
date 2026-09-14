# Exact B-Rep kernel

CAD_CAM_3D uses two geometry paths for different jobs.

## Interactive path

`mesh-mvp-v1` remains the default interactive kernel. It rebuilds the current parametric feature history into a deterministic printable mesh quickly enough for continuous viewport updates and STL export.

## Exact manufacturing path

`occt-wasm-v5` is lazy-loaded only when an exact operation is requested. The initial exact path rebuilds the same semantic project into an OpenCascade B-Rep and can export STEP.

Current exact feature coverage:

- centered rectangular base profile;
- extruded solid;
- through cylindrical holes;
- through rectangular cuts;
- outer vertical-edge fillet;
- B-Rep validity check;
- exact bounding box, volume and surface area;
- B-Rep tessellation for inspection;
- STEP export.

The exact path does **not** yet expose app-level chamfer, shell, stable face/edge editing, exact STL export switching, or general interactive sketch geometry. Capability flags must describe what CAD_CAM_3D actually exposes, not every operation available in the underlying OCCT wrapper.

## Topology identity

The adapter records OCCT face and edge hashes plus per-face mesh groups. These identifiers are currently a runtime topology snapshot only. They must not yet be persisted as durable user selections.

The next topology milestone is to use operation history/evolution mapping across boolean and edge operations so a user selection such as “this mounting face” can survive a parametric rebuild when possible.

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

`CadProject` and the ordered feature history remain the source of truth. B-Rep handles, OCCT hashes and WASM objects are transient runtime data and must never leak into the persisted project schema or the central Quản trị Ứng dụng control-plane.
