# Dependency Budget

This file records non-trivial external dependencies under the Blueprint OS operational-sovereignty rule.

## Runtime / product dependencies

| Dependency | Purpose | Runtime class | Cost class | Data leaving user control | Canonical owner | Offline/degraded behavior | Replacement / exit path | Review trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| React | UI composition | LOCAL_CORE | free/open | none | CAD_CAM_3D domain remains canonical | local app works | replace UI framework behind application/domain contracts | major UI rewrite or unsupported release |
| Vite | development/build tooling | LOCAL_CORE | free/open | none | source/project contracts | packaged build remains independent of Vite runtime | replace build tooling | major build/runtime migration |
| Three.js | viewport + proven lightweight geometry path | LOCAL_CORE | free/open | none | `CadProject` | exact path remains available for exact-only features | replace renderer/lightweight adapter | rendering limitations or maintenance risk |
| `occt-wasm@5.0.0` | exact OpenCascade B-Rep | LOCAL_CORE | free/open | none | `CadProject`; OCCT handles are transient | app can still open/edit simple projects; exact-only operations unavailable if kernel fails | preserve `CadKernel`/semantic contracts; upgrade or replace exact backend | correctness/security/performance/compatibility need |
| GitHub | source, review, CI evidence | OPTIONAL_PUBLISH | free/external | source/review metadata | source/version history only | local built application does not depend on GitHub | Git-compatible hosting / other CI | governance/availability/cost change |
| Application Management | optional app/device/policy coordination | OPTIONAL_SYNC | project-controlled external | safe operational metadata only | CAD engineering data remains CAD_CAM_3D | standalone/local-first mode | disable/replace control-plane adapter | management contract changes |
| AI provider(s) | optional engineering intelligence | OPTIONAL_INTELLIGENCE | provider-dependent | only data explicitly required by invoked AI capability | validated feature tree remains CAD_CAM_3D | manual CAD workflows continue | AI port/provider replacement | cost/privacy/capability change |

## Development-only dependencies

### Vitest

- purpose: deterministic TypeScript unit/regression tests for domain, migration and constraint behavior;
- owner: CAD_CAM_3D engineering/QA;
- runtime class: **LOCAL_CORE (development-only)**;
- cost class: free/open;
- data sent outside user-controlled boundary: none during test execution;
- credentials: none;
- canonical-data ownership: none; tests consume fixtures and source contracts;
- offline/degraded behavior: installed dependency is sufficient; shipped product does not depend on Vitest;
- export/backup: test source lives in Git;
- replacement path: Node test runner, Jest or another local runner can replace it without changing `CadProject` or public project files;
- removal/review trigger: test-stack consolidation, incompatibility with TypeScript/Vite, security issue, or materially better lower-dependency alternative.

Adding a development test runner does not grant any product/runtime/network authority.
