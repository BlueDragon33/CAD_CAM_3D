# WP-E1 — Geometry-Based Overhang Heuristic

Status: **ACTIVE**
Parent: `WP-E-MANUFACTURING-INTELLIGENCE-FOUNDATION`
Blueprint zone: Floors 51–60 — Manufacturing Intelligence

## User value

Surface a practical early warning when the current manufacturing orientation contains significant downward-facing geometry likely to need support.

## Foundation scope

- analyze the same final triangle geometry used by adaptive manufacturing/export paths;
- workspace Y-up is the analysis build axis before export transform;
- ignore triangles lying on the current minimum-Y build plane;
- classify strongly downward-facing triangles against a conservative configurable threshold;
- report unsupported downward area as a heuristic;
- never claim slicer-equivalent support prediction.

## Non-goals

- bridge detection;
- support-tree generation;
- material-specific support settings;
- slicer support-paint parity;
- automatic arbitrary orientation optimization.

## Exit evidence

- synthetic geometry tests distinguish build-plate bottom from elevated downward overhang;
- readiness report includes actionable warning without blocking geometry export;
- CI remains green.
