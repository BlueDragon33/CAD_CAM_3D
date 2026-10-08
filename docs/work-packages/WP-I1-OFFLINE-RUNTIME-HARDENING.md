# WP-I1 — Offline Runtime Hardening

Status: **ACTIVE**
Parent: `WP-I-LOCAL-AUTOSAVE-RECOVERY`
Blueprint zones: Floors 11–20 + Operational Sovereignty
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

A local-first browser CAD product should remain usable after its production assets have been installed/cached. Offline behavior must not depend on Application Management, AI, account, database or a paid PWA provider.

## First vertical slice

- production-only service-worker registration;
- build-generated same-origin asset manifest;
- offline cache includes the app shell, JS/CSS and exact-kernel WASM;
- navigation uses network-first with cached app-shell fallback;
- hashed static assets use cache-first;
- same-origin runtime assets may be cached after successful fetch;
- development mode does not register the service worker;
- no third-party PWA plugin/dependency.

## Correctness / update policy

- network remains preferred for navigation so a connected user receives the newest shell;
- new production service-worker install refreshes manifest-listed assets;
- stale cache content is never canonical project data;
- project saves/recovery are separate from application asset caching;
- a service-worker failure must not block normal online application startup.

## Exit evidence

- production build emits `offline-assets.json` and `sw.js`;
- manifest contains the exact-kernel WASM and application chunks;
- build smoke verifies every manifest asset exists;
- TypeScript/unit/exact/build gates remain green;
- final offline user journey still requires browser/human acceptance before commercial release.
