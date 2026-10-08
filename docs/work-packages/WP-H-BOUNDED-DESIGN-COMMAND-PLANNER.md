# WP-H — Bounded Design Command Planner

Status: **ACTIVE**
Blueprint zone: Floors 61–70 — AI Engineering
Constitution: `blueprint-os:universal-century-grade@1.2.0`

## Problem

The current command bridge interprets a small deterministic grammar and mutates the project immediately. The commercial architecture requires a bounded operation-plan step so future AI providers can propose the same validated operations without becoming a second geometry truth.

## First vertical slice

- local deterministic planner wraps the existing command grammar;
- proposal contains typed operations, summary, diagnostics and target intent;
- proposal is previewed before canonical project mutation;
- unsupported input remains non-mutating;
- project preconditions are checked before proposal status becomes ready;
- commit still uses normal feature creation/topology binding paths;
- no external AI dependency;
- no provider text becomes canonical project state.

## Authority boundary

```text
instruction
  ↓
planner
  ↓
typed proposal
  ↓
validation
  ↓
preview
  ↓
explicit commit
  ↓
normal CadProject mutation
```

Future AI/model providers may replace or augment intent parsing, but they must emit this bounded operation vocabulary (or a compatible successor) and pass the same validation gates.

## Exit evidence

- deterministic planner unit tests;
- no mutation on preview;
- blocked/unsupported commands cannot commit;
- current dimension/Hole/Cut/Fillet/Chamfer commands remain supported;
- UI exposes Preview / Commit / Cancel;
- TypeScript/unit/exact/build PASS.

## Out of scope

- autonomous multi-step AI design;
- remote model provider;
- tool-calling account integration;
- hidden mesh generation;
- automatic security/billing/Production actions.
