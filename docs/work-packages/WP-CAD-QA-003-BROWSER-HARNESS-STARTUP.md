# WP CAD-QA-003 — Browser Harness Startup Diagnostics

Status: **ACTIVE — release CI recovery**
Authority: Constitution 1.2.0 / B4 CAD blueprint / Master Execution Prompt

## Incident

CAD-QA-002 was merged to `main` as `838168677760ffe708ea227c204e39a1f1205454`. The first main CI `37809570376` passed TypeScript, 106 unit tests, exact B-Rep smoke and build, but Chrome failed **before the first application assertion**, with a generic WebDriver `TimeoutError` at the 15s default HTTP timeout.

Re-running the identical job/merge SHA (attempt 2) passed the full CI including Chrome. GitHub's Production Pages `workflow_run` for the first failed attempt was correctly marked **skipped**; Production for this SHA must NOT be claimed as deployed.

## Corrective action

- Keep all assertions, 210s whole-browser gate, and performance budgets unchanged.
- Add contextual method/URL/timeout diagnostic for WebDriver HTTP failures.
- Allow the cold new-Chrome session handshake 30s (only bootstrap); this is not a sleep and does not relax CAD correctness assertions.
- Preserve SHA-locked main CI → conditional Pages Production deployment.

## Rollout

1. branch CI + Constitution PASS;
2. merge only exact tested revision;
3. fresh main CI PASS with new main SHA;
4. Production Pages must deploy the same fresh main SHA;
5. verify release evidence, then close this incident.

Any repeat failure must be investigated from the newly contextualized error. Do not disable browser tests or manually force a failed release.
