# Sketcher

The sketch subsystem is application/domain data. It is independent from Three.js rendering and OpenCascade runtime identity.

## Persisted model

Current project schema: **v7**.

Sketch primitives:

- Line;
- Circle;
- Arc.

Each entity has:

- stable project ID;
- geometry parameters;
- `construction` membership flag.

Supported constraint vocabulary:

- base-profile `centered`;
- named `width`;
- named `depth`;
- Line horizontal;
- Line vertical;
- point coincidence;
- Line distance;
- Circle/Arc radius.

Schema history relevant to Sketch:

- v5: persisted entities/constraints + construction/profile membership;
- v6: durable `SketchPlaneRef`;
- v7: attached Sketch may be consumed by Pad/Pocket.

## Sketch planes

### Base sketch

```ts
{ kind: 'base-xz' }
```

The base sketch owns the primary manufacturing profile that the first Extrude consumes.

### Attached planar sketch

```ts
{
  kind: 'face',
  ref: FaceTopologyRef,
  originUMm: number,
  originVMm: number
}
```

Entity x/z coordinates are interpreted as local U/V coordinates relative to the captured sketch origin.

A durable face reference is resolved after upstream rebuild. Runtime OCCT face hashes are never persisted.

Curved Arc/Circle-derived side faces are not accepted as planar sketch attachment.

## Interactive workspace

Selecting a Sketch opens the 2D editor.

Current tools:

```text
Select
Line
Circle
Arc
```

Interaction includes:

- 1 mm grid snap;
- entity-anchor snap;
- base rectangle anchors for the base sketch;
- near-horizontal/vertical inference;
- automatic Circle/Arc radius constraint on creation;
- coincidence capture when snapping to persisted anchors;
- entity selection and drag;
- direct Line length / Circle/Arc radius editing;
- horizontal/vertical toggle;
- dimension removal;
- safe dependent-constraint cleanup on entity deletion;
- explicit profile promotion.

Attached sketches deliberately do not render the base rectangle as if it belonged to the attached plane.

## Constraint state

The solver remains a deterministic application-level solver, not a full nonlinear industrial geometric solver.

The public sketch state is explicit:

```text
empty
under-constrained
fully-constrained
over-constrained
inconsistent
```

The constraint analyzer currently detects:

- conflicting Line distance values;
- conflicting Circle/Arc radius values;
- horizontal + vertical contradiction on a positive-length Line;
- missing entity references;
- incompatible constraint/entity types;
- invalid point references;
- duplicate centered/width/depth;
- duplicate orientation;
- repeated equal distance/radius;
- duplicate/reversed coincidence.

Rules:

- inconsistent constraints are preserved as user intent but are **not applied by execution order**;
- inconsistent base sketch blocks manufacturing solid creation;
- inconsistent attached sketch blocks Pad/Pocket consumption;
- redundant constraints are preserved and surfaced but do not receive independent DOF credit;
- a future stronger solver must preserve the semantic constraint contract or migrate it explicitly.

## Profile pipeline

```text
editable Line/Circle/Arc
      ↓
constraint analysis + deterministic solve
      ↓
closed-loop extraction
      ↓
intersection / containment validation
      ↓
explicit profile promotion
      ↓
ManufacturingProfile / ManufacturingRegionProfile
```

Supported promoted region:

- exactly one outer closed contour;
- zero or more direct inner holes;
- Line/Circle/mixed Line+Arc loops.

Rejected rather than guessed:

- intersecting/touching loops;
- multiple outer islands;
- nested islands deeper than direct holes;
- invalid/open/branched profiles.

## Material use

### Base sketch

Promoted/base profile → base Extrude.

### Attached planar sketch

Promoted attached profile → exact Pad or Pocket.

```text
selected planar face
  ↓
Create Sketch
  ↓
draw + constrain
  ↓
promote valid region
  ↓
Pad / Pocket
  ↓
resolve durable sketch plane
  ↓
exact OpenCascade fuse/cut
```

Pad/Pocket are exact-kernel first. The lightweight mesh path does not claim attached-material support.

## Regression

Vitest covers:

- contradiction classes;
- redundancy classes;
- sketch state;
- schema v1-v7 migration and invalid feature references.

Exact smoke separately covers profile geometry, side lineage and attached Pad/Pocket B-Rep behavior.

## Known boundaries

Not yet claimed:

- full nonlinear geometric constraint solving;
- tangent/perpendicular/parallel/equal/symmetry constraints;
- curved-surface sketch attachment;
- arbitrary datum plane/axis;
- nested-island/multi-body semantics;
- lightweight Pad/Pocket parity.

The next solver work should expand semantic constraint capability without creating a second sketch source-of-truth.
