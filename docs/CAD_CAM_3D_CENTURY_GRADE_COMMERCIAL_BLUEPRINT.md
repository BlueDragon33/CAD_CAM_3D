# CAD_CAM_3D — Century-Grade Commercial Product Blueprint

Status: **PROJECT CANONICAL BLUEPRINT**
Project: `BlueDragon33/CAD_CAM_3D`
Minimum Blueprint Level: **B4 PLATFORM**
Current implementation branch: `foundation/general-system`

## 0. Authority and precedence

This document is the project-level canonical blueprint. It does not replace the Universal Constitution.

Governing order:

```text
Human Constitutional Authority
        ↓
Software-Blueprint-Hub Universal Constitution 1.2.0
        ↓
Universal Century-Grade Construction Standard
        ↓
This CAD_CAM_3D Project Blueprint
        ↓
Domain/architecture documents + ADRs + Work Packages + Quality Gates
        ↓
Generated execution prompt
        ↓
Implementation
```

Pinned constitutional reference used when this blueprint was established:

- repository: `BlueDragon33/Software-Blueprint-Hub`
- revision: `efa7ea02a49d31e18305452813f502dd8ce6ce25`
- policy: `blueprint-os:universal-century-grade`
- policy version: `1.2.0`
- project adoption: `.blueprint/constitution-adoption.json`

If the active Universal Constitution changes, this project must surface migration work truthfully. It may not silently continue under an obsolete constitutional assumption.

## 1. Product charter

CAD_CAM_3D is an **AI-first parametric CAD system for small functional 3D-printable engineering parts**.

Primary jobs:

- turn an idea, rough sketch, measurements or natural-language intent into editable parametric CAD;
- design practical parts for UAV, UGV, USV, robotics, electronics and maker workflows;
- preserve editable engineering intent instead of producing opaque one-shot meshes;
- validate printability and export manufacturing-ready geometry;
- allow a user to move from concept to slicer/printer with minimal unnecessary friction;
- remain useful locally even when optional cloud, management, sync, billing or AI services are unavailable.

The product is not initially attempting to clone every enterprise-CAD capability. It should win by being unusually fast and understandable for the recurring jobs of small functional part design.

## 2. Commercial product thesis

The commercial product should be valuable enough that users pay for saved engineering time, reduced design mistakes and a smoother design-to-print workflow.

Target customer groups:

1. makers and serious hobbyists;
2. robotics/UAV/UGV/USV builders;
3. electronics enclosure and mounting designers;
4. technical students, labs and engineering educators;
5. small engineering teams and prototyping shops;
6. professional users who need fast parametric printable-part design without a heavyweight CAD workflow.

Commercial differentiation should come from the combination of:

- AI-assisted **parametric** design, not AI-generated throwaway mesh;
- deterministic editable feature history;
- strong small-part 3D-printing intelligence;
- reusable electronics/robotics component knowledge;
- local-first/offline-capable core;
- exact B-Rep/STEP path where engineering precision matters;
- fast lightweight path where interactivity matters;
- explicit printability, tolerance and manufacturability feedback;
- calm, professional UX that shortens common tasks;
- portability of project data and manufacturing exports;
- optional collaboration/commercial services without making the core hostage to them.

Do not compete by accumulating random features. Every major capability must strengthen a target job or the platform structure needed to support those jobs.

## 3. Non-negotiable inherited constitutional qualities

All seven century-grade qualities are mandatory.

### 3.1 Structural Capacity

The foundation must support substantial future growth without requiring a rewrite of canonical product meaning.

Rules:

- stable domain types and project contracts precede UI convenience;
- kernel-specific handles/hashes never become durable project identity;
- external providers sit behind ports/adapters;
- project persistence is versioned and migratable;
- account, license, sync and collaboration concerns must not leak into CAD geometry semantics;
- future team/cloud services may be added without breaking standalone/local project ownership;
- capabilities expand by explicit modules/contracts, not cross-cutting conditionals scattered through the codebase.

### 3.2 Architectural Longevity

- `CadProject`, feature history, topology references, manufacturing intent and project schema must outlive any single UI framework, hosting provider, AI vendor or billing vendor.
- File formats and public contracts need compatibility/deprecation rules.
- A framework migration must not require redefining what Sketch, Extrude, Hole, Cut, Fillet, Chamfer, Profile, FaceTopologyRef or EdgeTopologyRef mean.
- Architecture decisions must record when replacement is justified.

