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
- Operate as a managed level-1 client under the central **Quản trị Ứng dụng** control-plane when managed mode is enabled.
- Keep CAD project geometry, mesh payloads and exported manufacturing files owned by CAD_CAM_3D rather than copied into the central control-plane.
- Preserve local-first/offline-capable core behavior and keep external providers replaceable where practical.
- Build only justified capability floors, while keeping the structural foundation capable of large future commercial scale.

## Constitutional governance

CAD_CAM_3D adopts Blueprint OS Universal Constitution **1.2.0** at Blueprint Level **B4** through:

- `.blueprint/constitution-adoption.json`

The canonical project-level commercial/architecture source is:

- `docs/CAD_CAM_3D_CENTURY_GRADE_COMMERCIAL_BLUEPRINT.md`

The durable execution prompt is:

- `prompts/CAD_CAM_3D_MASTER_CENTURY_GRADE_EXECUTION_PROMPT.md`

Agents and contributors should begin with:

- `AGENTS.md`

The execution prompt is a projection, not the source-of-truth. Fundamental architecture changes belong in the canonical blueprint first.

## Application Management

The runtime managed-client contract is published at:

- `public/control/application-management.contract.json`

The runtime policy seam is:

- `src/management/policy.ts`

For compatibility with existing Application Management discovery tooling, repository-level metadata is also published at:

- `control/application-management.contract.json` using `application-management.contract/v1`

These contracts are metadata/policy boundaries only. Quản trị Ứng dụng may coordinate operational policy such as device-access metadata, UI policy, feature flags, print-policy defaults and safe audit metadata. It must not own or mirror CAD project data, B-Rep, meshes or manufacturing exports. Remote-admin/device-registry capabilities remain disabled until a real trusted backend exists.

See `docs/CONTROL_PLANE.md` for the boundary and rollout plan.

## Operational sovereignty

The local CAD project remains canonical and portable. Core project open/edit/rebuild/save/export must remain useful without a paid provider or mandatory cloud account.

Cloud sync, Google Drive, remote rendering/generation and AI providers are optional adapters. They may not redefine canonical CAD meaning or become a hidden boot dependency for the local core.

Canonical dependency posture:

- `.blueprint/dependency-budget.json`

## Release

Development work is performed away from Production and promoted only through the documented release gates.

Release operations and rollback:

- `docs/RELEASE_OPERATIONS.md`
- `docs/DEVELOPMENT_RELEASE_POLICY.md`
