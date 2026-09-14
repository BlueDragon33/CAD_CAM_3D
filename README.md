# CAD_CAM_3D

AI-first parametric CAD workspace focused on small, manufacturable parts for 3D printing.

The system is designed to grow from a general CAD/printing foundation into deeper workflows for UAV, USV, UGV, robotics and electronics.

## Direction

`Idea / sketch / natural language -> parametric features -> 3D model -> print validation -> STL/3MF/STEP -> slicer`

## Development principles

- Start with a small, stable general core.
- Keep geometry, AI, manufacturing rules and UI decoupled.
- Prefer parametric and editable models over one-shot mesh generation.
- Optimize first for parts that fit common desktop 3D printers.
- Add UAV/USV/UGV domain intelligence as modules, not hard-coded assumptions.

The initial implementation lives on a development branch before being promoted to `main`.
