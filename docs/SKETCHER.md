# Sketcher foundation

The sketch subsystem now has an application-level primitive model that is independent from Three.js and OpenCascade.

## Persisted sketch data

Project schema v5 adds `SketchFeature.params.entities` with three primitive types:

- `line`: start/end XZ points;
- `circle`: center + radius;
- `arc`: center + radius + start/end angle.

Each entity has a stable project ID and a `construction` flag. The editable project also supports entity-level constraints:

- horizontal / vertical;
- coincident point references;
- distance;
- radius;
- the existing centered/width/depth named-parameter constraints.

Older schema v1-v4 projects load with an empty construction-entity list and keep the existing centered rectangle manufacturing profile.

## Interactive workspace

Selecting a Sketch feature switches the center canvas to the XZ sketch workspace. The current tool set is:

```text
Select
Line
Circle
Arc
```

New construction geometry is written directly into `CadProject`, so Save/Open round-trips the sketch primitives instead of keeping them as disposable UI state.

The workspace provides:

- 1 mm grid snapping;
- snapping to the current manufacturing-profile corners/center;
- snapping to persisted entity anchors;
- automatic horizontal/vertical inference for near-orthogonal lines;
- automatic radius constraints for Circle/Arc creation;
- coincident constraints when new geometry starts/ends on an existing entity anchor;
- estimated degrees-of-freedom diagnostics.

## Current manufacturing boundary

The manufacturing profile is still the existing centered rectangle driven by the named `width` and `depth` parameters. Schema-v5 line/circle/arc entities are currently persisted **construction geometry** and do not silently alter the extruded solid.

This restriction is intentional. Arbitrary closed-loop profile extrusion must be implemented end-to-end in both the lightweight mesh path and the OpenCascade exact path before a non-construction primitive is allowed to change manufacturing geometry.

Therefore the current invariant is:

```text
CadProject sketch entities
        ↓
constraint / snap / DOF model
        ↓
interactive 2D sketch workspace

centered named-parameter rectangle
        ↓
current manufacturing profile
        ↓
mesh + exact B-Rep kernels
```

## Next sketch milestones

1. Entity selection, drag editing and explicit dimension editing.
2. Constraint solving instead of only constraint capture/diagnostics.
3. Closed-loop detection and profile regions.
4. Promote validated line/arc loops and circles from construction geometry into manufacturing profiles.
5. Build the same arbitrary planar profile in both geometry kernels.
6. Add arbitrary sketch-plane references on exact planar faces.
7. Feed the stronger profile model into Revolve, Pattern, Sweep and Loft.

The goal is to grow the sketcher without creating a second geometry source of truth or allowing preview/export divergence.
