# WP-A — Arbitrary Planar Sketch Attachment

Status: **ACTIVE**
Project: `CAD_CAM_3D`
Governing blueprint: `docs/CAD_CAM_3D_CENTURY_GRADE_COMMERCIAL_BLUEPRINT.md`
Prompt: `prompts/CAD_CAM_3D_MASTER_CENTURY_GRADE_EXECUTION_PROMPT.md`

## Problem

The current sketch model is locked to the global XZ base plane. Exact face references already support durable planar-face targeting for Hole/Cut, but Sketch itself cannot yet attach to a selected planar face.

This blocks the normal CAD workflow:

```text
select planar face
  → Create Sketch
  → draw local geometry
  → rebuild after upstream edits
```

## User job

Allow a user to create a sketch on a selected exact planar face while preserving durable parametric attachment through ordinary upstream rebuilds.

## Commercial value

- removes a major workflow limitation compared with practical CAD systems;
- enables brackets, housings and multi-stage printable parts;
- establishes the foundation for face-based Pocket/Extrude operations;
- reduces coordinate-entry friction;
- makes AI-generated feature plans structurally realistic.

## Scope

This Work Package delivers:

- persisted `SketchPlaneRef`;
- global/base XZ plane compatibility;
- durable planar `FaceTopologyRef` attachment;
- local sketch-origin U/V offset captured from the face pick point;
- schema migration to v6;
- creation of a new attached Sketch from a selected supported planar face;
- Sketcher awareness of base-vs-attached local coordinates;
- rebuild diagnostics that treat attached Sketches as construction/feature inputs rather than replacing the base manufacturing profile;
- safe rejection/diagnostics for unsupported curved-face attachment.

## Out of scope

- curved-surface sketching;
- attached-sketch Extrude/Cut material operation (WP-B);
- multiple-body semantics;
- arbitrary datum planes/axes;
- nonlinear constraint solver replacement;
- cloud collaboration/licensing.

## Canonical owner

`CadProject.features[].kind === "sketch"` owns sketch intent.

The durable attachment is project data. Runtime OCCT hashes/handles remain transient.

## Proposed contract

```ts
type SketchPlaneRef =
  | { kind: "base-xz" }
  | {
      kind: "face";
      ref: FaceTopologyRef;
      originUMm: number;
      originVMm: number;
    };
```

Sketch entity coordinates remain 2D local coordinates. For a face-attached sketch, entity `x/z` fields are interpreted as local U/V coordinates relative to the captured sketch origin. This avoids duplicating geometry models during the transition.

## Dependency / security impact

No new external dependency.

No new network authority.

No project data ownership change.

## Migration

Schema v1-v5 Sketches migrate:

```text
plane: "XZ"
    ↓
plane: { kind: "base-xz" }
```

Schema v6 validates both base and face plane references.

Unknown/newer schema remains blocked.

## UI/UX

When an exact planar face is selected:

- Add Sketch creates a face-attached sketch;
- status must state that attachment is durable;
- feature tree indicates attached/base sketch;
- Sketcher labels coordinates as U/V for attached sketches;
- curved/unsupported face selection must not silently attach.

## Quality gates

PASS requires:

- TypeScript typecheck;
- production build;
- existing exact B-Rep smoke unchanged;
- schema v1-v5 compatibility preserved;
- v6 serialization/validation compiles and is documented;
- existing base Sketch → Extrude workflow unchanged;
- attached Sketch no longer replaces the base manufacturing profile during rebuild;
- capability is not described as material-producing until WP-B.

## Rollback

The schema migration is additive. Reverting implementation before release requires retaining the ability to read schema-v6 projects or explicitly blocking with a truthful compatibility message.

## Exit criteria

WP-A is complete when a planar face can be selected, an attached Sketch can be created and saved/opened as schema v6, and semantic rebuild preserves the existing solid while validating that attached sketch as a future feature input.

## Next-stage contract

WP-B may consume an attached Sketch only through `SketchPlaneRef` and must resolve the persisted face reference against exact topology immediately before applying the material feature.
