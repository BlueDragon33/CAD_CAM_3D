# WP-E — Manufacturing Intelligence Foundation

Status: **ACTIVE**
Blueprint zone: Floors 51–60 — 3D-print Manufacturing Intelligence
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

The current print-readiness panel is intentionally lightweight and can defer envelope truth when exact-only features change the final solid. A commercial printable-part CAD product needs one canonical manufacturing-readiness report that uses the final geometry path, explains risk, and never presents a heuristic as guaranteed print success.

## User job

Before export or slicing, answer:

- does the final rebuilt part fit the selected printer volume?
- are obvious nozzle-scale features likely to print inaccurately?
- is a Shell wall suspiciously thin for the selected nozzle?
- is design intent constrained enough to avoid accidental drift?
- is there a geometry/rebuild condition that should block export?
- what should the user do next?

## First vertical slice

- asynchronous adaptive manufacturing analysis;
- use lightweight geometry dimensions only when the project is genuinely lightweight;
- use exact OpenCascade final dimensions for exact-only projects;
- structured findings with category, severity, feature reference, remedy, and explicit export-blocking flag;
- selected-printer build-volume evaluation against final dimensions;
- nozzle-relative minimum-envelope and Hole checks;
- Shell thickness heuristic;
- sketch constraint/rebuild diagnostic projection;
- exact-kernel warning projection;
- no claim that heuristics guarantee printability.

## Severity model

- `ok`: evidence-backed check passed;
- `warning`: likely manufacturing/design risk; does not automatically block export;
- `blocker`: invalid/incomplete geometry or project state that makes the requested manufacturing artifact unsafe to certify.

`blocker` and `blocksExport` are deliberately separate fields. A part exceeding the selected printer volume is a blocker for that printer profile but does not make STL/STEP/3MF mathematically invalid.

## Truth boundaries

- final envelope comes from the geometry path capable of representing every enabled feature;
- no lightweight rectangle-envelope fallback may certify an exact-only solid;
- nozzle/wall thresholds are heuristics and must be worded as such;
- slicer-specific support/orientation/time predictions remain out of scope until evidence and adapters exist.

## Exit evidence

- unit tests for build-volume, nozzle-scale and Shell findings;
- exact-path analysis exercised through existing exact kernel integration;
- UI can request and display the structured report;
- TypeScript, unit regression, exact-smoke and production build PASS.

## Next contract

After this foundation, add portable 3MF export using the same final geometry, then grow higher-value manufacturing checks (clearance, walls, overhang/orientation, split planning) from measured user need.