### 3.3 Product Elegance

UI target: calm, technical, dense only where useful, visually restrained and timeless.

Rules:

- one coherent design system;
- strong information hierarchy;
- avoid dashboard/card clutter inside the modeling workspace;
- no decorative complexity that competes with geometry;
- no duplicate navigation systems;
- desktop is the full engineering workspace;
- tablet is touch-optimized;
- phone is review/inspection-first until authoring UX is genuinely proven;
- do not expose internal version labels in ordinary product UI merely for developer convenience.

### 3.4 Premium Usability

A commercially successful CAD product cannot rely on “it technically works”.

Critical journeys must become fast and obvious:

- new project → sketch → constrain → feature → inspect → export;
- edit upstream dimension → predictable rebuild;
- click a face → add a feature there;
- select an edge → fillet/chamfer;
- import/open existing project → continue editing safely;
- export STL/STEP/3MF with clear readiness feedback;
- recover from invalid feature/rebuild state;
- understand why AI proposed a change before committing it.

### 3.5 Long-Term Durability

- project schema migrations are explicit and tested;
- dependencies are pinned or governed where breakage is consequential;
- geometry parity and regression tests remain mandatory;
- do not accumulate CSS override piles or compatibility hacks;
- remove superseded code paths after migration evidence;
- every temporary workaround needs an owner/removal trigger;
- upgrades must not silently change saved project meaning.

### 3.6 Fortress Security & Disaster Resilience

- UI visibility is never authorization;
- local files and user engineering data remain under explicit ownership;
- cloud/team tenancy must be isolated by trusted boundaries;
- billing entitlement is distinct from authentication and distinct from project-data authority;
- plugin, AI and Application Management permissions are bounded;
- secrets never enter prompts/project files;
- canonical mutation, Quality Gate PASS and Production release remain separate authorities;
- backup/export/restore are designed for user-owned engineering work;
- compromise should be detectable, containable and recoverable.

### 3.7 Operational Sovereignty & Dependency Minimization

Default dependency preference:

```text
local/browser/desktop
  > open/self-controlled
  > replaceable free external
  > optional paid external
  > required paid external only with explicit justification
```

The core CAD workflow must not require:

- Application Management;
- Google Drive;
- a paid database;
- a specific AI provider;
- a specific hosting provider;
- a billing provider;
- a central cloud account,

unless the specific capability inherently requires one.

AI is optional intelligence. Project state remains canonical elsewhere.

## 4. “100-floor” structural model

“100 floors” means **the structure can support a very large product without demolition of the foundation**. It does not mean creating 100 modules now.

Do not manufacture layers merely to satisfy a number. Build only justified floors, but reserve clean structural zones and interfaces so future growth has somewhere to go.

### Floors 1–10 — Product meaning and canonical contracts

Capacity for:

1. product charter;
2. user/job model;
3. project identity;
4. units and dimensional semantics;
5. canonical project schema;
6. feature identity;
7. parameter model;
8. capability registry;
9. error/diagnostic model;
10. compatibility/version policy.

Load-bearing rule: no UI or provider may redefine canonical CAD meaning.

### Floors 11–20 — Persistence, provenance and migration

Capacity for:

11. deterministic project serialization;
12. file validation;
13. schema migrations;
14. import provenance;
15. undo/redo event semantics;
16. revision snapshots;
17. crash recovery;
18. local autosave;
19. export/archive;
20. optional sync boundary.

Core user projects remain portable and recoverable.

### Floors 21–30 — Sketch and constraints

Capacity for:

21. Line;
22. Circle;
23. Arc;
24. Rectangle convenience;
25. snap/anchors;
26. dimensions;
27. geometric constraints;
28. closed-loop/region analysis;
29. sketch solver evolution;
30. arbitrary planar sketch attachment.

The application-level deterministic solver may evolve into a stronger geometric solver without changing sketch intent semantics.

### Floors 31–40 — Exact geometry and topology

Capacity for:

31. kernel abstraction;
32. OpenCascade exact B-Rep;
33. tessellation;
34. stable semantic lineage;
35. FaceTopologyRef;
36. EdgeTopologyRef;
37. topology evolution;
38. exact geometry queries;
39. STEP interoperability;
40. future kernel replacement/secondary exact backend.

Raw runtime handles are never canonical state.

### Floors 41–50 — Parametric modeling

Capacity for:

