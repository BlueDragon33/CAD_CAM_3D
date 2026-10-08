# WP-D — Exact Shell for Printable Enclosures

Status: **ACTIVE**
Project: `CAD_CAM_3D`
Depends on: durable FaceTopologyRef + exact topology evolution.

## Problem

Small electronics/robotics enclosures are a primary product job. Creating a hollow housing by manually modeling an inner Cut is slow and loses the semantic meaning of wall thickness.

## User job

Select a stable planar face as the opening, add Shell, set wall thickness, then continue editing/exporting the resulting hollow enclosure.

## Scope

Introduce an exact-only `shell` feature:

```ts
type ShellFeature = {
  thicknessMm: number;
  openings: FaceTopologyRef[];
  join: "arc";
}
```

Initial product slice:

- one or more durable opening-face references in the contract;
- UI creates the first opening from the currently selected supported planar exact face;
- inward shell thickness;
- OpenCascade `shellWithHistory`;
- topology evolution;
- schema v8 persistence/migration;
- exact preview/STL/STEP;
- exact B-Rep smoke for enclosure shell.

## Why an openings array now

OpenCascade already accepts multiple removed faces. Persisting a list avoids a later schema redesign for multi-opening housings while the first UI remains intentionally simple.

This is structural capacity, not speculative UI complexity.

## Exact semantics

```text
current exact solid
      ↓
resolve each FaceTopologyRef conservatively
      ↓
find current OCCT face handles
      ↓
shellWithHistory(
  solid,
  openingFaces,
  thickness,
  tolerance
)
      ↓
valid inward hollow solid
      ↓
topology lineage update
```

The pinned `occt-wasm@5.0.0` API defines positive wrapper thickness as inward hollowing for Shell.

## Safety

- unresolved or ambiguous opening face → Shell skipped with error/warning; never choose nearest face silently;
- thickness <= 0 is invalid;
- kernel failure is surfaced;
- no lightweight geometry claim;
- initial UI accepts supported planar opening faces only;
- raw OCCT handles/hashes never persist.

## Persistence

Schema advances from v7 → **v8**.

v1-v7 remain readable.

## UI/UX

When an exact supported planar Face is selected:

- Add Shell creates Shell with that opening;
- inspector exposes wall thickness;
- feature history shows opening count and topology-bound status;
- exact-kernel loading is expected.

Do not add a fake shell when exact kernel is unavailable.

## Quality gates

- TypeScript PASS;
- unit/migration tests PASS;
- schema-v8 round-trip/migration test;
- Shell exact smoke:
  - valid B-Rep;
  - outer bounds preserved for inward shell;
  - expected hollow volume within tolerance;
  - topology history non-empty;
- existing exact smoke PASS;
- production build PASS.

## Out of scope

- variable wall thickness;
- selected-face thickness overrides;
- Shell on unsupported/unstable curved opening surfaces;
- draft;
- automatic enclosure lid generation;
- snapping PCB/component catalog into the enclosure.

## Exit criteria

A user can select a durable planar face, add an inward Shell, edit wall thickness, save/open the project and export exact STL/STEP with validated B-Rep and topology history.
