import type * as THREE from 'three';

export type Vec3Tuple = [number, number, number];

export type ExactFaceTopology = {
  kind: 'face';
  runtimeId: string;
  hash: number;
  /** Semantic face ancestry resolved by the exact-kernel evolution tracker. */
  lineageIds: string[];
  /** Start offset in the indexed triangle buffer, measured in indices. */
  indexStart: number;
  /** Number of indices contributed by this face. Always a multiple of three. */
  indexCount: number;
  /** Triangle aliases retained for Three.js draw-range consumers. */
  triangleStart: number;
  triangleCount: number;
  centroid: Vec3Tuple;
  normal: Vec3Tuple;
  areaMm2: number;
};

export type ExactEdgeTopology = {
  kind: 'edge';
  runtimeId: string;
  hash: number;
  curveKind: string;
  lengthMm: number;
  midpoint: Vec3Tuple;
  points: Float32Array;
  adjacentFaceHashes: number[];
  /** Semantic ancestry of the faces that bound this edge. */
  adjacentFaceLineageIds: string[];
};

export type FaceSelection = {
  kind: 'face';
  runtimeId: string;
  hash: number;
  lineageIds: string[];
  signature: {
    centroid: Vec3Tuple;
    normal: Vec3Tuple;
    areaMm2: number;
  };
};

export type EdgeSelection = {
  kind: 'edge';
  runtimeId: string;
  hash: number;
  adjacentFaceLineageIds: string[];
  signature: {
    curveKind: string;
    lengthMm: number;
    midpoint: Vec3Tuple;
    start: Vec3Tuple;
    end: Vec3Tuple;
  };
};

export type TopologySelection = FaceSelection | EdgeSelection;
export type TopologySelectionMode = 'off' | 'face' | 'edge';

