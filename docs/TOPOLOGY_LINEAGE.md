# Semantic topology lineage

CAD_CAM_3D does not persist OpenCascade face or edge handles. Exact topology is rebuilt from `CadProject`, then runtime faces are attached to semantic ancestry for the duration of that rebuild.

## Base-face roles

The named rectangle keeps its existing roles:

```text
top
bottom
side:+x
side:-x
side:+depth
side:-depth
```

Promoted sketch profiles and regions seed side faces from the sketch entity that generated them:

```text
side:outer:line:<entityId>
side:outer:arc:<entityId>
side:outer:circle:<entityId>
side:hole:1:line:<entityId>
side:hole:2:circle:<entityId>
...
```

The classifier matches the exact base solid against the resolved manufacturing profile by surface type and exact 2D bounds. Line extrusion sides are planar; Arc/Circle extrusion sides are cylindrical.

Runtime hashes are used only to connect the current OpenCascade face to one of these semantic roles. They are never written into project JSON.

## Evolution

Immediately after exact base-solid construction, the semantic seed map is handed to `FaceLineageTracker`. The tracker then propagates ancestry through `cutWithHistory`, `filletWithHistory` and `chamferWithHistory` using OpenCascade modified/generated/deleted history.

This means an ordinary upstream sketch edit may change all runtime hashes while a surviving face still carries ancestry such as:

```text
<extrude-feature-id>:side:outer:line:<sketch-entity-id>
```

`FaceTopologyRef` and `EdgeTopologyRef` use that semantic ancestry first and geometry signatures second. Ambiguous matches are rejected rather than silently retargeted.

## Face-bound manufacturing operations

The current oriented Hole/Cut placement accepts planar ancestry from:

- top/bottom and four sides of the named rectangle;
- side faces extruded from promoted `Line` sketch entities;
- planar Line-derived inner-hole walls of a promoted region.

Arc/Circle side faces already receive semantic lineage, but they remain inspection-only for face-bound Hole/Cut because their local coordinates require cylindrical-surface parameters rather than a planar U/V frame.

## Safety boundary

The transient base-lineage registry exists only as a hand-off between exact base-solid construction and the lineage tracker created immediately afterward. Exact-kernel operations are serialized, and each base build replaces the registry contents. Project files continue to persist only semantic sketch/features and durable topology signatures.

## Next topology stage

The next attachment milestone is an explicit sketch-plane reference:

```text
planar FaceTopologyRef
    -> stable local frame
        -> SketchPlaneRef
            -> sketch entities in local U/V
                -> Extrude/Cut normal to that face
```

Curved-face sketching, nested islands and multi-body semantics remain separate later milestones.
