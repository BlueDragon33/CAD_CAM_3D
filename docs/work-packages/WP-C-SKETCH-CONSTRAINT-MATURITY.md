# WP-C — Sketch Constraint Maturity

Status: **COMPLETE — DETERMINISTIC CONSTRAINT DIAGNOSTICS ACCEPTED**
Project: `CAD_CAM_3D`
Depends on: WP-A / WP-B sketch-plane and attached-feature foundations.

## Problem

The current sketch solver intentionally applies a small deterministic subset of constraints, but its public state is mostly a degree-of-freedom estimate plus a boolean `fullyConstrained`. It does not yet distinguish a genuinely under-constrained sketch from redundant or contradictory constraints.

That is not sufficient for a commercial parametric CAD workflow because an apparently green sketch can carry conflicting intent.

## User job

When editing a Sketch, the user must be able to understand whether design intent is:

- empty;
- under-constrained;
- fully constrained by the current supported solver;
- over-constrained/redundant;
- inconsistent/contradictory.

The system must explain the conflict instead of silently choosing one constraint by execution order.

## Scope

Deliver:

- explicit `SketchConstraintState`;
- deterministic constraint-set analyzer;
- redundant-constraint detection;
- contradiction detection for the currently supported constraint vocabulary;
- dangling/invalid target detection for in-memory state;
- constraint-aware DOF reduction that does not credit conflicting/redundant constraints as independent intent;
- UI status and diagnostics;
- regression tests for constraint analysis;
- migration regression tests for project schemas v1-v7;
- CI unit-test gate.

## Current supported constraint vocabulary

- base-profile `centered`;
- named `width`;
- named `depth`;
- line `horizontal`;
- line `vertical`;
- point `coincident`;
- line `distance`;
- Circle/Arc `radius`.

This Work Package does **not** claim a full nonlinear geometric constraint solver.

## State contract

```ts
type SketchConstraintState =
  | "empty"
  | "under-constrained"
  | "fully-constrained"
  | "over-constrained"
  | "inconsistent";
```

Priority:

```text
invalid/conflicting intent → inconsistent
else redundant/excess intent with zero estimated DOF → over-constrained
else remaining DOF > 0 → under-constrained
else no attached entities → empty (except the implicit base rectangle)
else → fully-constrained
```

The implicit base rectangle remains fully constrained when centered + named width + named depth are present and non-conflicting.

## Initial contradiction classes

Must detect at least:

- multiple distance constraints on one Line with materially different values;
- multiple radius constraints on one Circle/Arc with materially different values;
- horizontal + vertical on a positive-length constrained Line;
- constraint references a missing entity;
- constraint kind targets an incompatible entity type;
- invalid point reference for entity kind;
- non-finite/invalid persisted constraint values are already blocked by project loader and remain blocked.

## Initial redundancy classes

Must detect at least:

- duplicate centered/width/depth constraints;
- repeated same orientation on one Line;
- repeated same distance/radius value on one entity;
- duplicate/reversed Coincident pair.

Redundancy is not silently deleted. It is surfaced so user intent is not rewritten behind the user.

## Dependency decision

Unit/migration regression needs a real test runner.

Introduce **Vitest** as a dev-only LOCAL_CORE dependency, documented in `docs/DEPENDENCY_BUDGET.md`.

It:

- sends no project/user data externally at runtime;
- is not shipped as a canonical product dependency;
- can be replaced by another local JS/TS test runner without changing CAD project meaning.

## Quality gates

PASS requires:

- unit tests for each initial contradiction/redundancy class;
- solveSketch state tests for base and attached sketches;
- schema migration regression covering v1-v7 acceptance/normalization;
- TypeScript PASS;
- unit tests PASS;
- exact B-Rep smoke PASS;
- production build PASS;
- no existing modeling regression.

## Exit criteria

The UI and semantic rebuild can distinguish and explain the five sketch states using deterministic evidence, with automated regression coverage, while explicitly continuing to describe the solver as application-level rather than a complete industrial geometric solver.

## Next-stage contract

A later solver backend may replace/augment the deterministic implementation only behind the same semantic constraint model and must preserve project compatibility or provide explicit migration.


## Completion evidence

Implemented through head `29d215060d36cb6372eac6abfdc62cae89125e64`.

GitHub Actions run `37493816315`:

- TypeScript: PASS;
- Vitest: **2 test files / 19 tests PASS**;
- exact B-Rep smoke suite: PASS;
- production build: PASS.

Regression coverage includes:

- conflicting Line distance values;
- conflicting Circle/Arc radius values;
- horizontal + vertical positive-length contradiction;
- missing/incompatible targets;
- duplicate equal dimensions;
- reversed duplicate coincidence;
- base fully-constrained state;
- attached empty/under/inconsistent states;
- redundant base intent → over-constrained;
- schema v1-v6 migration into current schema v7;
- schema-v7 round trip;
- invalid Pad source reference rejection;
- future schema rejection.

Manufacturing safety:

- inconsistent base Sketch blocks solid creation;
- inconsistent attached Sketch blocks profile promotion/material consumption;
- conflicts are preserved rather than applied according to incidental constraint order;
- redundant constraints remain persisted but receive no independent DOF credit.

## Accepted boundary

This Work Package does not claim a nonlinear industrial geometric solver. The accepted foundation is the explicit constraint-state/diagnostic contract and regression harness that a future stronger solver must preserve or migrate explicitly.
