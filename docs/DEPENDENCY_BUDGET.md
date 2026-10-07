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
| Browser localStorage | best-effort local recovery snapshots | LOCAL_CORE | local/free | none | normal versioned project document | recovery may be unavailable on quota/privacy failure; explicit Save remains usable | IndexedDB/filesystem recovery provider | size/quota/reliability evidence |
| Future identity/auth provider | account identity/session only | OPTIONAL_SYNC until commercial cloud is explicitly adopted | TBD | account/session metadata only | identity service, never CAD geometry | local project path requires an explicit degraded contract | standards/provider adapter migration | first commercial account rollout |
| Future billing provider | payment references feeding normalized entitlements | OPTIONAL_SYNC | paid/transactional | billing/customer references only | entitlement layer owns normalized grants | billing outage must not corrupt or seize local project files | replace billing adapter | first paid plan |
| Future sync/collaboration backend | optional cross-device/team state | OPTIONAL_SYNC | TBD | only explicitly synchronized project/revision data | local project + explicit sync contract | unsynced local state remains visible and recoverable | export/restore/provider migration | collaboration rollout |

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

## Constitutional dependency prohibitions

- No mandatory paid runtime is currently required for the core CAD workflow.
- GitHub is not an end-user mutable project database.
- Application Management is not a project/B-Rep/mesh/export store.
- AI is not the sole editor or canonical state owner.
- Provider SDK identifiers may not become feature/project identity.
- A dependency may not be promoted to `EXTERNAL_ESSENTIAL` without an explicit Product Authority decision, documented capability gap, cost owner, degraded behavior and exit path.
- Third-party license obligations remain governed by `THIRD_PARTY_NOTICES.md`; dependency sovereignty never bypasses license compliance.