41. Extrude;
42. Cut/Pocket;
43. Hole;
44. Fillet;
45. Chamfer;
46. Shell;
47. Revolve;
48. Sweep;
49. Loft;
50. Pattern/Mirror/Datum foundations.

Every feature must live in the same ordered semantic feature tree and rebuild deterministically.

### Floors 51–60 — 3D-print manufacturing intelligence

Capacity for:

51. build-volume validation;
52. wall/thickness checks;
53. clearance/tolerance guidance;
54. overhang/bridging analysis;
55. orientation guidance;
56. material/process profiles;
57. automatic split planning;
58. connector/joint strategy for split parts;
59. STL/STEP/3MF pipeline;
60. slicer/printer bridge adapters.

The product does not pretend to be a slicer unless that scope is explicitly adopted later.

### Floors 61–70 — AI engineering intelligence

Capacity for:

61. natural-language intent parsing;
62. structured feature-plan generation;
63. parameter-edit commands;
64. sketch interpretation;
65. component-aware design;
66. manufacturability suggestions;
67. design review;
68. alternative proposals;
69. explanation/rationale;
70. bounded automation with user-review policy.

AI writes validated structured operations against the same feature tree. It never becomes a hidden parallel geometry system.

### Floors 71–80 — Commercial multi-user product

Capacity for:

71. user identity;
72. workspace/organization;
73. membership/roles;
74. project ownership/sharing;
75. entitlements;
76. seat/device licensing;
77. optional sync;
78. team collaboration;
79. audit and support diagnostics;
80. privacy/export/deletion workflows.

Commercial architecture rules:

- authentication != authorization != entitlement;
- tenant/workspace isolation is server-enforced where cloud services exist;
- opening and exporting a user-owned local project must have a defined degraded path during temporary account/provider outage;
- plan names/prices are product configuration, not hard-coded domain invariants;
- payment vendor is an adapter;
- license checks must not corrupt or seize user-owned project files.

### Floors 81–90 — Extensibility and ecosystem

Capacity for:

81. component catalog providers;
82. import adapters;
83. export adapters;
84. slicer bridges;
85. printer profiles;
86. material databases;
87. automation/API;
88. plugin capability manifests;
89. extension compatibility;
90. third-party governance/sandboxing.

Extensions never receive implicit file-system, project-mutation, account, billing or production authority.

### Floors 91–100 — Security, QA, operations and governance

Capacity for:

91. threat model;
92. trust boundaries;
93. automated regression;
94. geometry parity;
95. performance budgets;
96. observability/diagnostics;
97. backup/restore and disaster recovery;
98. release/rollback;
99. constitutional compliance;
100. human acceptance and Production authority.

These floors are the roof/control structure: the taller the product becomes, the more important they become.

## 5. Architectural zones and dependency direction

Preferred dependency direction:

```text
UI / Interaction
       ↓
Application Use Cases
       ↓
Domain + Parametric Model
       ↓
Canonical Contracts
   ↙       ↓        ↘
Kernel   Persistence   Manufacturing
Adapters   Ports         Rules
   ↘       ↓        ↙
External Providers / Browser / Desktop / Cloud
```

Forbidden dependency inversion:

- domain importing React/UI components;
- project schema depending on billing/provider SDK types;
- canonical feature types depending on OCCT runtime handles;
- print rules encoded inside UI-only code;
- AI response text directly mutating geometry without validation;
- commercial entitlement checks embedded inside geometry algorithms;
- Application Management becoming the owner of CAD project data.

## 6. Canonical ownership model

### CAD_CAM_3D owns

- project files;
- project schema;
- parametric features;
- sketches/constraints;
- semantic topology references;
- B-Rep/mesh derivations;
- manufacturing intent;
- STL/STEP/3MF exports;
- local autosave/recovery;
- AI design intent after it is converted into validated operations.

### Quản trị Ứng dụng may own/manage

- app registration;
- management-device access metadata;
- application policy;
- feature flags;
- print-policy defaults;
- safe runtime status;
- safe audit metadata.

It must not mirror or own private CAD project geometry/content.

### Optional commercial cloud may own

Only data explicitly assigned to it by contract, such as:

- account identity;
- workspace membership;
- entitlement;
- optional sync metadata/content;
- collaboration state;
- subscription/billing references.

Cloud ownership must remain separable from local project ownership.

## 7. Local-first + optional-cloud runtime model

Core mode:

```text
Local Project
   ↓
Local CAD Engine
   ↓
Local Preview / Exact WASM
   ↓
Local Save / Export
```

