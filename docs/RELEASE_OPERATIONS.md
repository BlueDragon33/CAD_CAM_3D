# Release Operations — CAD_CAM_3D v1

## Authority

Product Owner autonomous-completion authority was granted on 2026-10-08. It permits final merge and Production only after exact-revision release evidence passes. It does not permit bypassing failed gates.

## Production path

Production is GitHub Pages for the current web distribution.

A feature/development branch **cannot deploy Pages**. It may only build and retain a short-lived preview artifact.

Production deployment sequence:

1. final RC branch CI passes;
2. PR is marked ready and merged to `main`;
3. `CAD CAM 3D CI` runs on the resulting exact main commit;
4. only a successful main CI emits the `workflow_run` event accepted by `CAD CAM 3D Production Pages`;
5. Production workflow checks out `workflow_run.head_sha` explicitly;
6. workflow verifies `git rev-parse HEAD == RELEASE_SHA`;
7. production build is made from that exact revision;
8. `dist/release.json` records version, exact SHA, source CI run and channel;
9. that exact build is deployed to Pages.

A green branch CI is never enough to deploy Production.

## Release evidence

For each Production release record:

- version;
- exact main SHA;
- source CI run ID/conclusion;
- Production Pages run ID/conclusion;
- release.json SHA value;
- known limitations;
- rollback target (previous known-good main release SHA).

## Rollback

Routine rollback uses normal Git history, not force-push.

1. identify the previous known-good Production SHA from release evidence;
2. create/review a revert of the bad release changes on `main`;
3. CI must pass for the resulting new main revision;
4. Production workflow deploys that new exact main revision automatically;
5. verify `release.json` and workflow evidence.

If the bad revision is still safe enough to keep the site available, prefer a normal revert over rewriting history.

Force-moving `main` is reserved for extraordinary repository-recovery authority, not normal product rollback.

## Failure behavior

- branch CI fails → repair branch, no merge;
- main CI fails → Production workflow condition is false, no deploy;
- Production build fails → current deployed site remains unchanged;
- Pages deploy fails → current deployed site remains unchanged; inspect deployment logs and retry only after root cause is understood;
- release evidence mismatch → treat release as failed even if the site visually loads.

## Preview isolation

The development workflow intentionally uploads an Actions artifact only. This prevents later branch work from overwriting the Production Pages site.

## Data safety

Production deployment contains application assets only. CAD project files remain local/user-owned; deployment/rollback must not migrate, delete or seize local CAD data.
