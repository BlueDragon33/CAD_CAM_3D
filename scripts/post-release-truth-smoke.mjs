import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const io = read('src/cad/project-io.ts');
const architecture = read('docs/ARCHITECTURE.md');
const roadmap = read('docs/ROADMAP.md');
const control = read('docs/CONTROL_PLANE.md');
const adoption = JSON.parse(read('.blueprint/constitution-adoption.json'));
const publicContract = JSON.parse(read('public/control/application-management.contract.json'));

const schemaMatch = io.match(/const PROJECT_SCHEMA_VERSION = (\d+);/);
assert.ok(schemaMatch, 'Project schema version must be discoverable from canonical parser.');
const version = Number(schemaMatch[1]);
assert.ok(Number.isSafeInteger(version) && version >= 13, 'Expected a supported v13+ parser.');

assert.ok(architecture.includes('Current editable project schema is **v' + version + '**'),
  'Architecture documentation must match the canonical parser schema version.');
assert.ok(roadmap.includes('Current project schema: v' + version),
  'Roadmap schema declaration must match the canonical parser.');
assert.ok(architecture.includes('v1–v' + (version - 1) + ' migrations'),
  'Architecture must document the current migration range.');
if (version === 13) {
  assert.ok(architecture.includes('registrationClearancePerSideMm'),
    'v13 architecture must document persisted registration-fit calibration.');
}

assert.equal(adoption.policyVersion, '1.2.0', 'Constitution version must match the adopted v1 governance.');
assert.equal(adoption.blueprintLevel, 'B4', 'Do not regress to obsolete B2 governance.');

assert.equal(publicContract.schema, 'application-management.contract/v1');
assert.equal(publicContract.application.id, 'cad-cam-3d');
assert.equal(publicContract.policy.localFirst, true);
assert.equal(publicContract.policy.remoteAdminReady, false);
assert.equal(publicContract.capabilities.webLaunch, true);
assert.equal(publicContract.capabilities.deviceRegistry, false);
assert.ok(control.includes('contractConnected=true'), 'Live-probe evidence must be recorded.');
assert.ok(control.includes('remoteAdminReady=false'), 'Remote Admin limitations must be recorded.');
assert.ok(control.includes('CAD continues to own project and manufacturing data.'),
  'Control-plane docs must preserve CAD data ownership.');

console.log('Post-release documentation/contract consistency PASS | schema v' + version + ' | Constitution B4 | CAD local-first');