Optional services attach through replaceable adapters:

```text
          ┌─ Optional AI provider
          ├─ Optional sync provider
Local Core├─ Optional account/licensing service
          ├─ Optional collaboration service
          ├─ Optional component catalog
          └─ Optional Application Management
```

No optional branch may become an accidental boot dependency for the local core.

## 8. Commercial packaging architecture

Do not bind code to final marketing plan names.

Use capability/entitlement contracts, for example:

- core modeling capability;
- advanced exact modeling capability;
- AI assistance quota/capability;
- manufacturing intelligence;
- component library packs;
- team collaboration;
- organization administration;
- premium support/enterprise controls.

Plan packaging maps to capabilities outside the domain core.

Required properties:

- entitlement state is inspectable;
- offline/degraded behavior is explicit;
- grace/revalidation policy is explicit;
- local data stays readable/exportable under defined conditions;
- billing failure does not mutate geometry;
- account deletion/export behavior is explicit;
- provider migration path exists.

## 9. Multi-user and tenancy readiness

When cloud collaboration is introduced, use an explicit tenancy model.

Conceptual entities:

```text
User
Workspace / Organization
Membership
Role / Capability Grant
ProjectReference
Optional ProjectSyncReplica
Entitlement
LicenseSeat / DeviceGrant
AuditEvent
ExternalProviderLink
```

Rules:

- one object has one canonical owner;
- every cloud query/mutation carries trusted tenant context;
- tenant isolation tests are mandatory;
- share links/tokens are scoped and revocable;
- audit records must not leak private geometry unnecessarily;
- support access is explicit and auditable;
- project synchronization uses conflict semantics, not silent last-write-wins by convenience.

## 10. CAD domain invariants

1. `CadProject` is the editable source of truth.
2. Semantic feature history is ordered and rebuildable.
3. UI state is not geometry truth.
4. Runtime kernel handles are transient.
5. Exact and lightweight paths consume the same semantic project.
6. Preview and export may not intentionally represent different solids.
7. A feature that cannot be represented safely must fail/diagnose rather than fake success.
8. Topology remapping prefers semantic lineage and rejects ambiguous targeting.
9. Project migration must not silently change geometry meaning.
10. AI proposals become geometry only through validated feature operations.

## 11. Kernel strategy

Keep the dual-kernel architecture:

### Fast path

Purpose:

- interactive feedback;
- simple preview;
- lightweight STL where parity is proven.

### Exact path

Purpose:

- B-Rep truth for capabilities requiring exact topology;
- STEP;
- exact edge/face operations;
- topology lineage;
- parity fallback.

### Kernel contract rule

Application/domain code targets an explicit kernel interface/capability model. It must remain possible to:

- upgrade OpenCascade/WASM;
- add a worker boundary;
- move heavy exact operations to desktop/native;
- add another backend for specialized workloads,

without changing project meaning.

## 12. AI architecture

AI is a bounded engineering assistant.

Pipeline:

```text
User intent
   ↓
Intent normalization
   ↓
Structured operation proposal
   ↓
Schema + capability validation
   ↓
Constraint/manufacturing checks
   ↓
Preview/diff
   ↓
User or policy-approved commit
   ↓
Canonical feature-tree mutation
```

Forbidden:

- hidden one-shot mesh replacement;
- AI inventing unsupported kernel capability;
- AI declaring a gate PASS without evidence;
- AI directly changing billing/security/production authority;
- raw private project data leaving the local boundary without declared provider/data policy.

## 13. Component and robotics domain strategy

A reusable component catalog should be semantic, not merely a mesh warehouse.

Future component contract may include:

- stable component identity;
- manufacturer/part family;
- mechanical envelope;
- mounting-hole pattern;
- keep-out volume;
- connector/cable clearance;
- mass metadata where known;
- orientation constraints;
- fastener compatibility;
- source/provenance;
- optional preview mesh;
- optional exact reference geometry.

Priority domains:

- ESP32 / Raspberry Pi / Jetson classes;
- servos and NEMA motors;
- batteries/cells;
- M3/M4/M5 fasteners;
- bearings;
- carbon tubes;
- GPS/cameras/LiDAR;
- antennas;
- electronics housings;
- UAV/UGV/USV mounts and adapters.

Catalog data must not silently become a dependency on one vendor service.

## 14. UI/UX constitution for this product

Workspace layout should remain engineering-first:

