import type { EdgeTopologyRef, FaceTopologyRef, Vec3Tuple } from './model';
import type {
  EdgeSelection,
  ExactEdgeTopology,
  ExactFaceTopology,
  FaceSelection,
} from './topology-selection';

function distance(a: Vec3Tuple, b: Vec3Tuple) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function dot(a: Vec3Tuple, b: Vec3Tuple) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value: Vec3Tuple): Vec3Tuple {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-12) return [0, 1, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function subtract(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: Vec3Tuple, factor: number): Vec3Tuple {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function ratioPenalty(a: number, b: number) {
  return Math.abs(Math.log(Math.max(a, 1e-9) / Math.max(b, 1e-9)));
}

function lineageOverlap(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const right = new Set(b);
  let matches = 0;
  for (const id of a) if (right.has(id)) matches += 1;
  return matches / Math.max(a.length, b.length);
}

function endpoints(edge: ExactEdgeTopology) {
  if (edge.points.length < 3) {
    const origin: Vec3Tuple = [0, 0, 0];
    return { start: origin, end: origin };
  }
  const endOffset = edge.points.length - 3;
  return {
    start: [edge.points[0], edge.points[1], edge.points[2]] as Vec3Tuple,
    end: [edge.points[endOffset], edge.points[endOffset + 1], edge.points[endOffset + 2]] as Vec3Tuple,
  };
}

export type FaceLocalFrame = {
  origin: Vec3Tuple;
  uAxis: Vec3Tuple;
  vAxis: Vec3Tuple;
  normal: Vec3Tuple;
};

/**
 * Build a deterministic in-plane frame from a face signature. The frame origin
 * is the world origin projected onto the face plane. U is derived from world X
 * whenever possible and falls back to world Z when the face normal is parallel
 * to X. This gives top, bottom and side faces a stable local frame.
 */
export function createFaceLocalFrame(face: Pick<ExactFaceTopology, 'centroid' | 'normal'> | FaceTopologyRef['signature']): FaceLocalFrame {
  const normal = normalize([...face.normal]);
  const planeDistance = dot(normal, [...face.centroid]);
  const origin = scale(normal, planeDistance);

  const worldX: Vec3Tuple = [1, 0, 0];
  const projectedX = subtract(worldX, scale(normal, dot(worldX, normal)));
  let uAxis = normalize(projectedX);
  if (Math.hypot(projectedX[0], projectedX[1], projectedX[2]) <= 1e-8) {
    const worldZ: Vec3Tuple = [0, 0, 1];
    const projectedZ = subtract(worldZ, scale(normal, dot(worldZ, normal)));
    uAxis = normalize(projectedZ);
  }
  const vAxis = normalize(cross(normal, uAxis));
  return { origin, uAxis, vAxis, normal };
}

export function localCoordinatesOnFace(frame: FaceLocalFrame, point: Vec3Tuple) {
  const offset = subtract(point, frame.origin);
  return { uMm: dot(offset, frame.uAxis), vMm: dot(offset, frame.vAxis) };
}

export function pointFromFaceLocal(frame: FaceLocalFrame, uMm: number, vMm: number): Vec3Tuple {
  return add(frame.origin, add(scale(frame.uAxis, uMm), scale(frame.vAxis, vMm)));
}

/** Convert a transient viewport selection into a durable project edge reference. */
export function createEdgeTopologyRef(selection: EdgeSelection, capturedAfterFeatureId: string | null): EdgeTopologyRef {
  return {
    kind: 'edge',
    adjacentFaceLineageIds: [...new Set(selection.adjacentFaceLineageIds)].sort(),
    capturedAfterFeatureId,
    signature: {
      curveKind: selection.signature.curveKind,
      lengthMm: selection.signature.lengthMm,
      midpoint: [...selection.signature.midpoint],
      start: [...selection.signature.start],
      end: [...selection.signature.end],
    },
  };
}

/** Convert a transient viewport selection into a durable project face reference. */
export function createFaceTopologyRef(selection: FaceSelection, capturedAfterFeatureId: string | null): FaceTopologyRef {
  return {
    kind: 'face',
    lineageIds: [...new Set(selection.lineageIds)].sort(),
    capturedAfterFeatureId,
    signature: {
      centroid: [...selection.signature.centroid],
      normal: [...selection.signature.normal],
      areaMm2: selection.signature.areaMm2,
    },
  };
}

const basePlanarRoles = [
  ':top',
  ':bottom',
  ':side:+x',
  ':side:-x',
  ':side:+depth',
  ':side:-depth',
];

/**
 * Current oriented-through workflow is intentionally restricted to faces that
 * descend from one of the six planar base-extrusion faces. This includes side
 * faces and split planar descendants while rejecting cylindrical Hole walls and
 * curved Fillet faces until exact surface-type persistence is added.
 */
export function isSupportedPlanarFace(ref: FaceTopologyRef) {
  return ref.lineageIds.some((id) => basePlanarRoles.some((role) => id.includes(role)));
}

/** Retained for UI compatibility and horizontal fast-path decisions. */
export function isSupportedHorizontalFace(ref: FaceTopologyRef) {
  return isSupportedPlanarFace(ref) && Math.abs(ref.signature.normal[1]) >= 0.985;
}

export type EdgeTopologyResolution = {
  edge: ExactEdgeTopology;
  score: number;
  lineageOverlap: number;
  confidence: 'high' | 'medium';
};

export type FaceTopologyResolution = {
  face: ExactFaceTopology;
  frame: FaceLocalFrame;
  score: number;
  lineageOverlap: number;
  confidence: 'high' | 'medium';
};

/**
 * Resolve a persisted edge reference against exact topology from the current
 * rebuild. Semantic adjacent-face ancestry is preferred; geometric signature is
 * used to disambiguate and to tolerate ordinary parameter edits.
 */
export function resolveEdgeTopologyRef(
  ref: EdgeTopologyRef,
  edges: ExactEdgeTopology[],
  spanMm: number,
): EdgeTopologyResolution | null {
  if (edges.length === 0) return null;
  const span = Math.max(spanMm, 1);
  const lineageCandidates = edges.filter((edge) => lineageOverlap(ref.adjacentFaceLineageIds, edge.adjacentFaceLineageIds) > 0);
  const candidates = lineageCandidates.length > 0 ? lineageCandidates : edges;

  let best: { edge: ExactEdgeTopology; score: number; overlap: number } | null = null;
  let secondBest = Number.POSITIVE_INFINITY;

  for (const edge of candidates) {
    const { start, end } = endpoints(edge);
    const directEndpoints = distance(ref.signature.start, start) + distance(ref.signature.end, end);
    const reversedEndpoints = distance(ref.signature.start, end) + distance(ref.signature.end, start);
    const endpointPenalty = Math.min(directEndpoints, reversedEndpoints) / (2 * span);
    const midpointPenalty = distance(ref.signature.midpoint, edge.midpoint) / span;
    const lengthPenalty = ratioPenalty(ref.signature.lengthMm, edge.lengthMm);
    const kindPenalty = ref.signature.curveKind === edge.curveKind ? 0 : 0.9;
    const overlap = lineageOverlap(ref.adjacentFaceLineageIds, edge.adjacentFaceLineageIds);
    const lineagePenalty = ref.adjacentFaceLineageIds.length > 0 ? 1 - overlap : 0.35;
    const score = midpointPenalty * 1.5
      + endpointPenalty * 0.9
      + lengthPenalty * 0.35
      + kindPenalty
      + lineagePenalty * 0.8;

    if (!best || score < best.score) {
      if (best) secondBest = best.score;
      best = { edge, score, overlap };
    } else if (score < secondBest) {
      secondBest = score;
    }
  }

  if (!best) return null;
  if (ref.adjacentFaceLineageIds.length > 0 && best.overlap <= 0) return null;
  const maximumScore = ref.adjacentFaceLineageIds.length > 0 ? 1.15 : 0.72;
  if (best.score > maximumScore) return null;
  if (Number.isFinite(secondBest) && secondBest - best.score < 0.08) return null;

  return {
    edge: best.edge,
    score: best.score,
    lineageOverlap: best.overlap,
    confidence: best.overlap >= 0.99 && best.score <= 0.45 ? 'high' : 'medium',
  };
}

/** Resolve a persisted face reference against the current exact topology. */
export function resolveFaceTopologyRef(
  ref: FaceTopologyRef,
  faces: ExactFaceTopology[],
  spanMm: number,
): FaceTopologyResolution | null {
  if (faces.length === 0) return null;
  const span = Math.max(spanMm, 1);
  const lineageCandidates = faces.filter((face) => lineageOverlap(ref.lineageIds, face.lineageIds) > 0);
  const candidates = lineageCandidates.length > 0 ? lineageCandidates : faces;

  let best: { face: ExactFaceTopology; score: number; overlap: number } | null = null;
  let secondBest = Number.POSITIVE_INFINITY;
  const referenceNormal = normalize([...ref.signature.normal]);

  for (const face of candidates) {
    const overlap = lineageOverlap(ref.lineageIds, face.lineageIds);
    const centroidPenalty = distance(ref.signature.centroid, face.centroid) / span;
    const candidateNormal = normalize([...face.normal]);
    const normalPenalty = 1 - Math.abs(dot(referenceNormal, candidateNormal));
    const areaPenalty = ratioPenalty(ref.signature.areaMm2, face.areaMm2);
    const lineagePenalty = ref.lineageIds.length > 0 ? 1 - overlap : 0.4;
    const score = centroidPenalty * 1.4 + normalPenalty * 1.1 + areaPenalty * 0.3 + lineagePenalty * 0.9;

    if (!best || score < best.score) {
      if (best) secondBest = best.score;
      best = { face, score, overlap };
    } else if (score < secondBest) {
      secondBest = score;
    }
  }

  if (!best) return null;
  if (ref.lineageIds.length > 0 && best.overlap <= 0) return null;
  const maximumScore = ref.lineageIds.length > 0 ? 1.1 : 0.68;
  if (best.score > maximumScore) return null;
  if (Number.isFinite(secondBest) && secondBest - best.score < 0.07) return null;

  // Tessellation orientation can occasionally flip after Boolean rebuilds. Align
  // the resolved normal with the persisted reference before rebuilding the local
  // U/V frame so a saved coordinate does not mirror to the opposite side.
  const candidateNormal = normalize([...best.face.normal]);
  const alignedNormal = dot(referenceNormal, candidateNormal) < 0
    ? scale(candidateNormal, -1)
    : candidateNormal;
  const alignedFace: ExactFaceTopology = {
    ...best.face,
    normal: alignedNormal,
  };

  return {
    face: alignedFace,
    frame: createFaceLocalFrame(alignedFace),
    score: best.score,
    lineageOverlap: best.overlap,
    confidence: best.overlap >= 0.99 && best.score <= 0.42 ? 'high' : 'medium',
  };
}
