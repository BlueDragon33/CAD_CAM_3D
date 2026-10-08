# WP-F — Portable 3MF Export Foundation

Status: **ACTIVE**
Blueprint zone: Floors 51–60 — Manufacturing / Interchange
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

STL loses units and rich manufacturing metadata. CAD_CAM_3D needs a portable, local-first 3MF path suitable for modern slicers without introducing a paid/cloud dependency or creating a second geometry truth.

## First vertical slice

- 3MF Core package generated entirely in-browser;
- model unit fixed explicitly to millimeter;
- one final mesh object from the same adaptive geometry path used by manufacturing export;
- exact OpenCascade tessellation is used whenever enabled features require exact geometry;
- lightweight mesh remains valid for parity-proven simple projects;
- ZIP package uses the mandatory OPC/3MF entries;
- geometry is converted from workspace Y-up to slicer Z-up coordinates;
- no external ZIP/SaaS dependency.

## Required package entries

- `[Content_Types].xml`
- `_rels/.rels`
- `3D/3dmodel.model`

## Truth boundaries

- 3MF is a manufacturing projection, never canonical project state;
- current foundation exports one object/one mesh and basic project metadata only;
- materials, multiple objects, slicer settings, thumbnail, support painting and Bambu-specific metadata are out of scope until independently modeled;
- do not claim Bambu project-file parity merely because a Core 3MF opens in Bambu Studio.

## Exit evidence

- stored ZIP container regression test;
- 3MF XML unit=millimeter;
- non-empty vertices/triangles;
- Z-up coordinate transform regression;
- adaptive exact/lightweight path;
- UI export action;
- TypeScript + unit + exact-smoke + build PASS.

## Next contract

Extend manufacturing intelligence (clearance/overhang/orientation/split planning) and only add richer 3MF extensions when the semantic data exists in CAD_CAM_3D rather than copying slicer-specific opaque state.
