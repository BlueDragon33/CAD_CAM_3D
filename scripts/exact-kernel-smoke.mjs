import { OcctKernel } from 'occt-wasm';

const HASH_UPPER_BOUND = 2_147_483_647;
const kernel = await OcctKernel.init();

function decodeRelations(flat, label) {
  const relations = [];
  let cursor = 0;
  while (cursor < flat.length) {
    if (cursor + 1 >= flat.length) throw new Error(`${label} stream ended before count.`);
    const sourceHash = flat[cursor++];
    const count = flat[cursor++];
    if (!Number.isInteger(count) || count < 0 || cursor + count > flat.length) throw new Error(`${label} contains invalid count ${String(count)}.`);
    relations.push({ sourceHash, results: flat.slice(cursor, cursor + count) });
    cursor += count;
  }
  return relations;
}

function decodeEdgeMap(flat) {
  const entries = [];
  let cursor = 0;
  while (cursor < flat.length) {
    if (cursor + 1 >= flat.length) throw new Error('edgeToFaceMap stream ended before face count.');
    const edgeHash = flat[cursor++];
    const count = flat[cursor++];
    if (!Number.isInteger(count) || count < 0 || cursor + count > flat.length) throw new Error(`edgeToFaceMap contains invalid count ${String(count)}.`);
    entries.push({ edgeHash, faces: flat.slice(cursor, cursor + count) });
    cursor += count;
  }
  return entries;
}

