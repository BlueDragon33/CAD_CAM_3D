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

function findTopFace(shape, targetZ) {
  const faces = kernel.getSubShapes(shape, 'face');
  for (const face of faces) {
    const box = kernel.getBoundingBox(face, false);
    const planarZ = Math.abs(box.zmax - box.zmin) <= 1e-7;
    if (planarZ && Math.abs(box.zmax - targetZ) <= 1e-7) return face;
    kernel.release(face);
  }
  throw new Error('Top opening face was not found.');
}

try {
  const width = 40;
  const depth = 30;
  const height = 10;
  const thickness = 2;
  const base = kernel.makeBox(width, depth, height);
  const top = findTopFace(base, height);
  const before = faceHashes(base);
  const topHash = kernel.hashCode(top, BOUND);

  const evolution = kernel.shellWithHistory(base, [top], thickness, 1e-6, before, BOUND);
  const shelled = evolution.result;

  if (!kernel.isValid(shelled)) throw new Error('Shell result is invalid.');
  if (evolution.modified.length + evolution.generated.length + evolution.deleted.length === 0) {
    throw new Error('Shell topology history is empty.');
  }
  if (!evolution.deleted.includes(topHash)) {
    throw new Error('Shell history did not record the selected opening face as deleted.');
  }

  const expectedVolume = width * depth * height
    - (width - thickness * 2) * (depth - thickness * 2) * (height - thickness);
  close(kernel.getVolume(shelled), expectedVolume, 1e-3, 'shell volume');

  const box = kernel.getBoundingBox(shelled, false);
  close(box.xmax - box.xmin, width, 1e-6, 'shell width');
  close(box.ymax - box.ymin, depth, 1e-6, 'shell depth');
  close(box.zmax - box.zmin, height, 1e-6, 'shell height');

  const resultFaces = kernel.getSubShapes(shelled, 'face');
  if (resultFaces.length < 9) throw new Error(`Shell result unexpectedly has only ${resultFaces.length} faces.`);
  for (const face of resultFaces) kernel.release(face);

  console.log(
    `Exact Shell smoke PASS | volume ${kernel.getVolume(shelled).toFixed(3)} mm^3 | faces ${faceHashes(shelled).length} | history ${evolution.modified.length + evolution.generated.length + evolution.deleted.length} relation entries`,
  );
} finally {
  kernel.releaseAll();
}
