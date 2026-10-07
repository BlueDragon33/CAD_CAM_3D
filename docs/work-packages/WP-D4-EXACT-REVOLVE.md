# WP-D4 — Exact Additive Revolve Foundation

Status: **ACTIVE**
Blueprint zone: Floors 31–50 — Geometry/Topology + Parametric Modeling
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

Axisymmetric functional parts need a parametric Revolve that preserves editable project intent. Revolve must consume durable Sketch/Datum semantics rather than UI directions or transient OCCT topology.

## User job

Create one promoted profile on an attached planar Sketch, create a Datum Axis in that same Sketch plane, then add material by revolving the profile around the axis.

## First vertical slice

- exact-kernel-only additive Revolve;
- source must be an earlier enabled face-attached Sketch;
- source Sketch must contain one promoted valid simple loop;
- source axis must be an earlier `sketch-local` Datum Axis from the same Sketch;
- axis may be on or outside the profile boundary but must not cross its interior;
- sweep angle: 0.1° through 360°;
- Revolve result fuses into the current solid;
- topology evolution is recorded after the fusion;
- preview, STL and STEP route through OpenCascade.

## Durable contract

`RevolveFeature` persists:

- `sketchId`;
- `axisId`;
- `angleDeg`;
- `operation: 'add'`.

No runtime kernel handle, edge hash or transformed mesh becomes canonical state.

## Safety

- missing/incompatible Sketch or Datum Axis fails closed;
- inner-hole profile regions are rejected in this foundation;
- axis crossing profile interior is rejected before exact execution;
- invalid OpenCascade result blocks the exact operation;
- project schema v12 validates feature ordering and source compatibility.

## Out of scope

- subtractive/groove Revolve;
- new-body/multi-body Revolve;
- arbitrary free-space Datum Axis;
- cylindrical/edge-derived axis;
- regions with inner holes;
- thin feature;
- asymmetric dual-angle revolve;
- lightweight-mesh Revolve parity.

## Exit evidence

- schema v12 migration/round-trip;
- semantic rebuild tests for valid and invalid axis placement;
- exact OpenCascade full-revolution smoke;
- topology history from Revolve fusion;
- preview/STL/STEP exact routing;
- TypeScript, unit, exact-smoke and production build PASS.

## Next contract

After foundation acceptance, prefer moving to printable-part manufacturing intelligence and 3MF rather than broadening Revolve speculatively. Additional datum/axis/revolve semantics should be introduced only for demonstrated user jobs.
