# Sketch profile validation and promotion

The 2D sketch workspace now has an explicit manufacturing transition:

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

Still outside the promoted capability set:

- mixed Line + Arc loops;
- multiple loops representing an outer boundary plus holes;
- nested-loop classification;
- spline/NURBS boundaries;
- arbitrary sketch planes.

## Promotion rule

A construction sketch candidate is promotable only when all of the following are true:

1. exactly one closed candidate exists;
2. the candidate is valid and non-self-intersecting;
3. no open/branched Line component remains in that candidate set;
4. no Arc entity is present in the candidate set;
5. no second loop needs outer/hole classification.

Promotion is durable but does not require a new project schema. Schema v5 already persists a `construction` flag on every sketch entity. CAD_CAM_3D now uses that existing semantic boundary deliberately:

- `construction: true` -> reference/construction geometry;
- `construction: false` -> entity belongs to the active manufacturing profile.

Zero non-construction entities means the named rectangle remains active. One validated non-construction loop means that Line loop or Circle is the manufacturing profile. If a promoted loop becomes invalid after editing, solid rebuild is blocked rather than silently falling back to the rectangle.

## Kernel parity

Both geometry paths consume the same resolved `ManufacturingProfile` from semantic rebuild.

```text
validated promoted profile
        |
        +--> mesh-mvp-v1
        |      THREE.Shape -> ExtrudeGeometry
        |
        +--> occt-wasm-v5
               Line loop -> edges -> wire -> face -> prism
               Circle    -> circle edge -> wire -> face -> prism
```

The CI gate includes `scripts/profile-parity-smoke.mjs`. It constructs representative promoted polyline and Circle profiles in both Three.js and OpenCascade and checks dimensions and volume within a defined tolerance.

Promoted-profile Hole/Cut operations route preview/STL through the exact kernel. This avoids treating an outside/grazing Boolean as a Three.js `Shape.holes` case. A plain promoted extrusion can still use the lightweight path; STEP always uses OpenCascade.

## UI behavior

When Sketch is selected, the workspace shows the current manufacturing profile separately from the next construction candidate:

- named rectangle, promoted Line loop or promoted Circle;
- active-profile validity;
- candidate `VALID / NOT READY` state;
- area and perimeter;
- polygon winding when applicable;
- the first blocking reason when a candidate is not ready.

Promoted profile entities are rendered distinctly from construction geometry. Editing or dragging a promoted entity changes the actual manufacturing profile after the deterministic constraints are re-applied.

## Safety boundary

The application must never show one outer profile in the viewport while exporting another profile in STL/STEP. If the active promoted profile cannot be validated, `rebuildProject()` does not create a solid. Mixed arcs, holes/nested loops and arbitrary planes will be enabled only after the same parity rule is extended to those cases.
