# Architecture

## Product boundary

CAD_CAM_3D is not intended to reproduce every enterprise-CAD feature. The core problem is to make small functional parts easy to design, modify and print while preserving editable parametric intent.

## Layer model

```text
User intent / sketch / measurements
              |
              v
       Interaction layer
   UI + command interpretation
              |
              v
       Parametric model
 sketch -> constraints -> features
              |
              v
        CAD kernel contract
 mesh MVP now / exact B-Rep later
              |
       +------+------+
       |             |
       v             v
3D visualization  Manufacturing rules
  Three.js/WebGPU   printer/material/process
       |             |
       +------+------+
              v
       Export + slicer bridge
       STEP / STL / 3MF
```

## Core rules

1. `CadProject` is the source of truth. UI state must not become the geometry model.
2. Features are ordered and rebuildable. Editing an upstream parameter must rebuild downstream geometry.
3. Geometry is accessed through a kernel contract so the UI is not tied to one CAD engine.
4. AI produces structured operations against the same parametric model; it does not bypass the model by generating an opaque mesh.
5. Printer, material and design-for-manufacture rules live outside the geometry kernel.
6. UAV, USV, UGV, robotics and electronics intelligence are domain modules layered over the general core.

## CAD kernel contract

`src/cad/kernel.ts` is the application-level geometry boundary. Viewport and manufacturing export call the same active kernel instead of importing a Three.js builder directly.

The current `mesh-mvp-v1` kernel explicitly declares its implemented capability set:

- deterministic mesh preview;
- STL export;
- no exact B-Rep topology;
- no STEP export yet;
- no claim of exact fillet/chamfer/shell support.

The future OpenCascade/WASM adapter must implement the same high-level contract while adding exact topology and interchange capabilities. Kernel-specific objects must not leak into `CadProject` or the React UI state.

## Project persistence

Editable project files use a versioned JSON envelope rather than serializing transient UI state.

```text
format: cad-cam-3d-project
schemaVersion: 1
savedAt: ISO timestamp
project: CadProject
```

Loading is validated field-by-field before a project can enter the workspace. Unsupported feature definitions, invalid dimensions, malformed constraints and unknown schema versions are rejected instead of being silently coerced.

Project JSON remains local engineering data owned by CAD_CAM_3D. It is not mirrored into the central Quản trị Ứng dụng control-plane.

## Planned modules

- Sketcher: primitives, snapping, dimensions and constraints.
- Parametric feature history: extrude, cut, hole, fillet, chamfer, shell, pattern, revolve.
- CAD kernel adapter: OpenCascade/WASM candidate for exact B-Rep operations.
- 3D viewport: selection, face/edge highlighting, sectioning, measurement.
- AI planner: natural language -> validated feature operations.
- Component catalog: electronics, fasteners, bearings, tubes and common robotics parts.
- Manufacturing intelligence: build-volume, nozzle, material, tolerance, wall, bridging and orientation checks.
- Export pipeline: STEP for editable interchange; STL/3MF for printing.

## Current foundation

The current code now has a deterministic parametric feature chain, a shared mesh kernel used by preview and STL export, STL preflight, and validated project save/reload. It still does not pretend to be an exact CAD B-Rep system. Exact topology, STEP interchange and exact edge operations will arrive behind the kernel contract.
