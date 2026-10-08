# WP-G — Component Knowledge Catalog Foundation

Status: **ACTIVE**
Blueprint zone: Floors 81–90 — Ecosystem / Component Providers
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

Robotics/electronics users repeatedly design around real components. A commercial CAD product needs reusable mechanical knowledge, but the catalog must not become an unverified mesh warehouse or a mandatory dependency on one online vendor.

## First vertical slice

- semantic component-definition contract;
- stable component ID + revision;
- mechanical envelope;
- mounting-hole pattern;
- keep-out and connector-clearance volumes;
- optional mass and compatible fasteners;
- provenance/source metadata;
- provider interface;
- local in-memory provider;
- strict user-import validator;
- no fabricated real-world component dimensions.

## Provider law

Catalog providers are adapters. The canonical CAD project may persist a stable component reference and the design features derived from it, but a provider runtime ID/API URL is never canonical identity.

Provider implementations may later include:
- bundled verified catalog;
- user-local catalog;
- organization catalog;
- optional online catalog.

The core must remain useful when all optional online catalogs are unavailable.

## Provenance law

Real manufacturer dimensions must be added only with traceable source/provenance and revision. Test fixtures are explicitly synthetic and must never be presented as real product data.

## Exit evidence

- schema/validator tests;
- provider search/get tests;
- invalid/duplicate mounting IDs rejected;
- no network dependency;
- TypeScript/unit/exact/build PASS.

## Next contract

Add verified component packs from authoritative sources, then component placement/reference features only after a stable project-reference and update policy is designed.
