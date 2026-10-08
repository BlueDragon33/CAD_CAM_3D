import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();
const close = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;

try {
  let base = kernel.makeBox(60, 40, 12);
  base = kernel.translate(base, -30, -20, 0);
  const baseVolume = kernel.getVolume(base);
  const toolLength = Math.hypot(60, 40, 12) * 2 + 4;

  // Canonical cylinders are +Z. Center the tool around the origin, rotate +Z
  // onto +X, then place the tool on the +X side face at app point (30, 6, 0).
  let sideHole = kernel.makeCylinder(2, toolLength);
  sideHole = kernel.translate(sideHole, 0, 0, -toolLength / 2);
  sideHole = kernel.rotate(
    sideHole,
    { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
    Math.PI / 2,
  );
  sideHole = kernel.translate(sideHole, 30, 0, 6);
  const holeResult = kernel.cut(base, sideHole);
  if (!kernel.isValid(holeResult)) throw new Error('Side-face hole produced an invalid B-Rep.');
  const holeVolume = kernel.getVolume(holeResult);
  if (!(holeVolume > 0 && holeVolume < baseVolume)) throw new Error('Side-face hole did not remove material.');

  // The same transform pattern must also work for a rectangular through tool.
  let sideCut = kernel.makeBox(10, 6, toolLength);
  sideCut = kernel.translate(sideCut, -5, -3, -toolLength / 2);
  sideCut = kernel.rotate(
    sideCut,
    { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
    Math.PI / 2,
  );
  sideCut = kernel.translate(sideCut, 30, 0, 6);
  const cutResult = kernel.cut(base, sideCut);
  if (!kernel.isValid(cutResult)) throw new Error('Side-face rectangular cut produced an invalid B-Rep.');
  const cutVolume = kernel.getVolume(cutResult);
  if (!(cutVolume > 0 && cutVolume < baseVolume)) throw new Error('Side-face rectangular cut did not remove material.');

  for (const result of [holeResult, cutResult]) {
    const bbox = kernel.getBoundingBox(result, false);
    const width = bbox.xmax - bbox.xmin;
    const depth = bbox.ymax - bbox.ymin;
    const height = bbox.zmax - bbox.zmin;
    if (!close(width, 60) || !close(depth, 40) || !close(height, 12)) {
      throw new Error(`Oriented Boolean changed outer bounds: ${width} x ${depth} x ${height} mm.`);
    }
    const mesh = kernel.meshShape(result, { linearDeflection: 0.1, angularDeflection: 0.5 });
    if (mesh.triangleCount <= 0) throw new Error('Oriented Boolean tessellation returned no triangles.');
  }

  console.log(
    `OCCT oriented-face smoke PASS | side-hole volume ${holeVolume.toFixed(3)} mm^3 | side-cut volume ${cutVolume.toFixed(3)} mm^3`,
  );
} finally {
  kernel.releaseAll();
}
