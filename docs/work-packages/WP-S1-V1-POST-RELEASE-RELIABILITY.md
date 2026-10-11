# WP-S1 — CAD v1 Post-Release Truth, Reliability & Manufacturing Validation

Status: **ACTIVE — S1-A in progress; physical/slicer acceptance remains unverified**
Baseline: `CAD_CAM_3D/main@e250a175a134d0b88330b25e0aa3f4815a3ab2dc`
Authority: Universal Constitution 1.2.0 / B4 > CAD Century-Grade Blueprint > canonical Work Packages > execution prompt
Product: local-first editable 3D-print CAD v1.0.0
Primary zone: Floors 91–100 (QA/operations) with manufacturing evidence in Floors 51–60

## Product job

Make v1 reliably useful for real mechanical parts: editable `CadProject` → deterministic rebuild → manufacturing analysis → local Save/Open/Recovery → STL/STEP/Core 3MF → independent slicer review → real-world measured fit when evidence is available.

This package deliberately **does not** make the CAD feature set broader merely to look complete.

## Why now

CAD v1 reached Production and Application Management successfully discovered its Universal Contract v1 on 2026-10-08. This verifies control-plane connectivity, not real printability or human-reviewed UX. Some repository documentation still referred to schema v12 after v13 shipped; an old Constitution B2 PR remains open although B4 is active. Those evidence/authority mismatches must be reconciled before expanding the feature matrix.

## Scope and sequence

### S1-A — Release/document truth and governance (first automated slice)

- [x] Identify exact v1 CAD and Application Management production revisions and live contract-probe evidence.
- [x] Compare project schema source with architecture docs; reconcile v13 and legacy migration wording.
- [x] Record live launch/observe-only App Manager integration and explicit missing Remote Admin authority.
- [x] Update runbook scope from the historical foundation branch to release/RC-revision testing.
- [ ] Gate architecture/schema documentation invariants in CI, without inventing capabilities.
- [ ] Classify PR #4 Constitution B2 adoption as current/superseded; preserve its history and never merge obsolete B2 into B4.
- [ ] Complete exact-head test/PR evidence and document whether any merge/Production authority is required.

### S1-B — Real functional/slicer conformance

- [ ] Verify a release-generated STL and Core 3MF in an independent slicer (Bambu Studio or OrcaSlicer), including **mm**, slicer **Z-up**, dimensions and object count.
- [ ] Verify STEP reopens in a separate STEP-capable application and represents the intended solid.
- [ ] Repeat for an exact split and optional aligned split, checking two independent objects, valid seam and corridor-verified pins/pockets.
- [ ] Reopen schema-v13 project, mutate upstream geometry, and check stale analysis/topology failure remains fail-closed.
- [ ] Record slicer version, test part, printer profile, file checksum, observed result, and screenshots only for failures/ambiguities.
- [ ] If independent slicer/manual evidence is absent, report **NOT VERIFIED**; browser CI cannot impersonate it.

### S1-C — Physical-print measurement and fit

- [ ] Choose one small, useful, reproducible mechanical test part.
- [ ] Record actual material, nozzle, layer height, printer, slicer compensation and target dimensions.
- [ ] Print, measure with calipers, compare to nominal, and record per-axis and registration-fit deviations.
- [ ] Calibrate `registrationClearancePerSideMm` for that specific printer/material only when physically measured.
- [ ] Retest modified settings. State explicitly that local empirical fit is **not certified structural or waterproof performance**.
- [ ] Human operator supplies measurements/observations; automation may analyze them but cannot fabricate print evidence.

### S1-D — First valuable vertical product workflow

- [ ] Select one verified enclosure, bracket, or component mount with datasheet-grounded dimensions and clear use case.
- [ ] Capture constraints/fit tolerances, editable feature tree, assembly/inspection needs and negative tests before implementing.
- [ ] Add the smallest complete parametric template/use case only if it fits v1 semantics without parallel geometry truth.
- [ ] Verify source dimensions/provenance and require explicit review when manufacturer evidence is missing.
- [ ] Evaluate usability/time-to-result with actual user tasks; no commercial product-fit claim without evidence.

