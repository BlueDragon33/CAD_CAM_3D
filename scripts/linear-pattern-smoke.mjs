import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();
const BOUND = 2_147_483_647;

function close(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function hashes(shape) {
  return kernel.subShapeHashes(shape, 'face', BOUND);
}

function cutWithTrackedHistory(shape, tool, label) {
  const evolution = kernel.cutWithHistory(shape, tool, hashes(shape), BOUND);
  if (evolution.modified.length + evolution.generated.length + evolution.deleted.length === 0) {
    throw new Error(`${label}: topology history is empty.`);
  }
  if (!kernel.isValid(evolution.result)) throw new Error(`${label}: result is invalid.`);
  return evolution.result;
}

try {
  const width = 50;
  const depth = 30;
  const height = 10;
  const radius = 2;
  const count = 4;
  const spacing = 8;
  const baseVolume = width * depth * height;

  let global = kernel.makeBox(width, depth, height);
  for (let i = 0; i < count; i += 1) {
    let tool = kernel.makeCylinder(radius, height + 2);
    tool = kernel.translate(tool, 10 + spacing * i, depth / 2, -1);
    global = cutWithTrackedHistory(global, tool, `global pattern instance ${i + 1}`);
  }
  const expectedGlobal = baseVolume - count * Math.PI * radius * radius * height;
  close(kernel.getVolume(global), expectedGlobal, 1e-3, 'global linear hole pattern volume');

  // Face-local analogue: canonical cylinders are rotated to pass through the
  // +X wall and repeated along that wall's local in-plane Y direction.
  const sideCount = 3;
  const sideSpacing = 7;
  let side = kernel.makeBox(width, depth, height);
  for (let i = 0; i < sideCount; i += 1) {
    let tool = kernel.makeCylinder(radius, width + 2);
    tool = kernel.rotate(
      tool,
      { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
      Math.PI / 2,
    );
    tool = kernel.translate(tool, -1, 8 + sideSpacing * i, height / 2);
    side = cutWithTrackedHistory(side, tool, `face-local pattern instance ${i + 1}`);
  }
  const expectedSide = baseVolume - sideCount * Math.PI * radius * radius * width;
  close(kernel.getVolume(side), expectedSide, 1e-3, 'face-local linear hole pattern volume');

  console.log(
    `Linear Pattern smoke PASS | global ${count}× volume ${kernel.getVolume(global).toFixed(3)} mm^3 | face-local ${sideCount}× volume ${kernel.getVolume(side).toFixed(3)} mm^3`,
  );
} finally {
  kernel.releaseAll();
}
