# CAD_CAM_3D Agent Instructions

Before changing architecture, domain contracts, persistence, geometry, UI, security, commercial capabilities or release behavior, read these sources in order:

1. `.blueprint/constitution-adoption.json`
2. Engineering Suite canonical blueprint + interoperability contract from `BlueDragon33/Software-Blueprint-Hub` when cross-product ownership/interchange is affected
3. `docs/CAD_CAM_3D_CENTURY_GRADE_COMMERCIAL_BLUEPRINT.md`
4. `docs/ENGINEERING_SUITE_MEMBERSHIP.md` when suite boundaries are affected
5. relevant domain documents under `docs/`
6. `prompts/CAD_CAM_3D_MASTER_CENTURY_GRADE_EXECUTION_PROMPT.md`

The active Universal Constitution is owned by `BlueDragon33/Software-Blueprint-Hub`; this repository declares adoption rather than copying constitutional law into a competing source-of-truth.

Instruction precedence:

```text
Universal Constitution
  > Engineering Suite blueprint (for suite-wide boundaries)
  > CAD commercial blueprint
  > canonical domain/contracts + Work Packages/Gates
  > execution prompt
  > chat convenience
```

Mandatory rules:

- inspect before modifying;
- preserve `CadProject` as canonical editable engineering intent;
- never persist raw OCCT/Three.js runtime identity as project identity;
- never create a second hidden geometry truth for AI or UI;
- keep local-first core usable without optional management/cloud/AI providers where practical;
- keep CAD project/B-Rep/mesh/export ownership inside CAD_CAM_3D, not Application Management, ECAD or CAE;
- use versioned neutral Engineering Suite artifacts for CAD↔ECAD↔CAE exchange; never direct source-code coupling;
- preserve explicit right-handed Z-up/mm semantics at suite spatial boundaries even if internal workspace coordinates differ;
- classify significant external dependencies and preserve replacement/offline/export paths;
- do not fake capabilities, admin controls, test evidence or PASS states;
- do not weaken tests merely to make a gate green;
- update the canonical blueprint first when fundamental architecture meaning changes, then regenerate/reconcile the execution prompt;
- continue routine implementation/fix/test work without repeated confirmation;
- stop for required human Product/UX acceptance, destructive/irreversible authority, constitutional conflict, or Production release authorization;
- never infer merge or Production authority from CI success.

“100-floor ready” means structural capacity for future growth, not speculative abstraction or a requirement to create 100 literal layers today.
