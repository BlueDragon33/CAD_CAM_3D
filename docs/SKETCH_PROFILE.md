# Sketch profile validation and promotion

The 2D sketch workspace keeps the manufacturing transition explicit:

```text
persisted sketch entities
        -> deterministic constraints
            -> closed-loop/profile validation
                -> explicit profile promotion
                    -> mesh/OpenCascade extrusion
                        -> preview / STL / STEP
```

A geometrically closed loop is never adopted silently. The user must choose `Use candidate as profile`. `Use rectangle` returns the sketch to the named width/depth rectangle.

## Current validator

`src/cad/profile.ts` analyzes solved sketch geometry and reports candidate manufacturing profiles.

Validated today:

- one simple closed Line loop;
- one Circle;
- one mixed closed Line + Arc loop;
- Arc endpoints participating in sketch snapping;
- endpoint closure with a conservative geometric tolerance;
- connected-component and vertex-degree checks;
- minimum enclosed-area checks;
- exact line/arc perimeter calculation;
- signed area and clockwise/counter-clockwise winding for path loops;
- repeated-vertex rejection;
- sampled non-adjacent self-intersection diagnostics for curved paths;
- open/branched component detection;
- multiple closed-loop detection.

Arc entities keep their original positive design sweep. During loop ordering the profile layer records traversal direction, so an Arc can be consumed forward or reversed without changing persisted sketch intent.

Still outside the promoted capability set:

- multiple loops representing an outer boundary plus holes;
- nested-loop classification and islands;
- spline/NURBS boundaries;
- arbitrary sketch planes.

## Promotion rule

A construction sketch candidate is promotable only when all of the following are true:

1. exactly one closed candidate exists;
2. the candidate is valid and non-self-intersecting;
3. no open/branched path component remains;
4. its Line/Arc entity sequence can be ordered into one closed loop;
5. no second loop needs outer/hole classification.

Promotion is durable without another project-schema revision. Schema v5 already persists a `construction` flag on every sketch entity:

- `construction: true` -> reference/construction geometry;
- `construction: false` -> entity belongs to the active manufacturing profile.

Zero non-construction entities means the named rectangle remains active. One validated non-construction Line, Line+Arc or Circle loop becomes the manufacturing profile. If a promoted loop becomes invalid after editing, solid rebuild is blocked rather than silently falling back to the rectangle.

## Kernel parity

Both geometry paths consume the same resolved `ManufacturingProfile` from semantic rebuild.

```text
validated promoted profile
        |
        +--> mesh-mvp-v1
        |      Line -> lineTo
        |      Arc  -> absarc
        |      Circle -> absarc
        |      -> ExtrudeGeometry
        |
        +--> occt-wasm-v5
               Line -> LineEdge
               Arc  -> ArcEdge(start, sweep-midpoint, end)
               Circle -> CircleEdge
               -> Wire -> Face -> Prism
```

The exact Arc edge is reconstructed from its start point, a midpoint on the persisted signed traversal sweep and its end point. This preserves minor/major-arc intent instead of replacing the curve with a chord.

The CI gate includes `scripts/profile-parity-smoke.mjs`. It constructs representative promoted polyline, Circle and mixed Line+Arc capsule profiles in both Three.js and OpenCascade and checks dimensions and volume within defined tolerances.

Promoted-profile Hole/Cut operations route preview/STL through the exact kernel. This avoids treating an outside/grazing Boolean as a Three.js `Shape.holes` case. A plain promoted extrusion can still use the lightweight path; STEP always uses OpenCascade.

## UI behavior

When Sketch is selected, the workspace shows the current manufacturing profile separately from the next construction candidate:

- named rectangle, promoted Line loop, promoted Line+Arc loop or promoted Circle;
- active-profile validity;
- candidate `VALID / NOT READY` state;
- area and perimeter;
- path winding when applicable;
- the first blocking reason when a candidate is not ready.

Promoted profile entities are rendered distinctly from construction geometry. Editing or dragging a promoted entity changes the actual manufacturing profile after deterministic constraints are re-applied.

## Safety boundary

The application must never show one outer profile in the viewport while exporting another profile in STL/STEP. If the active promoted profile cannot be validated, `rebuildProject()` does not create a solid.

## Next stage

The next profile milestone is region classification:

```text
multiple validated loops
    -> pairwise intersection checks
        -> containment tree
            -> one outer loop + inner holes
                -> mesh Shape.holes
                -> exact outer extrusion - hole extrusions
                    -> bounds/volume parity
```

Nested islands and arbitrary sketch planes remain blocked until that region model is stable.
