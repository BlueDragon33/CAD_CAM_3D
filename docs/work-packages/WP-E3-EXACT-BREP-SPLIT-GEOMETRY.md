# WP-E3 — Exact B-Rep Split Geometry Foundation

Status: **COMPLETED — SPLIT 3MF HUMAN ACCEPTED 2026-10-07**
Parent: `WP-E2-BUILD-VOLUME-SPLIT-PLANNING`
Blueprint zone: Floors 51–60 — Manufacturing Intelligence

## User value

Turn a deterministic build-volume envelope split plan into real exact geometry pieces without mutating the canonical CAD project or degrading to mesh-only cutting.

## Foundation scope

- consume the existing deterministic `ManufacturingSplitPlan`;
- rebuild the normal final OpenCascade B-Rep from `CadProject`;
- intersect that final solid with each planned source-envelope cell;
- keep OCCT handles runtime-only inside the exact-kernel boundary;
- return derived Three.js geometry plus exact validity, solid-count, dimensions and volume evidence per cell;
- reject stale/out-of-envelope ranges;
- verify volume conservation across the generated cells;
- mark automatic manufacturing-piece readiness false when a cell is empty, invalid, disconnected, or cannot be tessellated;
- remain local/WASM and add no external provider or dependency.

## Truth boundaries

This work package generates flat exact split geometry only. It does **not** yet:

- persist split pieces into `CadProject`;
- create alignment pins, dovetails, fasteners or structural joints;
- decide seam strength or loading suitability;
- export a multi-object 3MF/STL bundle;
- claim that every envelope-grid cell is a single manufacturable body;
- replace slicer validation.

An irregular body can produce an empty cell or multiple disconnected solids inside one planned cell. Those cases are reported and fail closed for automatic piece export.

## Coordinate contract

The split planner uses application source axes:

- X = width;
- Y = height;
- Z = depth.

The exact OpenCascade workspace uses:

- OCCT X = application X;
- OCCT Y = application Z/depth;
- OCCT Z = application Y/height.

Piece ranges are measured from the final exact B-Rep envelope minimum on each source axis.

## Exit evidence

- pinned `occt-wasm@5.0.0` smoke proves exact Boolean Common against adjacent clipping boxes;
- split input validation is fail-closed;
- every non-empty piece reports exact validity and solid count;
- total generated volume matches source volume within a bounded numerical tolerance;
- no raw OCCT handle crosses the kernel boundary;
- TypeScript, unit regression, exact smoke and production build remain green.

## Next contract

After exact generation is stable, add a bounded multi-part manufacturing export projection. Multi-object 3MF or multi-STL output must consume these validated exact pieces and must remain distinct from the canonical editable project.

## Acceptance evidence

- automated CI and exact-kernel split smoke: PASS;
- multi-object Core 3MF Preview deployment: PASS;
- Product Owner human slicer gate: **ACCEPT SPLIT 3MF** on 2026-10-07;
- merge and Production remain explicitly unauthorized.
