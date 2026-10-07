# WP-D0 — Shell Foundation Hardening

Status: **ACTIVE**
Blueprint zone: Floors 41–50 — Parametric Modeling
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

Schema v8 introduced durable Shell intent before the rest of the application had an exact executable Shell path. The first schema commit exposed compile-time exhaustiveness gaps. An enabled unsupported Shell must never be interpreted as Chamfer or allow preview/export to silently show the pre-Shell solid.

## User job

Create a hollow functional enclosure or body by selecting one or more faces to open and specifying wall thickness, with the operation surviving upstream parametric rebuilds.

## Commercial value

Shell is a high-frequency printable-part operation for electronics enclosures, UAV/UGV housings, covers and serviceable robotics bodies.

## Scope

1. Restore a green baseline after schema-v8 contract introduction.
2. Preserve Shell intent safely while exact execution is unavailable.
3. Implement exact OpenCascade Shell using durable `FaceTopologyRef[]` openings.
4. Track topology evolution through Shell.
5. Add UI creation/edit/rebind/remove-opening flow.
6. Add exact smoke + schema regression.
7. Route preview/STL/STEP through exact kernel.
8. Update capability truth/docs only after evidence passes.

## Out of scope

- variable wall thickness;
- curved-face sketch attachment;
- multi-body shelling;
- automatic draft;
- thickness optimization;
- lightweight mesh Shell parity.

## Canonical owner

`CadProject.features[] -> ShellFeature`.

Runtime face handles/hashes remain transient.

## Safety invariant

If an enabled Shell cannot be executed safely, rebuild/export must block. The application must never display/export the pre-Shell solid while presenting Shell as successful.

## Dependency budget

Uses the already-pinned `occt-wasm@5.0.0` exact-kernel provider. No new external provider is introduced.

## Exit evidence

- TypeScript PASS;
- unit regression PASS including schema v8;
- exact Shell smoke PASS;
- topology lineage/history remains resolvable after Shell;
- production build PASS;
- PR/docs state exact limitations truthfully.