- geometry is primary;
- feature tree is persistent and understandable;
- inspector shows only context-relevant controls;
- mode changes are explicit;
- destructive changes are reversible;
- diagnostics point to the affected feature;
- AI command surface does not displace manual CAD controls;
- advanced complexity is progressively disclosed.

Required states:

- loading;
- empty;
- invalid project;
- invalid feature/rebuild;
- exact-kernel loading;
- provider unavailable;
- offline;
- save failure;
- migration required;
- permission denied;
- entitlement unavailable;
- recoverable conflict;
- export blocked;
- export success with evidence.

Accessibility:

- keyboard-accessible primary actions;
- visible focus;
- semantic labels;
- contrast appropriate for long technical sessions;
- no color-only critical state;
- reduced-motion behavior where applicable.

## 15. Performance architecture

Performance must be budgeted and measured, not guessed.

Separate budgets for:

- app startup;
- project open;
- interactive sketch;
- fast rebuild;
- exact rebuild;
- tessellation;
- STL/STEP/3MF export;
- large feature trees;
- component catalog;
- optional sync.

Before commercial Release, define hardware/browser reference classes and measurable P50/P95 targets.

Rules:

- exact kernel remains lazy where possible;
- move heavy work off the UI thread when evidence requires it;
- cancellation/stale-result protection is mandatory for long operations;
- cache only derived data that can be invalidated safely;
- performance optimization may not bypass canonical correctness.

## 16. Data and file-format evolution

Every durable project format requires:

- schema version;
- validation;
- migration chain;
- migration tests;
- unknown-version behavior;
- corrupt-file behavior;
- export/backup path;
- provenance where imported;
- deterministic serialization where practical.

A future commercial cloud sync format must not silently become a different canonical CAD model.

## 17. Security model

Threat surfaces include:

- malformed project/import files;
- plugin code;
- AI/provider calls;
- account/session theft;
- tenant-crossing requests;
- license/entitlement tampering;
- sync conflicts;
- external component metadata;
- malicious or huge geometry causing denial of service;
- supply-chain dependencies;
- browser/WASM boundaries.

Controls scale with risk:

- input limits/validation;
- least privilege;
- capability-based extension access;
- trusted-boundary authorization;
- dependency review;
- CSP/secure hosting where web-hosted;
- secure secret storage;
- audit without private-content leakage;
- signed entitlement/license artifacts where offline validation is required;
- rate/resource limits for cloud services;
- backup/restore for authoritative service data.

## 18. Dependency budget

Every non-trivial external dependency must record:

- purpose;
- owner;
- runtime class;
- cost class;
- data leaving user control;
- credentials/scopes;
- offline/degraded behavior;
- canonical-data owner;
- export/restore;
- replacement path;
- review/removal trigger.

Current strategic dependencies:

- React/Vite/Three.js: implementation/UI/preview technology, replaceable;
- OpenCascade via `occt-wasm`: exact-kernel provider, important but not allowed to define project identity;
- GitHub: source/review/CI, not end-user mutable database;
- Application Management: optional management/control-plane;
- AI providers: optional intelligence adapters.

Any future billing/auth/sync provider must be added to the dependency budget before becoming a core dependency.

## 19. Quality model

Mandatory quality loop:

```text
REPRODUCE
  ↓
CLASSIFY
  ↓
ROOT CAUSE
  ↓
FIX
  ↓
REGRESSION TEST
  ↓
RETEST
  ↓
WHOLE-SYSTEM CHECK
```

Core test families should grow to include:

- project schema/migration;
- sketch/constraint;
- region/profile;
- mesh/exact parity;
- topology lineage;
- feature rebuild order;
- selection/remap;
- STL/STEP/3MF;
- import robustness;
- manufacturing rules;
- entitlement isolation;
- tenant isolation;
- offline/degraded behavior;
- provider replacement;
- UI critical journeys;
- accessibility;
- recovery/restore;
- performance budgets.

Never obtain PASS by disabling, weakening or bypassing the test that reveals the defect.

## 20. Commercial release gates

A commercially distributable release requires evidence beyond CI green.

### Gate A — Architecture Ready

Must prove:

- canonical ownership is explicit;
- dependency direction is understood;
- no provider owns domain meaning;
- project schema/migration contract exists;
- new capability fits a defined architectural zone.

### Gate B — CAD Correctness

Must prove as applicable:

- deterministic rebuild;
- geometry validity;
- mesh/exact parity;
- topology targeting safety;
- import/export validity;
- known limitations surfaced.