try {
  let base = kernel.makeBox(60, 40, 12);
  base = kernel.translate(base, -30, -20, 0);

  let holeTool = kernel.makeCylinder(2, 14);
  holeTool = kernel.translate(holeTool, 0, 0, -1);
  const beforeFaceHashes = kernel.subShapeHashes(base, 'face', HASH_UPPER_BOUND);
  const evolution = kernel.cutWithHistory(base, holeTool, beforeFaceHashes, HASH_UPPER_BOUND);
  const cut = evolution.result;
  if (!kernel.isValid(cut)) throw new Error('OCCT smoke geometry is not a valid B-Rep.');

  const modified = decodeRelations(evolution.modified, 'cut.modified');
  const generated = decodeRelations(evolution.generated, 'cut.generated');
  const beforeSet = new Set(beforeFaceHashes);
  for (const relation of [...modified, ...generated]) if (!beforeSet.has(relation.sourceHash)) throw new Error(`Evolution source hash ${relation.sourceHash} is not an input face.`);
  for (const hash of evolution.deleted) if (!beforeSet.has(hash)) throw new Error(`Deleted face hash ${hash} is not an input face.`);

  const afterFaceHashes = kernel.subShapeHashes(cut, 'face', HASH_UPPER_BOUND);
  if (afterFaceHashes.length <= beforeFaceHashes.length) throw new Error('Hole cut did not create the expected additional face topology.');

  const mesh = kernel.meshShape(cut, { linearDeflection: 0.1, angularDeflection: 0.5 });
  if (mesh.triangleCount <= 0) throw new Error('OCCT tessellation returned no triangles.');
  if (!mesh.faceGroups || mesh.faceGroups.length === 0 || mesh.faceGroups.length % 3 !== 0) throw new Error('OCCT tessellation did not expose face groups.');

  let groupedIndices = 0;
  for (let i = 0; i < mesh.faceGroups.length; i += 3) {
    const indexStart = mesh.faceGroups[i];
    const indexCount = mesh.faceGroups[i + 1];
    if (indexStart < 0 || indexCount <= 0 || indexCount % 3 !== 0 || indexStart + indexCount > mesh.indices.length) throw new Error(`Invalid OCCT face group at triple ${i / 3}.`);
    groupedIndices += indexCount;
  }
  if (groupedIndices !== mesh.indices.length) throw new Error(`Face groups cover ${groupedIndices} indices but mesh contains ${mesh.indices.length}.`);

  const faceHashSet = new Set(afterFaceHashes);
  for (let i = 2; i < mesh.faceGroups.length; i += 3) if (!faceHashSet.has(mesh.faceGroups[i])) throw new Error(`Tessellation face hash ${mesh.faceGroups[i]} is missing from exact B-Rep topology.`);

  const edgeHashes = kernel.subShapeHashes(cut, 'edge', HASH_UPPER_BOUND);
  const edgeHashSet = new Set(edgeHashes);
  const adjacency = decodeEdgeMap(kernel.edgeToFaceMap(cut, HASH_UPPER_BOUND));
  if (adjacency.length === 0) throw new Error('OCCT edgeToFaceMap returned no adjacency data.');
  for (const entry of adjacency) {
    if (!edgeHashSet.has(entry.edgeHash)) throw new Error(`Adjacency references unknown edge ${entry.edgeHash}.`);
    if (entry.faces.length === 0) throw new Error(`Edge ${entry.edgeHash} has no adjacent face.`);
    for (const faceHash of entry.faces) if (!faceHashSet.has(faceHash)) throw new Error(`Edge ${entry.edgeHash} references unknown face ${faceHash}.`);
  }

  const edgeHandles = kernel.getSubShapes(cut, 'edge');
  let sampledEdge = false;
  for (const edge of edgeHandles) {
    try {
      const hash = kernel.hashCode(edge, HASH_UPPER_BOUND);
      const length = kernel.curveLength(edge);
      const { first, last } = kernel.curveParameters(edge);
      const midpoint = kernel.curvePointAtParam(edge, first + (last - first) / 2);
      if (hash > 0 && length > 0 && Number.isFinite(midpoint.x) && Number.isFinite(midpoint.y) && Number.isFinite(midpoint.z)) { sampledEdge = true; break; }
    } finally { kernel.release(edge); }
  }
  if (!sampledEdge) throw new Error('OCCT edge topology could not be sampled for viewport picking.');

  const filletBox = kernel.makeBox(20, 16, 8);
  const filletEdges = kernel.getSubShapes(filletBox, 'edge');
  const filletInputFaces = kernel.subShapeHashes(filletBox, 'face', HASH_UPPER_BOUND);
  const filletEvolution = kernel.filletWithHistory(filletBox, filletEdges.slice(0, 1), 1, filletInputFaces, HASH_UPPER_BOUND);
  decodeRelations(filletEvolution.modified, 'fillet.modified');
  decodeRelations(filletEvolution.generated, 'fillet.generated');
  if (!kernel.isValid(filletEvolution.result)) throw new Error('Fillet evolution returned an invalid B-Rep.');
  for (const edge of filletEdges) kernel.release(edge);

  const chamferBox = kernel.makeBox(20, 16, 8);
  const chamferEdges = kernel.getSubShapes(chamferBox, 'edge');
  const chamferInputFaces = kernel.subShapeHashes(chamferBox, 'face', HASH_UPPER_BOUND);
  const chamferEvolution = kernel.chamferWithHistory(chamferBox, chamferEdges.slice(0, 1), 1, chamferInputFaces, HASH_UPPER_BOUND);
  const chamferModified = decodeRelations(chamferEvolution.modified, 'chamfer.modified');
  const chamferGenerated = decodeRelations(chamferEvolution.generated, 'chamfer.generated');
  if (!kernel.isValid(chamferEvolution.result)) throw new Error('Chamfer evolution returned an invalid B-Rep.');
  if (chamferModified.length + chamferGenerated.length === 0) throw new Error('Chamfer history returned no topology evolution.');
  for (const edge of chamferEdges) kernel.release(edge);

  const step = kernel.exportStep(cut);
  if (!step.includes('ISO-10303-21')) throw new Error('OCCT STEP export did not return a STEP exchange document.');

  const bbox = kernel.getBoundingBox(cut, false);
  const volume = kernel.getVolume(cut);
  if (afterFaceHashes.length === 0 || edgeHashes.length === 0 || volume <= 0) throw new Error('OCCT topology/query smoke checks failed.');
  const width = bbox.xmax - bbox.xmin;
  const depth = bbox.ymax - bbox.ymin;
  const height = bbox.zmax - bbox.zmin;
  const close = (actual, expected) => Math.abs(actual - expected) <= 1e-6;
  if (!close(width, 60) || !close(depth, 40) || !close(height, 12)) throw new Error(`Unexpected exact bounds: ${width} x ${depth} x ${height} mm.`);

  console.log(`OCCT smoke PASS | ${mesh.triangleCount} triangles | ${afterFaceHashes.length} faces | ${edgeHashes.length} edges | Chamfer history ${chamferModified.length + chamferGenerated.length} relation(s) | volume ${volume.toFixed(3)} mm^3`);
} finally {
  kernel.releaseAll();
}
