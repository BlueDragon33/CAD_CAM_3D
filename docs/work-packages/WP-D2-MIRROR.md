# WP-D2 — Deterministic Mirror Foundation

Status: **FOUNDATION ACCEPTED**
Blueprint zone: Floors 41–50 — Parametric Modeling
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

Functional brackets/enclosures repeatedly need symmetric holes and cutouts. Duplicating and manually negating coordinates creates unnecessary project features and makes symmetry fragile.

## User job

Select an earlier Hole or Cut and derive one mirrored instance across a stable global or source-face-local symmetry plane.

## First vertical slice

- source feature: earlier enabled Hole or Cut;
- original source remains canonical and executes normally;
- Mirror persists only source ID + mirror plane;
- global source: mirror across X=offset or Z=offset;
- face-bound source: mirror across local U=offset or V=offset on the same durable FaceTopologyRef;
- exact kernel only initially;
- derived topology uses a deterministic runtime lineage ID based on Mirror feature identity.

## Durable contract

`MirrorFeature`:

- `sourceFeatureId`;
- `plane.kind = global | face-local`;
- `axis = x | z` for global or `u | v` for face-local;
- `offsetMm`.

The plane is explicit project intent, not a UI-only checkbox.

## Safety

- source must be earlier and enabled;
- axis family must match source placement;
- unresolved face-bound source fails closed;
- invalid Boolean blocks exact result;
- no copied source feature is persisted.

## Out of scope

- Pad/Pocket/Shell/Fillet/Chamfer mirroring;
- mirroring feature groups;
- arbitrary datum plane orientation;
- body mirroring;
- lightweight parity.

## Exit evidence

- schema migration/round-trip;
- invalid source/plane tests;
- semantic rebuild tests;
- global + face-local exact smoke;
- preview/STL/STEP exact routing;
- production build PASS.
