# WP-I — Local Autosave and Recovery Foundation

Status: **ACTIVE**
Blueprint zone: Floors 11–20 — Persistence / Migration / Recovery
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

A sellable engineering tool must protect user work against accidental tab close, browser crash, invalid edits and interrupted sessions. Explicit Save remains important, but it is not sufficient recovery engineering.

## First vertical slice

- local-only recovery snapshots stored in browser storage;
- snapshots contain the normal versioned CAD project document, never a parallel project format;
- debounce autosave after project changes;
- bounded snapshot retention;
- startup discovery of prior recovery snapshots;
- explicit user-controlled restore rather than silent overwrite;
- restoration goes through the normal project parser/migration validator;
- no cloud/account/Application Management dependency.

## Safety

- storage failure is non-fatal and must not block CAD Core;
- corrupt recovery entries are skipped;
- restore never bypasses schema validation;
- recovery is not a substitute for explicit file Save/export;
- no private geometry leaves the local browser boundary.

## Exit evidence

- unit coverage for bounded retention and validated restore;
- UI exposes prior-session recovery when present;
- TypeScript/unit/exact/build gates PASS.

## Next contract

Future desktop/PWA packaging may use a stronger filesystem-backed recovery provider behind the same recovery intent. Optional cloud backup remains a separate adapter.
