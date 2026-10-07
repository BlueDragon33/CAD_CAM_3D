# CAD_CAM_3D Human UX Acceptance Runbook

Status: **CONTINUATION AUTHORIZED; SPLIT-3MF HUMAN GATE ACCEPTED 2026-10-07**
Scope: current foundation branch `foundation/general-system`
Purpose: verify premium usability and real-browser/slicer behavior that CI cannot prove.

On 2026-10-07 the Product Owner explicitly authorized automated implementation to continue beyond the earlier interaction checkpoint. That authorization is **not** recorded as evidence that every browser journey below was manually tested, and it does not authorize merge or Production. The exact split / multi-object 3MF handoff added after that authorization was explicitly accepted by the Product Owner on 2026-10-07. This acceptance authorizes continued foundation work only; merge and Production remain separate gates.

## 1. Run the production-like app

From a local checkout of `foundation/general-system`:

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
