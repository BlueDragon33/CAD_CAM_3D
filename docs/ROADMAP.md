# Roadmap

The roadmap progresses from a general system into deep domain workflows. Each stage must remain usable before the next stage expands scope.

## Foundation — active

- Web workspace shell.
- Parametric project schema.
- 3D viewport and camera controls.
- Feature-history concept.
- Basic print-profile validation.
- Natural-language command bridge.
- Architecture boundary for an exact CAD kernel.

Exit gate: repository builds cleanly and the workspace can edit a simple part envelope without UI/kernel coupling.

## Exact CAD core

- Integrate OpenCascade/WASM behind `CadKernel`.
- Sketch primitives: line, rectangle, circle, arc.
- Dimensions and geometric constraints.
- Extrude and cut.
- Hole feature.
- STEP + STL export.
- Deterministic rebuild from project JSON.

Exit gate: create, edit, save, reload and export a real parametric bracket/enclosure.

## Printable-part intelligence

- Fillet, chamfer, shell and patterns.
- Printer and material profiles.
- Minimum-wall and clearance checks.
- Build-volume and orientation analysis.
- Split oversized parts with alignment/fastening strategies.
- 3MF export and slicer handoff.

Exit gate: design a functional part and receive actionable printability feedback before slicing.

## AI engineering layer

- Text -> structured feature plan.
- Sketch/image interpretation -> editable geometry proposal.
- Conversational parameter editing.
- Feature recognition and repair suggestions.
- AI must explain planned changes before destructive operations.

Exit gate: generate and revise useful parametric parts without requiring the user to know every CAD command.

## Domain depth

Add modules without contaminating the general core:

- Electronics enclosures and PCB mounting.
- Fasteners, inserts and bearings.
- Carbon/aluminium tube clamps and adapters.
- UAV mounts, payload brackets, landing and sensor parts.
- UGV motor, sensor, battery and wheel interfaces.
- USV watertight housings, antenna/sensor mounts and serviceable joints.

Exit gate: domain templates create editable feature trees rather than fixed meshes.

## Later expansion

Assembly, interference checks, mass properties, configurable component libraries, simulation hooks and CAM-related workflows are added only when the small-part CAD/printing loop is reliable.
