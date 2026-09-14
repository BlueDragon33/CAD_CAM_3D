# Exact B-Rep kernel

CAD_CAM_3D uses two geometry paths for different jobs.

## Interactive path

`mesh-mvp-v1` remains the default interactive kernel for simple vertical Sketch/Extrude/Hole/Cut work. Projects that contain exact-only geometry are automatically promoted to OpenCascade so preview and manufacturing output never silently omit exact edge or oriented-face features.

Current promotion triggers include enabled Fillet/Chamfer features and Hole/Cut features bound to non-horizontal planar faces.

## Exact manufacturing and topology path

`occt-wasm-v5` is lazy-loaded when exact topology, exact-only preview, STEP or adaptive STL is required.

Current exact feature coverage:

- centered rectangular base profile and extrusion;
- global vertical through Hole/Cut;
- oriented through Hole/Cut on supported top/bottom/side planar base-face descendants;
- local U/V placement rebuilt from the resolved face plane;
- tool axis rebuilt from the resolved face normal;
- four-outer-vertical-edge Fillet preset;
- selected-edge Fillet through persisted `EdgeTopologyRef`;
- four-outer-vertical-edge Chamfer preset;
- selected-edge Chamfer through persisted `EdgeTopologyRef`;
- ordered Hole / Cut / Fillet / Chamfer execution;
- B-Rep validity, bounds, volume and surface-area queries;
- exact tessellation for inspection and adaptive STL;
- exact face/edge picking, adjacency and topology evolution;
- STEP export.

Shell, curved-surface drilling, arbitrary sketch planes and the full interactive sketcher remain outside the currently exposed product capability set.

## Durable edge references

Fillet and Chamfer share the same application-level `EdgeTopologyRef`. It stores semantic adjacent-face ancestry plus a compact geometry signature, never an OCCT handle or runtime hash.

```text
select exact edge
    -> Add Fillet or Chamfer
        -> persist EdgeTopologyRef
            -> edit upstream geometry
                -> rebuild topology evolution
                    -> resolve intended edge conservatively
                        -> exact OpenCascade edge treatment
```

A weak or ambiguous match is rejected rather than silently targeting another edge. Edge operations execute at their exact position in the feature tree, so a later Chamfer sees topology produced by earlier Hole/Cut/Fillet operations.

## Persisted face references and oriented placement

Project schema v3 introduced `FaceTopologyRef` and face-local placement for Hole/Cut. A deterministic local frame is derived from the resolved face plane. If tessellation orientation flips after a rebuild, the resolved normal is aligned back to the persisted reference normal before local U/V is reconstructed.

`src/cad/oriented-tool.ts` converts that frame into OCCT coordinates, derives an axis-angle transform and creates a through tool longer than twice the part diagonal. The tool is centered on the selected point so the Boolean remains through-cut regardless of normal direction.

Current manufacturing face binding accepts only descendants of the six planar base-extrusion faces: top, bottom, ±X and ±depth. Curved Hole walls and Fillet/Chamfer surfaces remain inspection-only.

## Preview and STL parity

`src/cad/project-analysis.ts` decides when exact geometry is required.

```text
simple vertical project
    -> mesh-mvp-v1
    -> preview + STL

Fillet / Chamfer / oriented-face project
    -> OpenCascade B-Rep
    -> exact tessellation
    -> preview + STL preflight + STL
```

STEP always comes from the exact B-Rep path.

## Project schema migration

Editable project files now save as schema v4.

- schema v1: legacy Fillet string + global Hole/Cut coordinates;
- schema v2: durable edge references for Fillet;
- schema v3: durable face references + local U/V Hole/Cut placement;
- schema v4: parametric Chamfer using the same durable edge-reference model.

The loader accepts v1-v4 and validates every supported feature before it enters runtime state.

## Coordinate convention

OCCT uses `X=width, Y=depth, Z=height`; the application viewport uses `X=width, Y=height, Z=depth`. Tessellation and oriented-tool adapters perform this conversion explicitly.

## Product boundary

`CadProject` and ordered feature history remain the source of truth. B-Rep handles, OCCT runtime hashes and WASM objects are transient and never enter project JSON or the central Quản trị Ứng dụng control-plane.

## Next exact-kernel work

The next high-value geometry work is Shell and richer surface metadata, while the larger product priority moves toward a stronger sketcher with more primitives, snapping, dimensions/constraints and arbitrary planar sketch support.
