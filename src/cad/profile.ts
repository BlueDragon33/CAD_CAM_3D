import type { SketchCircleEntity, SketchEntity, SketchLineEntity, SketchPoint2D } from './sketch';
import { distance2d } from './sketch';

export type ProfileWinding = 'clockwise' | 'counter-clockwise' | 'not-applicable';

export type SketchProfileCandidate =
  | {
      kind: 'polyline';
      entityIds: string[];
      points: SketchPoint2D[];
      areaMm2: number;
      perimeterMm: number;
      winding: Exclude<ProfileWinding, 'not-applicable'>;
      selfIntersectionCount: number;
      valid: boolean;
      issues: string[];
    }
  | {
      kind: 'circle';
      entityIds: [string];
      center: SketchPoint2D;
      radiusMm: number;
      areaMm2: number;
      perimeterMm: number;
      winding: 'not-applicable';
      selfIntersectionCount: 0;
      valid: boolean;
      issues: string[];
    };

export type SketchProfileAnalysis = {
  candidates: SketchProfileCandidate[];
  closedLoopCount: number;
  openComponentCount: number;
  unsupportedArcCount: number;
  selfIntersectionCount: number;
  promotable: boolean;
  primaryCandidate: SketchProfileCandidate | null;
  issues: string[];
};

type Node = { point: SketchPoint2D; edgeIndexes: number[] };
type GraphEdge = { entity: SketchLineEntity; a: number; b: number };

function pointKey(point: SketchPoint2D) {
  return `${point.x.toFixed(6)},${point.z.toFixed(6)}`;
}

function signedArea(points: SketchPoint2D[]) {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    twiceArea += current.x * next.z - next.x * current.z;
  }
  return twiceArea / 2;
}

function perimeter(points: SketchPoint2D[]) {
  let length = 0;
  for (let i = 0; i < points.length; i += 1) {
    length += distance2d(points[i], points[(i + 1) % points.length]);
  }
  return length;
}

function cross(a: SketchPoint2D, b: SketchPoint2D, c: SketchPoint2D) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function onSegment(a: SketchPoint2D, b: SketchPoint2D, p: SketchPoint2D, epsilon: number) {
  if (Math.abs(cross(a, b, p)) > epsilon) return false;
  return p.x >= Math.min(a.x, b.x) - epsilon
    && p.x <= Math.max(a.x, b.x) + epsilon
    && p.z >= Math.min(a.z, b.z) - epsilon
    && p.z <= Math.max(a.z, b.z) + epsilon;
}

function segmentsIntersect(a: SketchPoint2D, b: SketchPoint2D, c: SketchPoint2D, d: SketchPoint2D, epsilon: number) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  const oppositeAB = (abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon);
  const oppositeCD = (cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon);
  if (oppositeAB && oppositeCD) return true;

  return (Math.abs(abC) <= epsilon && onSegment(a, b, c, epsilon))
    || (Math.abs(abD) <= epsilon && onSegment(a, b, d, epsilon))
    || (Math.abs(cdA) <= epsilon && onSegment(c, d, a, epsilon))
    || (Math.abs(cdB) <= epsilon && onSegment(c, d, b, epsilon));
}

function selfIntersectionCount(points: SketchPoint2D[], epsilon: number) {
  let count = 0;
  const segmentCount = points.length;
  for (let i = 0; i < segmentCount; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % segmentCount];
    for (let j = i + 1; j < segmentCount; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === segmentCount - 1);
      if (adjacent) continue;
      const c = points[j];
      const d = points[(j + 1) % segmentCount];
      if (segmentsIntersect(a, b, c, d, epsilon)) count += 1;
    }
  }
  return count;
}

function buildLineGraph(lines: SketchLineEntity[], toleranceMm: number) {
  const nodes: Node[] = [];
  const edges: GraphEdge[] = [];

  const nodeFor = (point: SketchPoint2D) => {
    const existing = nodes.findIndex((node) => distance2d(node.point, point) <= toleranceMm);
    if (existing >= 0) return existing;
    nodes.push({ point: { ...point }, edgeIndexes: [] });
    return nodes.length - 1;
  };

  for (const entity of lines) {
    const a = nodeFor(entity.start);
    const b = nodeFor(entity.end);
    const edgeIndex = edges.length;
    edges.push({ entity, a, b });
    nodes[a].edgeIndexes.push(edgeIndex);
    nodes[b].edgeIndexes.push(edgeIndex);
  }

  return { nodes, edges };
}

function connectedEdgeComponents(nodes: Node[], edges: GraphEdge[]) {
  const remaining = new Set(edges.map((_, index) => index));
  const components: number[][] = [];

  while (remaining.size > 0) {
    const seed = remaining.values().next().value as number;
    const queue = [seed];
    const component: number[] = [];
    remaining.delete(seed);

    while (queue.length > 0) {
      const edgeIndex = queue.shift()!;
      component.push(edgeIndex);
      const edge = edges[edgeIndex];
      for (const nodeIndex of [edge.a, edge.b]) {
        for (const adjacent of nodes[nodeIndex].edgeIndexes) {
          if (!remaining.has(adjacent)) continue;
          remaining.delete(adjacent);
          queue.push(adjacent);
        }
      }
    }
    components.push(component);
  }

  return components;
}

