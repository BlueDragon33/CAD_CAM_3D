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
        CAD kernel adapter
 preview now / OpenCascade-WASM later
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
3. Geometry is accessed through a kernel adapter so the UI is not tied to one CAD engine.
4. AI produces structured operations against the same parametric model; it does not bypass the model by generating an opaque mesh.
5. Printer, material and design-for-manufacture rules live outside the geometry kernel.
6. UAV, USV, UGV, robotics and electronics intelligence are domain modules layered over the general core.

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

The first code intentionally uses a preview box rather than pretending to be a full CAD kernel. It establishes project state, feature history, 3D viewing, command bridge and print validation boundaries. Exact modeling will replace the preview implementation behind the kernel boundary.
