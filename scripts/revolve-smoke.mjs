import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();

function close(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function rectangleFace(x0, x1, y0, y1, z) {
  const points = [
    { x: x0, y: y0, z },
    { x: x1, y: y0, z },
    { x: x1, y: y1, z },
    { x: x0, y: y1, z },
  ];
  const edges = points.map((point, index) => kernel.makeLineEdge(point, points[(index + 1) % points.length]));
  return kernel.makeFace(kernel.makeWire(edges));
}

try {
  let base = kernel.makeBox(40, 30, 10);
  base = kernel.translate(base, -20, -15, 0);
  const baseVolume = kernel.getVolume(base);

  const profile = rectangleFace(-4, 4, 2, 6, 10);
  const revolved = kernel.revolve(
    profile,
    { point: { x: 0, y: 0, z: 10 }, direction: { x: 1, y: 0, z: 0 } },
    Math.PI * 2,
  );
  if (!kernel.isValid(revolved)) throw new Error('Revolved tool is invalid.');

  const before = kernel.subShapeHashes(base, 'face', 2_147_483_647);
  const evolution = kernel.fuseWithHistory(base, revolved, before, 2_147_483_647);
  const result = evolution.result;
  if (!kernel.isValid(result)) throw new Error('Revolve fusion is invalid.');

  const box = kernel.getBoundingBox(result, false);
  const volume = kernel.getVolume(result);
  if (!(volume > baseVolume)) throw new Error(`Revolve did not add material: base ${baseVolume}, result ${volume}`);
  close(box.xmin, -20, 1e-6, 'xmin');
  close(box.xmax, 20, 1e-6, 'xmax');
  close(box.zmin, 0, 1e-6, 'zmin');
  if (!(box.zmax > 15.9)) throw new Error(`Expected revolved material above base; zmax=${box.zmax}`);
  if (evolution.modified.length + evolution.generated.length === 0) {
    throw new Error('Revolve fusion did not return topology history.');
  }

  console.log(`Revolve smoke PASS | volume ${volume.toFixed(3)} mm^3 | zmax ${box.zmax.toFixed(3)} mm`);
} finally {
  kernel.releaseAll();
}
