import type { EdgeTopologyRef, Vec3Tuple } from './model';
import type { EdgeSelection, ExactEdgeTopology } from './topology-selection';

function distance(a: Vec3Tuple, b: Vec3Tuple) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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

/** Convert a transient viewport selection into a durable project reference. */
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

export type EdgeTopologyResolution = {
  edge: ExactEdgeTopology;
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

  // Reject weak or ambiguous matches. When semantic ancestry is present we
  // require at least one lineage overlap; otherwise geometry alone must score
  // very strongly. A close runner-up is treated as ambiguous rather than risky.
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
