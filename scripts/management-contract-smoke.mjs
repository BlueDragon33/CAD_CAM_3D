import fs from 'node:fs';

const root = JSON.parse(fs.readFileSync(new URL('../control/application-management.contract.json', import.meta.url), 'utf8'));
const published = JSON.parse(fs.readFileSync(new URL('../public/control/application-management.contract.json', import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const [label, value] of [['root', root], ['public', published]]) {
  assert(value.schema === 'application-management.contract/v1', label + ': wrong schema');
  assert(value.protocol === 'application-management.contract/v1', label + ': wrong protocol');
  assert(value.application?.id === 'cad-cam-3d', label + ': wrong application.id');
  assert(value.application?.category === 'Kỹ thuật', label + ': wrong category');
  assert(value.application?.repository === 'BlueDragon33/CAD_CAM_3D', label + ': wrong repository');
  assert(value.application?.version === '1.0.0', label + ': wrong application version');
  assert(value.capabilities?.webLaunch === true, label + ': Production webLaunch must be true');
  assert(value.policy?.localFirst === true, label + ': localFirst must be true');
  assert(value.policy?.productionRuntimeReady === true, label + ': productionRuntimeReady must be true');
  assert(value.policy?.remoteAdminReady === false, label + ': remote admin must remain fail-closed');
  assert(value.policy?.credentialRequired === false, label + ': observe-only contract must not require credential');

  for (const key of [
    'deviceRegistry','deviceApproval','deviceBlock','deviceUnblock','deviceEditPermission',
    'deviceIdempotentCommands','optimisticConcurrency','deviceAutoApproval','deviceAutoBlockPending',
    'automationIdempotentCommands','automationOptimisticConcurrency','sessions','audit',
    'contentReview','payments','reports'
  ]) assert(value.capabilities?.[key] === false, label + ': capability ' + key + ' must remain false');

  assert(Object.keys(value.endpoints ?? {}).length === 0, label + ': no remote-admin endpoint may be advertised');
  assert(value.boundary?.projectGeometryInControlPlane === false, label + ': CAD project boundary violated');
  assert(value.boundary?.meshFilesInControlPlane === false, label + ': mesh boundary violated');
  assert(value.boundary?.manufacturingExportsInControlPlane === false, label + ': export boundary violated');
}

assert(JSON.stringify(root) === JSON.stringify(published), 'Repository and published management contracts diverged.');
console.log('Application Management contract smoke PASS | Universal v1 | local-first runtime | remote admin fail-closed');
