# WP-D1 — Deterministic Linear Pattern Foundation

Status: **FOUNDATION ACCEPTED**
Blueprint zone: Floors 41–50 — Parametric Modeling
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

Small functional printed parts frequently repeat holes and pockets. Manually duplicating features produces fragile feature trees and violates the product goal of editable parametric intent.

## User job

Select an earlier Hole or Cut, specify count, spacing and an axis, then rebuild a deterministic row of repeated instances without copying the source feature into canonical project data.

## Commercial value

Mounting-hole rows, vent slots and repeated fastening features are common across enclosures, robotics brackets, UAV/UGV/USV structures and maker parts.

## First vertical slice

- one source feature;
- source kind: Hole or Cut only;
- source must appear earlier in feature history;
- count includes the original source;
- count range 2–64;
- positive spacing;
- global source uses X or Z axis;
- face-bound source uses local U or V axis;
- pattern itself is exact-kernel-only initially;
- original source executes normally; Pattern executes instances 2..N;
- each derived instance gets deterministic runtime lineage identity based on pattern feature ID + instance ordinal;
- no copied source feature is persisted.

## Out of scope

- circular pattern;
- patterned Pad/Pocket/Shell/Fillet/Chamfer;
- feature groups;
- skipped instances;
- variable spacing;
- bidirectional/symmetric pattern;
- lightweight-kernel parity.

## Canonical contract

`LinearPatternFeature` owns:

- stable pattern feature ID;
- durable `sourceFeatureId`;
- `count`;
- `spacingMm`;
- `axis` = `x | z | u | v`.

Axis validity is checked against source placement.

## Safety

- source must resolve to an enabled earlier Hole/Cut;
- invalid source/axis blocks pattern execution;
- Boolean failure blocks exact result rather than silently omitting an instance;
- topology lineage uses derived instance IDs but project persistence stores only the pattern feature.

## Exit evidence

- schema migration/round-trip tests;
- deterministic validation tests;
- exact global Hole pattern smoke;
- exact face-local pattern smoke;
- topology history includes all derived instances;
- STEP/STL/preview exact routing;
- production build PASS.


## Acceptance evidence

Accepted on branch `foundation/general-system` at commit `64fb4647067bc8c1b9e32c1aeeb8e46ada9dc7be`.

GitHub Actions run `37573729773` / #381:

- TypeScript: PASS.
- Unit regression: PASS — 28 tests.
- Exact smoke suite: PASS.
- Linear Pattern global Hole smoke: PASS — 4×, final volume 14497.345 mm³.
- Linear Pattern face-local Hole analogue: PASS — 3×, final volume 13115.044 mm³.
- Production build: PASS.
- Schema v9 round-trip/migration and invalid-source checks: PASS.
- Semantic rebuild checks global/local axis rules and preserves one canonical source feature.

Known limits remain explicit: Hole/Cut source only, one direction, equal spacing, count 2–64, exact-kernel-only, no circular/bidirectional/skipped/group pattern.