function distance(a: Vec3Tuple, b: Vec3Tuple) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function length(a: Vec3Tuple) {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalizedDot(a: Vec3Tuple, b: Vec3Tuple) {
  const al = length(a);
  const bl = length(b);
  if (al < 1e-9 || bl < 1e-9) return 1;
  return (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (al * bl);
}

function ratioPenalty(a: number, b: number) {
  return Math.abs(Math.log((Math.max(a, 1e-9)) / Math.max(b, 1e-9)));
}

function readVertex(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number): Vec3Tuple {
  return [position.getX(index), position.getY(index), position.getZ(index)];
}

/**
 * Convert OCCT mesh face groups into selection-ready records. occt-wasm emits
 * [indexStart, indexCount, faceHash] triples. A Three.js raycast faceIndex is a
 * triangle ordinal, so it is multiplied by three before group lookup.
 */
export function deriveFaceTopology(geometry: THREE.BufferGeometry, faceGroups: Int32Array | null) {
  if (!faceGroups || faceGroups.length === 0) return [] as ExactFaceTopology[];
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  if (!index || !position) return [] as ExactFaceTopology[];

  const faces: ExactFaceTopology[] = [];
  for (let groupIndex = 0; groupIndex + 2 < faceGroups.length; groupIndex += 3) {
    const indexStart = faceGroups[groupIndex];
    const indexCount = faceGroups[groupIndex + 1];
    const hash = faceGroups[groupIndex + 2];

    if (indexStart < 0 || indexCount <= 0 || indexCount % 3 !== 0 || indexStart + indexCount > index.count) {
      continue;
    }

    let weightedX = 0;
    let weightedY = 0;
    let weightedZ = 0;
    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;
    let areaMm2 = 0;

    for (let indexOffset = indexStart; indexOffset < indexStart + indexCount; indexOffset += 3) {
      const a = readVertex(position, index.getX(indexOffset));
      const b = readVertex(position, index.getX(indexOffset + 1));
      const c = readVertex(position, index.getX(indexOffset + 2));

      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const abz = b[2] - a[2];
      const acx = c[0] - a[0];
      const acy = c[1] - a[1];
      const acz = c[2] - a[2];
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const doubleArea = Math.hypot(nx, ny, nz);
      if (doubleArea <= 1e-12) continue;

      const area = doubleArea / 2;
      const centroidX = (a[0] + b[0] + c[0]) / 3;
      const centroidY = (a[1] + b[1] + c[1]) / 3;
      const centroidZ = (a[2] + b[2] + c[2]) / 3;
      weightedX += centroidX * area;
      weightedY += centroidY * area;
      weightedZ += centroidZ * area;
      normalX += nx;
      normalY += ny;
      normalZ += nz;
      areaMm2 += area;
    }

    const normalLength = Math.hypot(normalX, normalY, normalZ);
    const centroid: Vec3Tuple = areaMm2 > 0
      ? [weightedX / areaMm2, weightedY / areaMm2, weightedZ / areaMm2]
      : [0, 0, 0];
    const normal: Vec3Tuple = normalLength > 1e-12
      ? [normalX / normalLength, normalY / normalLength, normalZ / normalLength]
      : [0, 0, 0];

    faces.push({
      kind: 'face',
      runtimeId: `face:${hash}`,
      hash,
      lineageIds: [],
      indexStart,
      indexCount,
      triangleStart: indexStart / 3,
      triangleCount: indexCount / 3,
      centroid,
      normal,
      areaMm2,
    });
  }

  return faces;
}

export function resolveFaceFromTriangle(faces: ExactFaceTopology[], faceIndex: number) {
  const indexOffset = faceIndex * 3;
  return faces.find((face) => indexOffset >= face.indexStart && indexOffset < face.indexStart + face.indexCount) ?? null;
}

export function selectionFromFace(face: ExactFaceTopology): FaceSelection {
  return {
    kind: 'face',
    runtimeId: face.runtimeId,
    hash: face.hash,
    lineageIds: [...face.lineageIds],
    signature: {
      centroid: [...face.centroid],
      normal: [...face.normal],
      areaMm2: face.areaMm2,
    },
  };
}

export function selectionFromEdge(edge: ExactEdgeTopology): EdgeSelection {
  const pointCount = edge.points.length / 3;
  const start: Vec3Tuple = pointCount > 0 ? [edge.points[0], edge.points[1], edge.points[2]] : [0, 0, 0];
  const endOffset = Math.max(0, edge.points.length - 3);
  const end: Vec3Tuple = pointCount > 0
    ? [edge.points[endOffset], edge.points[endOffset + 1], edge.points[endOffset + 2]]
    : [0, 0, 0];
  return {
    kind: 'edge',
    runtimeId: edge.runtimeId,
    hash: edge.hash,
    adjacentFaceLineageIds: [...edge.adjacentFaceLineageIds],
    signature: {
      curveKind: edge.curveKind,
      lengthMm: edge.lengthMm,
      midpoint: [...edge.midpoint],
      start,
      end,
    },
  };
}

function lineageOverlap(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const right = new Set(b);
  let matches = 0;
  for (const id of a) if (right.has(id)) matches += 1;
  return matches / Math.max(a.length, b.length);
}

function remapFace(selection: FaceSelection, faces: ExactFaceTopology[], spanMm: number) {
  const sameHash = faces.find((face) => face.hash === selection.hash);
  if (sameHash) return selectionFromFace(sameHash);

  const sameLineage = faces.filter((face) => lineageOverlap(selection.lineageIds, face.lineageIds) > 0);
  const candidates = sameLineage.length > 0 ? sameLineage : faces;
  const span = Math.max(spanMm, 1);
  let best: { face: ExactFaceTopology; score: number } | null = null;
  for (const face of candidates) {
    const positionPenalty = distance(selection.signature.centroid, face.centroid) / span;
    const normalPenalty = 1 - Math.abs(normalizedDot(selection.signature.normal, face.normal));
    const areaPenalty = ratioPenalty(selection.signature.areaMm2, face.areaMm2);
    const lineageBonus = lineageOverlap(selection.lineageIds, face.lineageIds);
    const score = positionPenalty * 2.2 + normalPenalty * 0.8 + areaPenalty * 0.35 - lineageBonus * 0.8;
    if (!best || score < best.score) best = { face, score };
  }

  return best && best.score <= 1.35 ? selectionFromFace(best.face) : null;
}

function remapEdge(selection: EdgeSelection, edges: ExactEdgeTopology[], spanMm: number) {
  const sameHash = edges.find((edge) => edge.hash === selection.hash);
  if (sameHash) return selectionFromEdge(sameHash);

  const sameLineage = edges.filter((edge) => lineageOverlap(selection.adjacentFaceLineageIds, edge.adjacentFaceLineageIds) > 0);
  const candidates = sameLineage.length > 0 ? sameLineage : edges;
  const span = Math.max(spanMm, 1);
  let best: { edge: ExactEdgeTopology; score: number } | null = null;
  for (const edge of candidates) {
    const pointCount = edge.points.length / 3;
    if (pointCount === 0) continue;
    const endOffset = edge.points.length - 3;
    const start: Vec3Tuple = [edge.points[0], edge.points[1], edge.points[2]];
    const end: Vec3Tuple = [edge.points[endOffset], edge.points[endOffset + 1], edge.points[endOffset + 2]];
    const directEndpoints = distance(selection.signature.start, start) + distance(selection.signature.end, end);
    const reversedEndpoints = distance(selection.signature.start, end) + distance(selection.signature.end, start);
    const endpointPenalty = Math.min(directEndpoints, reversedEndpoints) / (2 * span);
    const midpointPenalty = distance(selection.signature.midpoint, edge.midpoint) / span;
    const lengthPenalty = ratioPenalty(selection.signature.lengthMm, edge.lengthMm);
    const kindPenalty = selection.signature.curveKind === edge.curveKind ? 0 : 0.75;
    const lineageBonus = lineageOverlap(selection.adjacentFaceLineageIds, edge.adjacentFaceLineageIds);
    const score = midpointPenalty * 1.6 + endpointPenalty + lengthPenalty * 0.4 + kindPenalty - lineageBonus * 0.9;
    if (!best || score < best.score) best = { edge, score };
  }

  return best && best.score <= 1.5 ? selectionFromEdge(best.edge) : null;
}

/**
 * Runtime hashes are preferred when they survive a rebuild. Semantic face
 * lineages are the second choice; geometry signatures are a conservative final
 * fallback. Ambiguous matches are dropped instead of targeting wrong topology.
 */
export function remapTopologySelection(
  selection: TopologySelection,
  faces: ExactFaceTopology[],
  edges: ExactEdgeTopology[],
  spanMm: number,
): TopologySelection | null {
  return selection.kind === 'face'
    ? remapFace(selection, faces, spanMm)
    : remapEdge(selection, edges, spanMm);
}
