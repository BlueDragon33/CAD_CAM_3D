import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();
const BOUND = 2_147_483_647;

function close(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function faceHashes(shape) {
  return kernel.subShapeHashes(shape, 'face', BOUND);
}

function assertHistory(evolution, label) {
  const relationCount = evolution.modified.length + evolution.generated.length + evolution.deleted.length;
  if (relationCount === 0) throw new Error(`${label}: OCCT history returned no topology relations.`);
}

function topProfileBox(width, depth, distance, centerX, centerY, faceZ, overlap = 0.05) {
  let tool = kernel.makeBox(width, depth, distance + overlap);
  tool = kernel.translate(tool, -width / 2, -depth / 2, -overlap);
  return kernel.translate(tool, centerX, centerY, faceZ);
}

try {
  const baseVolume = 40 * 30 * 10;

  // Pad from the top planar face. The tool overlaps the parent by 0.05 mm so
  // the Boolean does not depend on perfectly coincident face contact.
  let padBase = kernel.makeBox(40, 30, 10);
  const padTool = topProfileBox(10, 8, 5, 20, 15, 10);
  const padEvolution = kernel.fuseWithHistory(padBase, padTool, faceHashes(padBase), BOUND);
  assertHistory(padEvolution, 'pad');
  const padded = padEvolution.result;
  if (!kernel.isValid(padded)) throw new Error('Pad result is invalid.');
  close(kernel.getVolume(padded), baseVolume + 10 * 8 * 5, 1e-4, 'pad volume');

  // Finite pocket removes material inward opposite the top-face outward normal.
  let pocketBase = kernel.makeBox(40, 30, 10);
  let finiteTool = kernel.makeBox(6, 6, 3.05);
  finiteTool = kernel.translate(finiteTool, 20 - 3, 15 - 3, 10 - 3);
  const pocketEvolution = kernel.cutWithHistory(pocketBase, finiteTool, faceHashes(pocketBase), BOUND);
  assertHistory(pocketEvolution, 'finite pocket');
  const pocketed = pocketEvolution.result;
  if (!kernel.isValid(pocketed)) throw new Error('Finite Pocket result is invalid.');
  close(kernel.getVolume(pocketed), baseVolume - 6 * 6 * 3, 1e-4, 'finite pocket volume');

  // Through-all pocket extends beyond the complete body and keeps a small
  // outward overlap at the selected face.
  let throughBase = kernel.makeBox(40, 30, 10);
  const throughLength = Math.hypot(40, 30, 10) * 2 + 4;
  let throughTool = kernel.makeBox(5, 5, throughLength + 0.05);
  throughTool = kernel.translate(throughTool, 20 - 2.5, 15 - 2.5, 10 - throughLength);
  const throughEvolution = kernel.cutWithHistory(throughBase, throughTool, faceHashes(throughBase), BOUND);
  assertHistory(throughEvolution, 'through-all pocket');
  const throughPocket = throughEvolution.result;
  if (!kernel.isValid(throughPocket)) throw new Error('Through-all Pocket result is invalid.');
  close(kernel.getVolume(throughPocket), baseVolume - 5 * 5 * 10, 1e-4, 'through-all pocket volume');

  // Side-face Pad proves the canonical +Z prism can be rotated onto another
  // planar face before fusion. +90° about Y maps canonical +Z to world +X.
  let sideBase = kernel.makeBox(40, 30, 10);
  let sideTool = kernel.makeBox(6, 6, 3.05);
  sideTool = kernel.translate(sideTool, -3, -3, -0.05);
  sideTool = kernel.rotate(
    sideTool,
    { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
    Math.PI / 2,
  );
  sideTool = kernel.translate(sideTool, 40, 15, 5);
  const sideEvolution = kernel.fuseWithHistory(sideBase, sideTool, faceHashes(sideBase), BOUND);
  assertHistory(sideEvolution, 'side pad');
  const sidePadded = sideEvolution.result;
  if (!kernel.isValid(sidePadded)) throw new Error('Side Pad result is invalid.');
  close(kernel.getVolume(sidePadded), baseVolume + 6 * 6 * 3, 1e-4, 'side pad volume');

  console.log(
    `Attached feature smoke PASS | pad ${kernel.getVolume(padded).toFixed(3)} mm^3 | pocket ${kernel.getVolume(pocketed).toFixed(3)} mm^3 | through ${kernel.getVolume(throughPocket).toFixed(3)} mm^3 | side-pad ${kernel.getVolume(sidePadded).toFixed(3)} mm^3`,
  );
} finally {
  kernel.releaseAll();
}