### Gate C — Product UX

Must prove critical journeys on:

- desktop;
- supported tablet behavior;
- phone review mode if shipped;
- keyboard/accessibility path;
- loading/error/offline/recovery states.

### Gate D — Commercial Safety

When accounts/licensing/cloud are present:

- authentication/authorization separation;
- entitlement behavior;
- tenant isolation;
- offline/degraded contract;
- user-data portability;
- deletion/export;
- billing-provider failure behavior.

### Gate E — Security/Resilience

- threat review;
- dependency review;
- recovery evidence;
- exact release revision;
- no secret exposure;
- rollback path.

### Gate F — Human Acceptance

Commercial-quality UX and high-impact behavior require human review.

### Gate G — Production Authority

Separate explicit owner action. No prompt, AI output, CI run, merge or constitutional PASS grants Production authority automatically.

## 21. Work-package discipline

Before a major capability is implemented, create or resolve a Work Package with:

- problem/job;
- scope;
- out-of-scope;
- owner;
- upstream dependencies;
- canonical data/contracts;
- UI/UX impact;
- security/trust impact;
- dependency-budget impact;
- migration impact;
- implementation slice;
- test/evidence plan;
- rollback;
- known limitations;
- next-stage contract.

Do not create Work Packages merely to number “floors”.

## 22. Development order from the current project state

Preserve the already validated foundation. Do not restart the product from scratch.

Recommended next structural sequence:

1. governance/adoption + this blueprint;
2. audit current code against blueprint boundaries;
3. arbitrary planar `SketchPlaneRef`;
4. planar sketch attachment/rebuild;
5. exact/mesh parity for attached sketch operations;
6. stronger sketch solver architecture;
7. Shell/Revolve/Pattern as demand justifies;
8. manufacturing intelligence;
9. 3MF workflow;
10. component catalog;
11. bounded AI planner;
12. local persistence/autosave/recovery;
13. packaging/desktop/offline hardening;
14. only then introduce account/sync/licensing infrastructure when commercial workflow needs it;
15. team/cloud services remain adapters around the local core.

## 23. Definition of “100-floor ready”

The project is “100-floor ready” when evidence shows that a large future capability can be added by extending an owned contract/module/adapter without rewriting unrelated foundations.

Evidence examples:

- adding a billing provider does not touch geometry semantics;
- replacing the AI provider does not migrate CAD project files;
- adding a new exact feature does not require UI-specific project fields;
- adding collaboration does not move canonical geometry into Application Management;
- upgrading OCCT does not invalidate durable topology references by design;
- adding a component pack does not require core-code forks;
- adding a second slicer/provider uses an adapter;
- a new subscription plan maps to capability entitlements without editing geometry algorithms.

It is not “100-floor ready” merely because there are many folders or interfaces.

## 24. Definition of commercially sellable

Commercial readiness means all of the following are true for the target release scope:

- the target user can complete a valuable real job;
- the result is correct enough for the declared engineering scope;
- time-to-result is meaningfully better than the user’s alternative workflow;
- the UX is coherent enough to trust and learn;
- failure states are recoverable;
- files are portable;
- privacy/ownership are understandable;
- paid capability boundaries are fair and technically clean;
- the product can be maintained and upgraded without recurrent rewrites;
- release claims are backed by evidence.

“Many buyers” is a product outcome, not an architecture checkbox. The architecture exists to let the product improve rapidly without losing correctness, trust or maintainability.

## 25. Hard prohibitions

Never:

- implement a new geometry truth parallel to `CadProject`;
- persist OCCT runtime handles/hashes;
- silently change project meaning during migration;
- show unsupported capabilities as enabled;
- fake remote management controls;
- let central Application Management own private geometry;
- require a paid provider for a capability that can safely remain local without explicit justification;
- make AI the only way to edit/open/export a project;
- bind pricing plan names into geometry/domain invariants;
- let CI green self-authorize commercial Release/Production;
- hide known correctness gaps with UI copy;
- weaken tests to make a gate green;
- create “100 layers” of speculative abstraction with no current structural purpose.

## 26. Blueprint evolution

This document may evolve as the product learns, but changes must:

1. remain subordinate to the active Universal Constitution;
2. preserve migration/compatibility truth;
3. identify affected modules/contracts;
4. record why the change is necessary;
5. update execution prompts after the canonical blueprint changes;
6. never rewrite old evidence to make a new architecture appear retroactively complete.

