# WP-E4 — Split Seam / Joining Strategy Foundation

Status: **ACTIVE**
Parent: `WP-E3-EXACT-BREP-SPLIT-GEOMETRY`
Blueprint zone: Floors 51–60 — Manufacturing Intelligence

## User value

Make the relationship between automatically split pieces explicit so later alignment/joining features can be added without guessing from mesh proximity or UI ordering.

## First vertical slice

- derive a deterministic seam graph directly from the split grid;
- each seam records its normal source axis, envelope position and the two adjacent piece IDs;
- estimate envelope contact area only from deterministic cell spans;
- keep seam identity stable for an unchanged split plan;
- explicitly mark alignment strategy as `none`;
- explicitly mark structural assessment as `unassessed`;
- do not mutate `CadProject`;
- do not infer contact from tessellated-mesh proximity.

## Truth boundaries

The current seam graph describes **planned envelope adjacency**, not guaranteed exact face contact.

It does not yet claim:

- actual exact contact-face area for irregular geometry;
- pin/dowel/dovetail placement;
- adhesive, screw or fastener recommendation;
- strength, load path, fatigue or safety suitability;
- print orientation suitability for the seam;
- tolerance/clearance fit.

Those require additional geometry evidence and, where structural claims are involved, explicit engineering assumptions.

## Determinism

For a fixed split plan:

- seam IDs derive from axis + ordered adjacent piece IDs;
- only positive-grid neighbors create seams, preventing duplicates;
- a two-piece single-axis split has one seam;
- a 2×2 grid has four seams.

## Exit evidence

- single-axis seam regression;
- multi-axis seam-count regression;
- deterministic IDs;
- explicit `alignmentStrategy='none'`;
- explicit `structuralAssessment='unassessed'`;
- TypeScript, unit regression, exact smoke and production build PASS.

## Next contract

Use exact clipped-piece evidence to validate which planned seams have real contact. Only then may a bounded alignment-feature planner propose non-structural registration geometry. Automatic structural-joint claims remain prohibited without a separate engineering evidence model.