function orderCycle(nodes: Node[], edges: GraphEdge[], component: number[]) {
  const componentSet = new Set(component);
  const startEdgeIndex = component[0];
  const startVertex = edges[startEdgeIndex].a;
  const points: SketchPoint2D[] = [];
  const entityIds: string[] = [];
  const used = new Set<number>();
  let currentVertex = startVertex;
  let previousEdge = -1;

  for (let step = 0; step < component.length; step += 1) {
    points.push({ ...nodes[currentVertex].point });
    const nextEdgeIndex = nodes[currentVertex].edgeIndexes.find((index) => (
      componentSet.has(index) && index !== previousEdge && !used.has(index)
    ));
    if (nextEdgeIndex === undefined) return null;

    used.add(nextEdgeIndex);
    const edge = edges[nextEdgeIndex];
    entityIds.push(edge.entity.id);
    const nextVertex = edge.a === currentVertex ? edge.b : edge.a;
    previousEdge = nextEdgeIndex;
    currentVertex = nextVertex;
  }

  if (currentVertex !== startVertex || used.size !== component.length) return null;
  return { points, entityIds };
}

function analyzePolylineComponent(
  nodes: Node[],
  edges: GraphEdge[],
  component: number[],
  toleranceMm: number,
): SketchProfileCandidate | null {
  const vertexIndexes = new Set<number>();
  for (const edgeIndex of component) {
    vertexIndexes.add(edges[edgeIndex].a);
    vertexIndexes.add(edges[edgeIndex].b);
  }
  if (component.length < 3) return null;
  if ([...vertexIndexes].some((index) => nodes[index].edgeIndexes.filter((edgeIndex) => component.includes(edgeIndex)).length !== 2)) return null;

  const ordered = orderCycle(nodes, edges, component);
  if (!ordered || ordered.points.length < 3) return null;

  const area = signedArea(ordered.points);
  const intersections = selfIntersectionCount(ordered.points, Math.max(1e-9, toleranceMm * 1e-3));
  const issues: string[] = [];
  if (Math.abs(area) <= toleranceMm * toleranceMm) issues.push('Closed polyline has near-zero enclosed area.');
  if (intersections > 0) issues.push(`Closed polyline self-intersects ${intersections} time(s).`);
  if (new Set(ordered.points.map(pointKey)).size !== ordered.points.length) issues.push('Closed polyline revisits a vertex and is not a simple loop.');

  return {
    kind: 'polyline',
    entityIds: ordered.entityIds,
    points: ordered.points,
    areaMm2: Math.abs(area),
    perimeterMm: perimeter(ordered.points),
    winding: area >= 0 ? 'counter-clockwise' : 'clockwise',
    selfIntersectionCount: intersections,
    valid: issues.length === 0,
    issues,
  };
}

function circleCandidate(entity: SketchCircleEntity, toleranceMm: number): SketchProfileCandidate {
  const issues: string[] = [];
  if (!Number.isFinite(entity.radiusMm) || entity.radiusMm <= toleranceMm) issues.push('Circle radius is too small for a manufacturing profile.');
  return {
    kind: 'circle',
    entityIds: [entity.id],
    center: { ...entity.center },
    radiusMm: entity.radiusMm,
    areaMm2: Math.PI * entity.radiusMm * entity.radiusMm,
    perimeterMm: Math.PI * 2 * entity.radiusMm,
    winding: 'not-applicable',
    selfIntersectionCount: 0,
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Analyzes persisted sketch entities as possible future manufacturing profiles.
 * This function is intentionally read-only: a valid candidate does not change
 * the current rectangle-based solid until profile promotion is explicitly
 * implemented in both the fast mesh and exact B-Rep kernels.
 */
export function analyzeSketchProfiles(
  entities: SketchEntity[],
  options: { endpointToleranceMm?: number } = {},
): SketchProfileAnalysis {
  const toleranceMm = Math.max(1e-5, options.endpointToleranceMm ?? 0.05);
  const lines = entities.filter((entity): entity is SketchLineEntity => entity.kind === 'line');
  const circles = entities.filter((entity): entity is SketchCircleEntity => entity.kind === 'circle');
  const arcs = entities.filter((entity) => entity.kind === 'arc');
  const candidates: SketchProfileCandidate[] = circles.map((circle) => circleCandidate(circle, toleranceMm));
  let openComponentCount = 0;

  if (lines.length > 0) {
    const { nodes, edges } = buildLineGraph(lines, toleranceMm);
    for (const component of connectedEdgeComponents(nodes, edges)) {
      const candidate = analyzePolylineComponent(nodes, edges, component, toleranceMm);
      if (candidate) candidates.push(candidate);
      else openComponentCount += 1;
    }
  }

  const selfIntersections = candidates.reduce((sum, candidate) => sum + candidate.selfIntersectionCount, 0);
  const issues: string[] = [];
  if (openComponentCount > 0) issues.push(`${openComponentCount} line component(s) are open, branched or too small to form a profile.`);
  if (arcs.length > 0) issues.push(`${arcs.length} arc entity/entities are persisted but mixed arc-loop promotion is not validated yet.`);
  for (const candidate of candidates) issues.push(...candidate.issues);
  if (candidates.length > 1) issues.push(`${candidates.length} separate closed loops exist; multi-loop outer/hole classification is not promoted yet.`);
  if (candidates.length === 0 && entities.length > 0) issues.push('No closed manufacturing-profile candidate is currently available.');

  const primaryCandidate = candidates.length === 1 ? candidates[0] : null;
  const promotable = Boolean(
    primaryCandidate
    && primaryCandidate.valid
    && openComponentCount === 0
    && arcs.length === 0
    && candidates.length === 1,
  );

  return {
    candidates,
    closedLoopCount: candidates.length,
    openComponentCount,
    unsupportedArcCount: arcs.length,
    selfIntersectionCount: selfIntersections,
    promotable,
    primaryCandidate,
    issues,
  };
}
