# Sketch profile validation

The 2D sketch workspace now distinguishes three stages deliberately:

```text
persisted sketch entities
        -> deterministic constraints
            -> closed-loop/profile validation
                -> manufacturing-profile promotion (next stage)
```

A geometrically closed loop is **not** silently used for Extrude yet. The current manufacturing solid still comes from the named-parameter centered rectangle until a profile representation is shared safely by both the lightweight mesh kernel and the exact OpenCascade kernel.

## Current validator

`src/cad/profile.ts` analyzes the solved sketch geometry and reports candidate manufacturing profiles.

Validated today:

- one simple closed polyline made from Line entities;
- one Circle as a closed profile candidate;
- endpoint closure with a conservative geometric tolerance;
- connected-component and vertex-degree checks;
- minimum edge/area checks;
- perimeter and enclosed-area calculation;
- clockwise/counter-clockwise winding for polygon loops;
- repeated-vertex rejection;
- non-adjacent segment self-intersection detection;
- open/branched line-component detection;
- multiple closed-loop detection.

Not yet promoted:

- mixed Line + Arc loops;
- multiple loops representing an outer boundary plus holes;
- nested-loop classification;
- spline/NURBS boundaries;
- arbitrary sketch planes.

## Promotion rule

A sketch is currently marked `promotable` only when all of the following are true:

1. exactly one closed candidate exists;
2. the candidate is valid and non-self-intersecting;
3. no open/branched line component remains;
4. no Arc entity is present in the candidate sketch;
5. no second loop needs outer/hole classification.

`promotable` means **ready for the next implementation stage**, not that the manufacturing profile has already changed.

## UI behavior

When Sketch is selected, the workspace shows:

- `Candidate profile: VALID` for one safe closed candidate;
- area and perimeter;
- polygon winding when applicable;
- the first blocking reason when the sketch is not ready.

A valid candidate is also marked in the sketch entity rendering. Rebuild diagnostics carry the same validation result so profile readiness is visible outside the canvas status card.

## Next stage

The next manufacturing step is profile promotion with kernel parity:

```text
validated single loop
    -> explicit profile selection in CadProject
        -> fast mesh extrusion
        -> exact wire/face/prism extrusion
        -> compare bounds/volume/topology
        -> preview / STL / STEP parity
```

Promotion will be explicit and versioned in the project schema. The application must never show the legacy rectangle in one kernel while exporting a different custom profile from another kernel.