### S1-E — Operational reliability and release decision

- [ ] Review launch/contract probe health, local/offline startup, recovery, import rejection, and export error reporting.
- [ ] Measure performance for typical and stress project sizes, record environment and distributions, then ratify budgets (no invented PASS).
- [ ] Keep Production deploy tied to exact main CI revision and record rollback target.
- [ ] Open post-v1 modeling work (constraint-solver, measurement/section, Sweep/Loft) only after S1 safety/product evidence or explicit Product Authority reprioritization.

## In scope / not in scope

In: QA, documentation truth, regression tests, post-release operability, slicer/print measurements, one bounded design use case if evidence justifies it.

Out: silent project migration; account/billing/cloud platform; paid runtime dependency; CAD geometry in App Manager; untrusted remote device mutations; redesign of whole CAD UI; broad CAD feature expansion; CAE/ECAD source-code coupling; automatic claim of manual test success.

## Contracts and ownership

- `CadProject` schema v13 is the only editable engineering truth; v1–v12 migrate to v13 through the normal validated parser.
- Mesh/tessellation/export results are derived; stale async results must reject rather than silently apply.
- CAD owns project, B-Rep, mesh, STL/STEP/3MF.
- App Manager owns only approved operational metadata/discovery/launch and is optional for core CAD operation.
- Geometry exchange with future Engineering Suite peers must use neutral versioned Z-up/mm artifacts, not direct imports.

## Dependency/security/trust impact

S1-A uses existing source/test/runtime tools; **no new production dependency**, secrets, backend, device privileges, or paid service. Slicer/printing evidence is gathered with user-controlled tools and does not require uploading proprietary CAD geometry to a third party.

No action may change production access, introduce `EXTERNAL_ESSENTIAL`, or claim Remote Admin without the separate trust/authority gate.

## Quality and acceptance mapping

- Q0/Q1: active B4 Constitution, canonical blueprint, contract ownership, no superseded B2 merge.
- Q2: v13 parser/migrations and documentation agree.
- Q3/Q4: deterministic project + exact geometry regressions as applicable.
- Q5: App Manager live probe remains truthful observe/launch-only.
- Q6: automated browser paths and separately labeled human UX/slicer observations.
- Q7: local-first, no new external-essential dependency, no remote mutations.
- Q8: full existing unit/exact/browser/build regression unaffected.
- Q9: user acceptance only for materially changed UX or genuinely observed physical workflows.
- Q10: exact SHA release evidence, rollback target, safe artifact.
- Q11: separate Production Authority; a green PR never authorizes publishing a new post-v1 release by itself.

## Evidence and limits

**Already evidenced at baseline** (2026-10-08):
- CAD CI + Production Pages: `main@e250a175a134d0b88330b25e0aa3f4815a3ab2dc`; CAD Pages workflow run `37793724466` succeeded.
- App Manager live deployment: `main@1e53634e85c467b35049cb65203d6441bf239c42`; workflow run `37795141964` succeeded.
- Dynamic Catalog: `cad-cam-3d` enrolled as `repository-bootstrap-upgraded`; live probe reported `contractConnected=true`, `runtimeConnected=true`, `managementMode=local-first`, `remoteAdminReady=false`, `credentialConfigured=false`, protocol `application-management.contract/v1`.

**Not evidenced**: physical print quality, calibrated dimensional accuracy, independent slicer/STEP inspection, broad usability with actual designers, structural joint performance, or paid product-market fit.

## Rollback

For documentation/test-only changes, revert the exact affected commits through normal PR history. Do not rewrite `main` or modify user project files. If an invariant or regression fails, repair on the branch before merge. Production deployment retains the existing exact-commit/CI workflow and prior known-good revision.

## Exit / next-stage contract

S1-A exits only after exact-branch CI and reviewed documentation. S1-B/C require independently recorded observations, not simulated checks. A broader next-generation modeling WP needs its own scope, migration decision, exact/topology tests, UX gate and explicit release authority when applicable.
