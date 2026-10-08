import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();

function close(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function cylinderAlongX(radius, length, startX, y, z) {
  let tool = kernel.makeCylinder(radius, length);
  tool = kernel.rotate(
    tool,
    { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
    Math.PI / 2,
  );
  return kernel.translate(tool, startX, y, z);
}

try {
  const width = 300;
  const depth = 40;
  const height = 12;
  const seamX = 0;
  const engagementMm = 5;
  const overlapMm = 0.2;
  const pinRadiusMm = 2.5;
  const clearanceMm = 0.2;
  const pocketRadiusMm = pinRadiusMm + clearanceMm;
  const centerY = -10;
  const centerZ = height / 2;

  let base = kernel.makeBox(width, depth, height);
  base = kernel.translate(base, -width / 2, -depth / 2, 0);

  const corridorLength = engagementMm * 2 + overlapMm * 2;
  const corridor = cylinderAlongX(
    pocketRadiusMm,
    corridorLength,
    seamX - engagementMm - overlapMm,
    centerY,
    centerZ,
  );
  const corridorInside = kernel.common(base, corridor);
  const expectedCorridorVolume = Math.PI * pocketRadiusMm * pocketRadiusMm * corridorLength;
  close(
    kernel.getVolume(corridorInside),
    expectedCorridorVolume,
    1e-3,
    'validated solid corridor volume',
  );

  const bbox = kernel.getBoundingBox(base, false);
  const leftClip = kernel.makeBoxFromCorners(
    { x: bbox.xmin, y: bbox.ymin, z: bbox.zmin },
    { x: seamX, y: bbox.ymax, z: bbox.zmax },
  );
  const rightClip = kernel.makeBoxFromCorners(
    { x: seamX, y: bbox.ymin, z: bbox.zmin },
    { x: bbox.xmax, y: bbox.ymax, z: bbox.zmax },
  );
  const left = kernel.common(base, leftClip);
  const right = kernel.common(base, rightClip);
  const leftVolume = kernel.getVolume(left);
  const rightVolume = kernel.getVolume(right);

  const pin = cylinderAlongX(
    pinRadiusMm,
    engagementMm + overlapMm,
    seamX - overlapMm,
    centerY,
    centerZ,
  );
  const male = kernel.fuse(left, pin);
  if (!kernel.isValid(male)) throw new Error('Alignment male piece is invalid.');
  const expectedMaleVolume = leftVolume + Math.PI * pinRadiusMm * pinRadiusMm * engagementMm;
  close(kernel.getVolume(male), expectedMaleVolume, 1e-3, 'male alignment-piece volume');

  const pocket = cylinderAlongX(
    pocketRadiusMm,
    engagementMm + overlapMm,
    seamX - overlapMm,
    centerY,
    centerZ,
  );
  const female = kernel.cut(right, pocket);
  if (!kernel.isValid(female)) throw new Error('Alignment female piece is invalid.');
  const expectedFemaleVolume = rightVolume - Math.PI * pocketRadiusMm * pocketRadiusMm * engagementMm;
  close(kernel.getVolume(female), expectedFemaleVolume, 1e-3, 'female alignment-piece volume');

  console.log(
    `Alignment corridor smoke PASS | pin Ø${(pinRadiusMm * 2).toFixed(2)} mm | clearance ${clearanceMm.toFixed(2)} mm | engagement ${engagementMm.toFixed(2)} mm`,
  );
} finally {
  kernel.releaseAll();
}
