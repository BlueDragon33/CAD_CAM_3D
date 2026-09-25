# Sketch profile validation and promotion

The 2D sketch workspace keeps the manufacturing transition explicit:

```text
persisted sketch entities
        -> deterministic constraints
            -> closed-loop/profile validation
                -> region classification
                    -> explicit profile promotion
                        -> mesh/OpenCascade extrusion
                            -> preview / STL / STEP
```

Closed geometry is never adopted silently. The user must choose `Use candidate as profile`. `Use rectangle` returns the sketch to the named width/depth rectangle.

## Current validator

`src/cad/profile.ts` extracts individual closed-loop candidates. `src/cad/profile-region.ts` classifies those candidates into the first supported manufacturing-region model.

Validated today:

- simple closed Line loops;
- Circles;
- mixed closed Line + Arc loops;
- Arc endpoints participating in sketch snapping;
- endpoint closure with a conservative geometric tolerance;
- connected-component and vertex-degree checks;
- minimum enclosed-area checks;
- exact Line/Arc perimeter calculation;
- signed area and clockwise/counter-clockwise winding for path loops;
- repeated-vertex rejection;
- sampled non-adjacent self-intersection diagnostics for curved paths;
- open/branched component detection;
- multiple closed-loop extraction;
- pairwise loop intersection/touch rejection;
- containment-depth classification;
- exactly one outer contour plus zero or more direct inner holes.

Arc entities keep their original positive design sweep. During loop ordering the profile layer records traversal direction, so an Arc can be consumed forward or reversed without changing persisted sketch intent.

Still outside the promoted capability set:

- multiple disconnected outer islands;
- nested islands / containment depth greater than one;
- spline/NURBS boundaries;
- arbitrary sketch planes.

## Region promotion rule

A construction-sketch region is promotable only when all of the following are true:

1. every participating component is a valid closed Line/Circle/Line+Arc loop;
2. no open or branched path component remains;
3. closed loops do not intersect or touch each other;
4. exactly one loop has containment depth 0 and becomes the outer contour;
5. every other loop has containment depth 1 and becomes a direct inner hole;
6. the holes do not consume the entire outer area.

A depth-2 loop would represent an island inside a hole. That topology is rejected for now instead of being assigned an implicit Boolean meaning.

Promotion remains durable without another project-schema revision. Schema v5 already persists a `construction` flag on every sketch entity:

- `construction: true` -> reference/construction geometry;
- `construction: false` -> entity belongs to the active manufacturing region.

Zero non-construction entities means the named rectangle remains active. Promoting a region flips the outer-loop and hole-loop entities together. If a promoted region becomes invalid after editing, solid rebuild is blocked rather than silently falling back to the rectangle.

## Kernel parity

Both geometry paths consume the same resolved manufacturing region from semantic rebuild.

```text
validated promoted region
        |
        +--> mesh-mvp-v1
        |      outer -> THREE.Shape
        |      holes -> Shape.holes
        |      Line -> lineTo
        |      Arc / Circle -> absarc
        |      -> ExtrudeGeometry
        |
        +--> occt-wasm-v5
               outer -> Wire -> Face -> Prism
               each hole -> Wire -> Face -> overrun Prism
               outer Prism - hole Prisms
```

The exact Arc edge is reconstructed from its start point, a midpoint on the persisted signed traversal sweep and its end point. Hole tools extend one millimetre beyond both planar caps before Boolean subtraction so exact subtraction does not depend on coincident faces.

The CI gate includes:

- `scripts/profile-parity-smoke.mjs` for Line, Circle and mixed Line+Arc single loops;
- `scripts/region-parity-smoke.mjs` for one outer contour with multiple inner holes.

The region smoke compares Three.js and OpenCascade bounds and volume. Promoted-profile Hole/Cut features still route preview/STL through the exact kernel so feature Booleans cannot be misrepresented by lightweight `Shape.holes` semantics.

## UI behavior

When Sketch is selected, the workspace shows the current manufacturing region separately from the next construction candidate:

- named rectangle or promoted outer contour;
- number of direct inner holes;
- active-region validity;
- candidate `VALID / NOT READY` state;
- net area and total boundary perimeter;
- the first blocking reason when a candidate is not ready.

All entity IDs belonging to the classified outer contour and its holes are promoted together. Promoted entities are rendered distinctly from construction geometry. Editing or dragging a promoted entity changes the actual manufacturing region after deterministic constraints are re-applied.

## Safety boundary

The application must never show one region in the viewport while exporting another region in STL/STEP. If the active promoted region cannot be validated, `rebuildProject()` does not create a solid. Separate outer islands and nested islands remain blocked until explicit multi-body/island semantics are implemented.

## Next stage

The next topology milestone is richer semantic lineage for promoted-profile side faces, followed by arbitrary planar sketch attachment. After that, the region model can expand toward explicit islands/multi-body behavior rather than inferring them from nesting alone.
