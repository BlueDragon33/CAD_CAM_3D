import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();

try {
  let base = kernel.makeBox(60, 40, 12);
  base = kernel.translate(base, -30, -20, 0);

  let holeTool = kernel.makeCylinder(2, 14);
  holeTool = kernel.translate(holeTool, 0, 0, -1);
  const cut = kernel.cut(base, holeTool);

  if (!kernel.isValid(cut)) {
    throw new Error('OCCT smoke geometry is not a valid B-Rep.');
  }

  const mesh = kernel.meshShape(cut, {
    linearDeflection: 0.1,
    angularDeflection: 0.5,
  });

  if (mesh.triangleCount <= 0) {
    throw new Error('OCCT tessellation returned no triangles.');
  }

  const step = kernel.exportStep(cut);
  if (!step.includes('ISO-10303-21')) {
    throw new Error('OCCT STEP export did not return a STEP exchange document.');
  }

  const faceHashes = kernel.subShapeHashes(cut, 'face', 2_000_000_000);
  const edgeHashes = kernel.subShapeHashes(cut, 'edge', 2_000_000_000);
  const bbox = kernel.getBoundingBox(cut, false);
  const volume = kernel.getVolume(cut);

  if (faceHashes.length === 0 || edgeHashes.length === 0 || volume <= 0) {
    throw new Error('OCCT topology/query smoke checks failed.');
  }

  const width = bbox.xmax - bbox.xmin;
  const depth = bbox.ymax - bbox.ymin;
  const height = bbox.zmax - bbox.zmin;
  const close = (actual, expected) => Math.abs(actual - expected) <= 1e-6;

  if (!close(width, 60) || !close(depth, 40) || !close(height, 12)) {
    throw new Error(`Unexpected exact bounds: ${width} x ${depth} x ${height} mm.`);
  }

  console.log(
    `OCCT smoke PASS | ${mesh.triangleCount} triangles | ${faceHashes.length} faces | ${edgeHashes.length} edges | volume ${volume.toFixed(3)} mm^3`,
  );
} finally {
  kernel.releaseAll();
}
