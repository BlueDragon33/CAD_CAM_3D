# WP-E2 — Build-volume split planning

Status: **ACTIVE**
Parent: `WP-E-MANUFACTURING-INTELLIGENCE-FOUNDATION`
Blueprint zone: Floors 51–60 — Manufacturing Intelligence

## User value

When a valid part cannot fit the selected printer in any 90° orientation, provide a deterministic, inspectable split plan instead of only saying “too large”.

## Foundation scope

- evaluate all six axis-aligned source→printer orientations;
- compute the minimum-piece axis/grid segmentation required by the selected build volume;
- expose source axis, assigned printer axis, segment count, nominal segment length and cut positions measured from the source envelope minimum;
- prefer fewer total pieces, then fewer split axes;
- keep the plan non-mutating and independent from CAD feature history;
- mark geometry generation as **not implemented** until an exact split/export path exists;
- use flat seams only as the truthful foundation; alignment pins/dovetails/fasteners are future explicit geometry features.

## Truth boundaries

A split plan is envelope planning, not proof that every resulting irregular body will be printable or structurally appropriate.

The planner does not yet:

- cut B-Rep/mesh geometry;
- add alignment joints;
- evaluate seam stress;
- choose adhesive/fasteners;
- guarantee support-free orientation;
- export multiple parts.

## Exit evidence

- unit tests cover one-axis and multi-axis grid planning;
- readiness includes a plan only when the unsplit part does not fit;
- no existing STL/STEP/3MF behavior is silently changed;
- TypeScript/unit/exact/build gates PASS.

## Next contract

A later exact split work package may consume this plan to generate separate solids and multi-object 3MF/STL artifacts. That implementation must preserve exact project ownership and must not pretend envelope segmentation is equivalent to an engineering joint design.
