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
- Operate as a managed level-1 client under the central **Quản trị Ứng dụng** control-plane.
- Keep CAD project geometry, mesh payloads and exported manufacturing files owned by CAD_CAM_3D rather than copied into the central control-plane.
- Preserve local-first/offline-capable core behavior and keep external providers replaceable where practical.
- Build only justified capability floors, while keeping the structural foundation capable of large future commercial scale.

## Constitutional governance

CAD_CAM_3D adopts the Blueprint OS Universal Constitution through:

- `.blueprint/constitution-adoption.json`

The canonical project-level commercial/architecture source is:

- `docs/CAD_CAM_3D_CENTURY_GRADE_COMMERCIAL_BLUEPRINT.md`

The durable execution prompt is:

- `prompts/CAD_CAM_3D_MASTER_CENTURY_GRADE_EXECUTION_PROMPT.md`

Agents and contributors should begin with:

- `AGENTS.md`

The execution prompt is a projection, not the source-of-truth. Fundamental architecture changes belong in the canonical blueprint first.

## Application management

The management contract is published at `public/control/application-management.contract.json` and the runtime policy seam is in `src/management/policy.ts`.

Quản trị Ứng dụng is allowed to manage operational policy such as device access metadata, UI policy, feature flags, print-policy defaults and safe audit metadata. It must not become the storage layer for CAD project data.

See `docs/CONTROL_PLANE.md` for the boundary and rollout plan.

The initial implementation lives on a development branch before being promoted to `main`.
