# Exact B-Rep kernel

CAD_CAM_3D uses two geometry paths behind one semantic parametric project.

## Interactive path

`mesh-mvp-v1` remains the fast path for geometry it can represent truthfully.

Current lightweight coverage includes:

- base rectangle / Line / Circle / mixed Line+Arc profiles;
- one outer region with direct inner holes;
- base extrusion;
- legacy/simple vertical Hole/Cut where parity is known;
- fast preview;
- lightweight STL when no exact-only feature is enabled.

The fast path must never silently omit a feature.

## Exact path

`occt-wasm-v5` is lazy-loaded whenever exact topology or an exact-only feature is required.

Current exact coverage includes:

- exact base B-Rep from the same resolved manufacturing profile;
- profile regions with direct inner holes;
- global and oriented planar-face Hole/Cut;
- durable face-local U/V placement;
- selected-edge and rectangle-preset Fillet;
- selected-edge and rectangle-preset Chamfer;
- exact inward Shell with one or more durable opening-face references;
- attached planar Sketch → Pad;
- attached planar Sketch → finite Pocket;
- attached planar Sketch → through-all Pocket;
- ordered topology evolution through Pad/Pocket/Hole/Cut/Fillet/Chamfer/Shell;
- exact validity/bounds/volume/surface-area queries;
- exact face/edge picking;
- adaptive STL;
- STEP.

Projects with enabled Pad/Pocket/Shell always route preview/STL through the exact path.

## Attached sketch material path

Schema v6 introduced durable `SketchPlaneRef`:

```text
planar FaceTopologyRef
      +
captured local U/V origin
      ↓
SketchPlaneRef
```

Schema v7 adds exact material consumers:

```text
attached Sketch
      ↓
promoted valid local profile
      ↓
resolve FaceTopologyRef against topology immediately before operation
      ↓
rebuild deterministic face-local frame
      ↓
canonical XY/+Z profile prism
      ↓
rotate/translate onto face
      ├─ Pad: overlap inward slightly + fuseWithHistory
      └─ Pocket: extend inward + cutWithHistory
      ↓
FaceLineageTracker
```

Pad follows the persisted reference normal outward. Pocket removes material opposite that reference normal.

The tiny face overlap is deliberate: Boolean success must not depend on perfect coincident-face contact.

Curved Arc/Circle-derived side faces remain inspection-only for attached Sketch because cylindrical/surface parameter coordinates are not yet part of the durable project contract.

## Durable topology references

### EdgeTopologyRef

Used by selected-edge Fillet and Chamfer.

Persists:

- semantic adjacent-face lineage;
- curve kind;
- length;
- midpoint;
- endpoints;
- capture boundary.

It never persists an OCCT handle/hash.

### FaceTopologyRef

Used by:

- oriented Hole/Cut;
- SketchPlaneRef;
- Shell opening faces.

Persists:

- semantic face lineage;
- centroid;
- normal;
- area;
- capture boundary.

Resolution prefers semantic lineage and then uses geometric signature/confidence to disambiguate.

Ambiguous resolution is rejected.

## Semantic side lineage

Promoted sketch profiles assign side ancestry to originating sketch entities.

Examples:

```text
<extrude>:side:outer:line:<entityId>
<extrude>:side:outer:arc:<entityId>
<extrude>:side:hole:1:line:<entityId>
<extrude>:side:hole:2:circle:<entityId>
```

Line-derived side faces are planar and may participate in face-bound workflows.
Arc/Circle side faces are curved and currently remain inspection-first.

## Preview / export routing

`src/cad/project-analysis.ts` decides whether exact geometry is required.

```text
simple supported project
    → mesh-mvp-v1
    → fast preview / STL

Pad / Pocket / Shell / Fillet / Chamfer /
oriented face feature / promoted-profile Boolean
    → occt-wasm-v5
    → exact preview / exact STL

STEP
    → occt-wasm-v5 always
```

The exact viewport frames from final B-Rep bounds rather than the pre-operation base envelope.

## Project schema migration

Current editable schema: **v8**.

- v1: legacy Fillet selection + global Hole/Cut;
- v2: durable edge references for Fillet;
- v3: durable face references + local U/V Hole/Cut;
- v4: Chamfer using durable edge references;
- v5: persisted Line/Circle/Arc entities, constraints and construction/profile membership;
- v6: durable SketchPlaneRef for base-XZ or attached planar face;
- v7: Pad/Pocket features referencing an earlier face-attached Sketch;
- v8: Shell thickness + durable opening-face references.

The loader accepts v1-v8, validates Pad/Pocket source-Sketch ordering/type, and rejects Shell without a durable opening face before runtime entry.

## Coordinate convention

OCCT:

`X = width, Y = depth, Z = height`

Application viewport:

`X = width, Y = height, Z = depth`

The tessellation and face-orientation adapters convert explicitly.

## Quality evidence

The exact smoke suite currently includes:

- base B-Rep / STEP;
- oriented face Hole/Cut;
- single-loop profile parity;
- mixed Line+Arc parity;
- multi-loop region parity;
- semantic side-lineage checks;
- attached Pad;
- finite Pocket;
- through-all Pocket;
- side-oriented Pad;
- inward Shell validity/bounds/volume plus opening geometry and history.

A green smoke suite is engineering evidence, not Production authority.

## Current boundary

Not yet claimed:

- curved-surface Sketch attachment;
- arbitrary datum-plane Sketch;
- symmetric/mid-plane Pad/Pocket;
- termination-to-face/up-to-next;
- draft angle;
- general multi-body Boolean semantics.

These require explicit contracts and tests before capability flags may be enabled. Shell capability is enabled only on the exact path; the lightweight kernel does not claim Shell parity.

## Product ownership

`CadProject` remains the source of editable truth.

Transient B-Rep handles, OCCT hashes, tessellation and provider runtime objects never enter canonical project JSON and are never transferred into Quản trị Ứng dụng as project ownership.
