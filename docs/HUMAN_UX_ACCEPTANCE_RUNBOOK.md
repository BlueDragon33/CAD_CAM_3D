# CAD_CAM_3D Human UX Acceptance Runbook

Status: **AUTONOMOUS v1 COMPLETION AUTHORIZED; FIT-CALIBRATION AUTOMATED RC EVIDENCE PASS**
Scope: released v1 `main` baseline (original implementation branch: `foundation/general-system`).
Purpose: verify premium usability and real-browser/slicer behavior that CI cannot prove.

On 2026-10-07 the Product Owner explicitly authorized automated implementation to continue beyond the earlier interaction checkpoint. That authorization is **not** recorded as evidence that every browser journey below was manually tested, and it does not authorize merge or Production. The exact split / multi-object 3MF handoff added after that authorization was explicitly accepted by the Product Owner on 2026-10-07. This acceptance authorizes continued foundation work only; merge and Production remain separate gates.

## 1. Run the production-like app

From a local checkout of the exact revision being accepted (normally a release/RC branch, or `main` for post-release spot-check):

```bash
npm install
npm run build
npm run preview -- --host 127.0.0.1
```

Open the localhost URL printed by Vite.

Use desktop Chrome/Edge first. Keep DevTools available for the offline check.

## 2. Command Preview → Commit safety

1. Observe the default part dimensions.
2. Enter `80x50x25`.
3. Click **Preview**.
4. Confirm the model has **not** changed yet.
5. Read the proposal summary/diagnostic.
6. Click **Commit**.
7. Confirm the model changes only now.
8. Repeat with `hole 4mm`, `cut 12x8`, `fillet 2mm` or `chamfer 1mm`.
9. For face/edge-bound commands, change the selection after Preview and before Commit; stale proposal must refuse to commit rather than silently target a different topology.

Acceptance questions:
- Is Preview → Commit understandable without explanation?
- Does it feel safer rather than slower/annoying?
- Are Cancel/Commit visually clear but not visually loud?
- Is the proposal area compact enough for a CAD workspace?

## 3. Manufacturing readiness

1. Click **Analyze Print** on a normal fitting part.
2. Confirm the report states which kernel/path was used and shows final dimensions.
3. Temporarily make a dimension too large for the selected printer.
4. Re-run analysis.
5. Confirm the system either recommends an axis-aligned orientation that fits or says no 90° orientation fits.
6. Create/inspect geometry with a clear elevated downward-facing surface if practical.
7. Confirm any overhang message is worded as a heuristic, not a guaranteed slicer result.

Acceptance questions:
- Are findings understandable and actionable?
- Is the difference between warning, printer-fit blocker and invalid-geometry export blocker understandable?
- Is the panel too verbose for routine use?

## 4. STL / STEP / 3MF manufacturing handoff

1. Export STL.
2. Export STEP.
3. Export 3MF.
4. Open STL and 3MF in Bambu Studio or OrcaSlicer.
5. Verify the part uses **millimeters** and the CAD height appears on slicer **Z**, not on the bed plane.
6. Compare overall dimensions to CAD.
7. Confirm Core 3MF opens as a normal single object.

Important boundary: this test does not claim Bambu project-file feature parity. Current 3MF is portable 3MF Core geometry.

### 4A. Exact split → multi-object Core 3MF — ACCEPTED 2026-10-07

This is the targeted human gate for the new build-volume split path.

1. Use a printer profile with a 256 × 256 × 256 mm build volume.
2. Set the part envelope to approximately `300 × 40 × 12 mm` so no 90° orientation can fit the 300 mm axis.
3. Click **Analyze Print**.
4. Confirm a **2-piece** split plan is shown and the normal top toolbar is not expanded with another permanent export button.
5. In the split-plan card, click **Export Split 3MF**.
6. Confirm the app reports an exact OpenCascade split, multiple generated objects and volume conservation.
7. Open the generated `*-split.3mf` in Bambu Studio or OrcaSlicer.
8. Confirm the file opens as **two separately selectable objects**, not one fused mesh.
9. Confirm units remain millimeters and each object has the expected split envelope (for the simple rectangular case, about 150 × 40 × 12 mm before slicer reorientation/arrangement).
10. Confirm CAD height remains slicer Z after the existing manufacturing transform.
11. Use the slicer's normal Arrange function if the two objects initially retain their CAD-relative placement.
12. Confirm no UI or message claims alignment pins, dovetails, strength-aware seams, Bambu project metadata or slicer-equivalent validation.

Fail closed expectations:
- if exact clipping yields an invalid or disconnected cell, automatic split 3MF export must be blocked;
- an empty planned envelope cell must not be presented as a printable object;
- editing the CAD project after analysis must invalidate the old manufacturing/split report and require Analyze Print again.

Recorded result: **ACCEPT SPLIT 3MF** — Product Owner, 2026-10-07.

This targeted decision authorizes further work built on split-export UX. It does not authorize PR merge or Production.

### 4B. Verified registration pins → Aligned Split 3MF — ACCEPTED 2026-10-08

This gate covers the new optional registration-only alignment path. It does **not** reopen or replace the already accepted flat Split 3MF path.

Use the same simple rectangular acceptance case first:

1. Printer build volume: 256 × 256 × 256 mm.
2. Part: approximately `300 × 40 × 12 mm`.
3. Nozzle: `0.4 mm`.
4. Click **Analyze Print**.
5. Confirm the split card still offers **Export Split 3MF**.
6. Confirm it also offers **Export Aligned Split 3MF** and explicitly says registration-only / no structural-strength claim.
7. The current heuristic should show approximately:
   - 2 registration pins;
   - 2.00 mm pin diameter;
   - 0.20 mm per-side clearance;
   - 2.40 mm pocket diameter;
   - 4.00 mm engagement.
