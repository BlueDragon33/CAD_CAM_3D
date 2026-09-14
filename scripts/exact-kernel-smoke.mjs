import { OcctKernel } from 'occt-wasm';

const HASH_UPPER_BOUND = 2_147_483_647;
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

  if (!mesh.faceGroups || mesh.faceGroups.length === 0 || mesh.faceGroups.length % 3 !== 0) {
    throw new Error('OCCT tessellation did not expose [indexStart, indexCount, faceHash] groups.');
  }

  let groupedIndices = 0;
  for (let i = 0; i < mesh.faceGroups.length; i += 3) {
    const indexStart = mesh.faceGroups[i];
    const indexCount = mesh.faceGroups[i + 1];
    if (indexStart < 0 || indexCount <= 0 || indexCount % 3 !== 0 || indexStart + indexCount > mesh.indices.length) {
      throw new Error(`Invalid OCCT face group at triple ${i / 3}.`);
    }
    groupedIndices += indexCount;
  }
  if (groupedIndices !== mesh.indices.length) {
    throw new Error(`Face groups cover ${groupedIndices} indices but mesh contains ${mesh.indices.length}.`);
  }

  const step = kernel.exportStep(cut);
  if (!step.includes('ISO-10303-21')) {
    throw new Error('OCCT STEP export did not return a STEP exchange document.');
  }

  const faceHashes = kernel.subShapeHashes(cut, 'face', HASH_UPPER_BOUND);
  const edgeHashes = kernel.subShapeHashes(cut, 'edge', HASH_UPPER_BOUND);
  const faceHashSet = new Set(faceHashes);
  for (let i = 2; i < mesh.faceGroups.length; i += 3) {
    if (!faceHashSet.has(mesh.faceGroups[i])) {
      throw new Error(`Tessellation face hash ${mesh.faceGroups[i]} is missing from exact B-Rep topology.`);
    }
  }

  const edgeHandles = kernel.getSubShapes(cut, 'edge');
  let sampledEdge = false;
  for (const edge of edgeHandles) {
    try {
      const hash = kernel.hashCode(edge, HASH_UPPER_BOUND);
      const length = kernel.curveLength(edge);
      const { first, last } = kernel.curveParameters(edge);
      const midpoint = kernel.curvePointAtParam(edge, first + (last - first) / 2);
      if (hash > 0 && length > 0 && Number.isFinite(midpoint.x) && Number.isFinite(midpoint.y) && Number.isFinite(midpoint.z)) {
        sampledEdge = true;
        break;
      }
    } finally {
      kernel.release(edge);
    }
  }
  if (!sampledEdge) {
    throw new Error('OCCT edge topology could not be sampled for viewport picking.');
  }

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
    `OCCT smoke PASS | ${mesh.triangleCount} triangles | ${faceHashes.length} faces | ${edgeHashes.length} edges | ${mesh.faceGroups.length / 3} pick groups | volume ${volume.toFixed(3)} mm^3`,
  );
} finally {
  kernel.releaseAll();
}
