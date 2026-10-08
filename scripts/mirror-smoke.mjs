import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();
const BOUND = 2_147_483_647;

function close(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) throw new Error(label + ': expected ' + expected + ', got ' + actual);
}
function hashes(shape) { return kernel.subShapeHashes(shape, 'face', BOUND); }
function cutTracked(shape, tool, label) {
  const evolution = kernel.cutWithHistory(shape, tool, hashes(shape), BOUND);
  if (!kernel.isValid(evolution.result)) throw new Error(label + ': invalid result');
  if (evolution.modified.length + evolution.generated.length + evolution.deleted.length === 0) throw new Error(label + ': empty topology history');
  return evolution.result;
}

try {
  const width = 50, depth = 30, height = 10, radius = 2;
  const baseVolume = width * depth * height;
  let global = kernel.makeBox(width, depth, height);
  for (const x of [15, 35]) {
    let tool = kernel.makeCylinder(radius, height + 2);
    tool = kernel.translate(tool, x, depth / 2, -1);
    global = cutTracked(global, tool, 'global mirror');
  }
  close(kernel.getVolume(global), baseVolume - 2 * Math.PI * radius * radius * height, 1e-3, 'global Mirror volume');

  let side = kernel.makeBox(width, depth, height);
  for (const y of [9, 21]) {
    let tool = kernel.makeCylinder(radius, width + 2);
    tool = kernel.rotate(tool, { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } }, Math.PI / 2);
    tool = kernel.translate(tool, -1, y, height / 2);
    side = cutTracked(side, tool, 'face-local mirror');
  }
  close(kernel.getVolume(side), baseVolume - 2 * Math.PI * radius * radius * width, 1e-3, 'face-local Mirror volume');
  console.log('Mirror smoke PASS | global ' + kernel.getVolume(global).toFixed(3) + ' mm^3 | face-local ' + kernel.getVolume(side).toFixed(3) + ' mm^3');
} finally {
  kernel.releaseAll();
}
