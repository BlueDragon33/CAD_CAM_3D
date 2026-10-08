# WP-D3 — Durable Datum Axis Foundation

Status: **ACTIVE**
Blueprint zone: Floors 31–50 — Geometry/Topology + Parametric Modeling
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

Revolve and future axis-driven features need durable engineering-axis intent. UI directions or transient kernel edges are not acceptable canonical references.

## User job

Select an earlier Sketch and create an editable datum axis that survives save/open and upstream rebuilds.

## First vertical slice

- source must be an earlier enabled Sketch;
- base-XZ Sketch axis: global X or Z with signed in-plane offset;
- attached planar Sketch axis: local U or V with signed in-plane offset;
- Datum Axis is semantic reference geometry and does not mutate the solid;
- no OCCT/Three.js handle/hash is persisted;
- UI exposes axis family and offset.

## Durable contract

`DatumAxisFeature.params.source` is one of:

- `{ kind: 'base-xz', sketchId, axis: 'x' | 'z', offsetMm }`
- `{ kind: 'sketch-local', sketchId, axis: 'u' | 'v', offsetMm }`

## Safety

- missing/later Sketch source is invalid;
- base/local source family must match the referenced Sketch plane;
- suppressed/missing source causes deterministic diagnostics;
- no solid-operation sequence entry is produced;
- future Revolve resolves this semantic axis at execution time.

## Out of scope

- arbitrary free 3D line datum;
- cylindrical-surface axis;
- edge-derived datum;
- datum plane;
- direct viewport manipulation;
- Revolve itself.

## Exit evidence

- schema v11 migration/round-trip;
- invalid source/family tests;
- semantic rebuild tests;
- UI create/edit flow;
- CI typecheck/unit/exact-smoke/build PASS.

## Next contract

After acceptance, WP-D4 may add exact Revolve consuming a promoted Sketch plus an earlier compatible Datum Axis.