8. Click **Export Aligned Split 3MF**.
9. The app must first verify full-material corridors. If verification fails, export must block rather than create floating/partial pins.
10. Open the generated `*-split-aligned.3mf` in Bambu Studio or OrcaSlicer.
11. Confirm there are still **two separately selectable objects**.
12. Inspect the mating seam:
    - one piece has two cylindrical male registration pins;
    - the matching piece has two corresponding female pockets;
    - pins/pockets are visibly aligned;
    - geometry does not appear detached, self-intersecting, or broken.
13. Use section/layer preview if needed to inspect the pockets.
14. Confirm scale remains millimeters and CAD height remains slicer Z.
15. Confirm the UI/file does not claim the pins are load-bearing, structural, waterproof, press-fit-certified, or a replacement for fasteners.

Expected fail-closed behavior:

- multi-axis grid split: no automatic registration-pin export;
- seam envelope too small: no automatic registration-pin export;
- a proposed pin crossing a hole/cut/void: corridor verification must block aligned export;
- any invalid/disconnected post-Boolean piece: aligned export must block.

Recorded result: **ACCEPT ALIGNED SPLIT 3MF** — Product Owner, 2026-10-08.

This gate authorizes further work built on automatic registration geometry. It still does not authorize PR merge or Production.

### 4C. Persisted registration clearance calibration — AUTOMATED RC EVIDENCE PASS

This gate covers project-persisted registration clearance and its effect on Aligned Split 3MF.

1. Keep the same simple `300 × 40 × 12 mm` single-axis split case with a 0.4 mm nozzle.
2. In **Print readiness**, locate **Registration clearance / side**.
3. With the field blank, confirm the UI states the uncalibrated default is **0.20 mm/side**.
4. Run **Analyze Print** and note that Aligned Split uses about:
   - 2.00 mm pin diameter;
   - 0.20 mm/side clearance;
   - 2.40 mm pocket diameter.
5. Enter **0.30 mm** in Registration clearance / side.
6. Confirm the prior manufacturing/split report disappears or otherwise requires **Analyze Print** again; stale evidence must not remain usable.
7. Run **Analyze Print** again.
8. Confirm the alignment text now reflects:
   - 2.00 mm pin diameter;
   - **0.30 mm/side clearance**;
   - **2.60 mm pocket diameter**.
9. Click **Save** and download the project.
10. Reset or reopen the app, then **Open** that saved project.
11. Confirm the calibration field still contains **0.30 mm**.
12. Export **Aligned Split 3MF** and open it in Bambu Studio or OrcaSlicer.
13. Confirm there are still two separate objects and the female pockets are visibly larger than in the 0.20 mm default case.
14. Clear the calibration field.
15. Confirm it returns to the documented default rather than storing an invented zero value.

Required wording boundary:
- calibrated value = recorded project manufacturing intent;
- not a certified fit;
- not a structural/watertight/press-fit guarantee.

Product Owner delegated future routine spot-checks to reproducible automation on 2026-10-08. The Chrome CI critical journey now downloads a real schema-v13 project file, verifies persisted 0.30 mm/side calibration, mutates the live project, opens the downloaded file again, confirms restored dimensions/calibration, confirms Open resets prior history, then exercises new Undo/Redo, Recovery, Offline, exact STEP and Aligned Split 3MF. This is **automated evidence**, not a claim that a human manually observed the fit-calibration flow.

Merge and Production remain conditional on the exact-revision RC/release gates.

## 5. Recovery

1. Make a visible project edit.
2. Wait at least 2 seconds.
3. Close the tab without explicitly downloading a project file.
4. Reopen the production preview.
5. Confirm **Recover** appears for the prior local snapshot.
6. Click Recover.
7. Confirm the restored project is the expected edited state and remains editable.

Acceptance questions:
- Is recovery discoverable without becoming annoying?
- Does it feel safe that restore is explicit rather than automatic?

## 6. Offline/local-first behavior

1. While online, load the production preview and wait several seconds for the service worker to finish installing.
2. Reload once while still online.
3. In DevTools Network, switch to **Offline**.
4. Reload the page.
5. Confirm the CAD workspace opens.
6. Perform a normal local edit/save workflow.
7. Trigger at least one exact-kernel path if practical (for example STEP/exact feature) to prove the cached WASM is available offline.
8. Return DevTools to Online.

A failed service-worker cache must never destroy project data; it is resilience infrastructure, not project storage.

## 7. Visual/interaction review

Check at desktop width and one narrower/tablet-like width:

- geometry remains visually primary;
- top controls are not becoming a button wall;
- feature tree and inspector remain understandable;
- proposal/manufacturing/export/recovery additions do not create card-inside-card clutter;
- no critical state relies only on color;
- keyboard focus is visible for primary controls;
- text remains readable during a long engineering session.

Phone remains review/inspection-first; full authoring is not being accepted here.

## 8. Decision

Record one of:

- **ACCEPT** — current interaction foundation is good enough to continue building on.
- **ACCEPT WITH FINDINGS** — continue, but list concrete UX corrections.
- **REJECT** — stop expansion of the affected surface and repair it first.

Please include screenshots only for anything that looks wrong or confusing. There is no need to document screens that pass.

Human acceptance here does not imply:
- PR merge;
- commercial launch;
- Production authorization;
- constitutional PASS for future functionality.
