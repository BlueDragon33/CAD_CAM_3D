# WP-E5 — Persisted Registration Fit Calibration

Status: **ACTIVE**
Parent: `WP-E4A-VERIFIED-REGISTRATION-PINS`
Blueprint zone: Floors 51–60 — Manufacturing Intelligence

## Problem

Registration clearance materially changes the exported male/female split geometry. A hard-coded runtime default is not enough for reproducible project manufacturing intent because real printer/material combinations may need different measured clearance.

## User job

Let the user record a measured per-side registration clearance in the print profile so reopening the project reproduces the same aligned split geometry.

## Scope

- add `printProfile.fitCalibration.registrationClearancePerSideMm`;
- schema v13;
- schema v1–v12 migrate safely to `null` calibration;
- `null` means use the documented uncalibrated nozzle-relative default;
- calibrated values are bounded to 0.05–2.00 mm per side;
- fit policy consumes the persisted override;
- aligned split planner/export automatically uses the calibrated value;
- changing calibration invalidates stale manufacturing analysis;
- compact Print readiness input only; no new top-level toolbar surface.

## Truth boundaries

A stored clearance value records user manufacturing intent. It is **not** certification that:

- the printer is dimensionally calibrated;
- a given material will produce the requested clearance;
- the result is press-fit, watertight, structural or fatigue-safe;
- slicer/process compensation is unnecessary.

The product must keep saying registration/alignment, not structural joint.

## Data / migration

Schema v13 adds:

```ts
printProfile.fitCalibration.registrationClearancePerSideMm: number | null
```

Migration:

- v1–v12 => `null`;
- v13 requires the fitCalibration object;
- malformed/out-of-range v13 values fail closed;
- save/open round-trip must preserve an explicit calibrated value.

## Dependency / security

- local core only;
- no external provider;
- no credentials;
- no new dependency;
- CAD project remains canonical owner of the print-profile calibration intent.

## Test plan

- schema v12 migration regression;
- schema v13 calibrated round-trip;
- out-of-range rejection;
- fit-policy default and calibrated paths;
- aligned split regression remains green;
- TypeScript/unit/exact/build/preview gates.

## Human verification

Required after automated gates because this changes a user-visible manufacturing control and saved-project behavior.

Acceptance should verify:

- blank field means documented default;
- explicit value persists across Save/Open;
- aligned split pocket diameter changes predictably;
- changing the field invalidates stale Analyze Print evidence;
- UI wording does not claim certified fit.

## Exit criteria

- automated gates PASS;
- browser save/open + aligned 3MF human check accepted;
- schema v13 truth reflected in PR;
- merge/Production remain separate authority.
