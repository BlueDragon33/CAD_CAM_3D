# WP-B — Attached Sketch Material Features

Status: **ACTIVE**
Project: `CAD_CAM_3D`
Depends on: `WP-A-ARBITRARY-PLANAR-SKETCH-ATTACHMENT`

## Problem

An attached planar Sketch is now durable project intent, but it cannot yet add or remove material. A CAD workflow is incomplete until the attached profile can drive a parametric material feature.

## User jobs

- select a planar face;
- Create Sketch;
- draw/promote one valid region;
- add material outward from that face;
- pocket/remove material inward through a defined distance or through-all;
- edit upstream geometry and have the attached operation resolve the intended face safely.

## Scope

Introduce two explicit feature kinds:

- `pad` — additive extrusion from an attached planar Sketch;
- `pocket` — subtractive extrusion from an attached planar Sketch.

Initial contracts:

```ts
type PadFeature = {
  sketchId: string;
  distanceMm: number;
  direction: "normal";
}

type PocketFeature = {
  sketchId: string;
  extent: "distance" | "through-all";
  distanceMm: number;
  direction: "inward";
}
```

The source Sketch must:

- exist earlier in feature history;
- be enabled;
- use a face-bound `SketchPlaneRef`;
- contain a promoted, valid profile region;
- resolve its durable FaceTopologyRef safely at execution time.

## Geometry semantics

### Pad

Canonical profile prism starts slightly inside the parent face and extends along the resolved outward reference normal.

```text
attached local profile
   ↓
canonical XY face/prism
   ↓
transform by resolved U/V/normal frame
   ↓
small overlap into parent body
   ↓
OCCT fuseWithHistory
```

### Pocket

Canonical profile tool extends into the parent body opposite the resolved face normal.

- distance mode: finite inward depth plus a small face overlap;
- through-all mode: tool length exceeds complete part diagonal.

Then execute `cutWithHistory`.

## Exact-kernel law

WP-B is exact-kernel first.

The lightweight mesh path MUST NOT pretend to represent attached Pad/Pocket unless explicit parity is later implemented.

Any project containing enabled Pad/Pocket routes preview/STL through OpenCascade.

## Persistence

Schema advances to v7 because new durable feature kinds are introduced.

v1-v6 remain readable.

## Topology

Pad/Pocket operations must participate in `FaceLineageTracker` via OCCT history.

Raw face hashes remain transient.

## UI/UX

When an attached Sketch is selected:

- show Add Pad;
- show Add Pocket;
- block if no promoted valid feature profile;
- expose Pad distance;
- expose Pocket extent and distance;
- make exact-only status explicit.

Do not allow Pad/Pocket from the base sketch in this first slice.

## Security / dependencies

No network dependency.
No new external provider.
No new authority boundary.

## Quality gates

Required evidence:

- TypeScript PASS;
- exact B-Rep smoke PASS;
- new attached-feature exact smoke:
  - side/top Pad produces expected volume increase;
  - Pocket produces expected volume decrease;
  - through-all Pocket produces valid B-Rep;
  - topology history records feature step;
- production build PASS;
- existing base modeling regression PASS.

## Known limitations

- attached features are planar-face only;
- no symmetric/two-sided/mid-plane extent yet;
- no draft angle;
- no arbitrary termination-to-face;
- no lightweight mesh parity yet;
- curved-face sketches remain out of scope.

## Exit criteria

A promoted attached Sketch can drive a real exact Pad or Pocket, persist through schema v7, export through exact STL/STEP and participate in topology history without changing the project source-of-truth model.
