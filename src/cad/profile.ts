import type {
  SketchArcEntity,
  SketchCircleEntity,
  SketchEntity,
  SketchLineEntity,
  SketchPoint2D,
} from './sketch';
import {
  arcEndpoint,
  distance2d,
  positiveArcSweepDeg,
} from './sketch';

export type ProfileWinding = 'clockwise' | 'counter-clockwise' | 'not-applicable';

export type ProfileLineSegment = {
  kind: 'line';
  entityId: string;
  start: SketchPoint2D;
  end: SketchPoint2D;
};

export type ProfileArcSegment = {
  kind: 'arc';
  entityId: string;
  center: SketchPoint2D;
  radiusMm: number;
  startAngleDeg: number;
  /** Signed traversal sweep. Positive follows the persisted Arc direction; negative is the reversed traversal. */
  sweepDeg: number;
  start: SketchPoint2D;
  end: SketchPoint2D;
};

export type ProfilePathSegment = ProfileLineSegment | ProfileArcSegment;

export type SketchPathProfileCandidate = {
  kind: 'polyline' | 'mixed';
  entityIds: string[];
  segments: ProfilePathSegment[];
  /** Sampled loop used only for conservative intersection diagnostics. */
  points: SketchPoint2D[];
  areaMm2: number;
  perimeterMm: number;
  winding: Exclude<ProfileWinding, 'not-applicable'>;
  selfIntersectionCount: number;
  valid: boolean;
  issues: string[];
};

export type SketchCircleProfileCandidate = {
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

export type SketchProfileCandidate = SketchPathProfileCandidate | SketchCircleProfileCandidate;

export type SketchProfileAnalysis = {
  candidates: SketchProfileCandidate[];
  closedLoopCount: number;
  openComponentCount: number;
  /** Retained for callers; Arc loops are now supported, so this is normally zero. */
  unsupportedArcCount: number;
  selfIntersectionCount: number;
  promotable: boolean;
  primaryCandidate: SketchProfileCandidate | null;
  issues: string[];
};

export type ProfileBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
};

export type ManufacturingProfile =
  | {
      kind: 'rectangle';
      source: 'named-rectangle';
      entityIds: [];
      width: number;
      depth: number;
      areaMm2: number;
      perimeterMm: number;
      bounds: ProfileBounds;
    }
  | {
      kind: 'polyline';
      source: 'sketch';
      entityIds: string[];
      points: SketchPoint2D[];
      segments: ProfileLineSegment[];
      areaMm2: number;
      perimeterMm: number;
      winding: Exclude<ProfileWinding, 'not-applicable'>;
      bounds: ProfileBounds;
    }
  | {
      kind: 'mixed';
      source: 'sketch';
      entityIds: string[];
      segments: ProfilePathSegment[];
      areaMm2: number;
      perimeterMm: number;
      winding: Exclude<ProfileWinding, 'not-applicable'>;
      bounds: ProfileBounds;
    }
  | {
      kind: 'circle';
      source: 'sketch';
      entityIds: [string];
      center: SketchPoint2D;
      radiusMm: number;
      areaMm2: number;
      perimeterMm: number;
      bounds: ProfileBounds;
    };

export type ManufacturingProfileResolution = {
  profile: ManufacturingProfile | null;
  promoted: boolean;
  issues: string[];
};

type PathEntity = SketchLineEntity | SketchArcEntity;
type Node = { point: SketchPoint2D; edgeIndexes: number[] };
type GraphEdge = { entity: PathEntity; a: number; b: number };
type OrderedGraphEdge = { edge: GraphEdge; forward: boolean; startNode: Node; endNode: Node };

function pointKey(point: SketchPoint2D) {
  return `${point.x.toFixed(6)},${point.z.toFixed(6)}`;
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

function pathEntityEndpoints(entity: PathEntity) {
  if (entity.kind === 'line') return { start: entity.start, end: entity.end };
  return { start: arcEndpoint(entity, 'start'), end: arcEndpoint(entity, 'end') };
}

function buildPathGraph(entities: PathEntity[], toleranceMm: number) {
  const nodes: Node[] = [];
  const edges: GraphEdge[] = [];

  const nodeFor = (point: SketchPoint2D) => {
    const existing = nodes.findIndex((node) => distance2d(node.point, point) <= toleranceMm);
    if (existing >= 0) return existing;
    nodes.push({ point: { ...point }, edgeIndexes: [] });
    return nodes.length - 1;
  };

  for (const entity of entities) {
    const endpoints = pathEntityEndpoints(entity);
    const a = nodeFor(endpoints.start);
    const b = nodeFor(endpoints.end);
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
  const ordered: OrderedGraphEdge[] = [];
  const used = new Set<number>();
  let currentVertex = startVertex;
  let previousEdge = -1;

  for (let step = 0; step < component.length; step += 1) {
    const nextEdgeIndex = nodes[currentVertex].edgeIndexes.find((index) => (
      componentSet.has(index) && index !== previousEdge && !used.has(index)
    ));
    if (nextEdgeIndex === undefined) return null;

    used.add(nextEdgeIndex);
    const edge = edges[nextEdgeIndex];
    const forward = edge.a === currentVertex;
    const nextVertex = forward ? edge.b : edge.a;
    ordered.push({ edge, forward, startNode: nodes[currentVertex], endNode: nodes[nextVertex] });
    previousEdge = nextEdgeIndex;
    currentVertex = nextVertex;
  }

  if (currentVertex !== startVertex || used.size !== component.length) return null;
  return ordered;
}

function segmentFromOrdered(entry: OrderedGraphEdge): ProfilePathSegment {
  const entity = entry.edge.entity;
  if (entity.kind === 'line') {
    const start = entry.forward ? entity.start : entity.end;
    const end = entry.forward ? entity.end : entity.start;
    return { kind: 'line', entityId: entity.id, start: { ...start }, end: { ...end } };
  }

  const positiveSweep = positiveArcSweepDeg(entity.startAngleDeg, entity.endAngleDeg);
  const startAngleDeg = entry.forward ? entity.startAngleDeg : entity.endAngleDeg;
  const sweepDeg = entry.forward ? positiveSweep : -positiveSweep;
  const start = entry.forward ? arcEndpoint(entity, 'start') : arcEndpoint(entity, 'end');
  const end = entry.forward ? arcEndpoint(entity, 'end') : arcEndpoint(entity, 'start');
  return {
    kind: 'arc',
    entityId: entity.id,
    center: { ...entity.center },
    radiusMm: entity.radiusMm,
    startAngleDeg,
    sweepDeg,
    start,
    end,
  };
}

function signedAreaContribution(segment: ProfilePathSegment) {
  if (segment.kind === 'line') {
    return (segment.start.x * segment.end.z - segment.end.x * segment.start.z) / 2;
  }
  const theta1 = segment.startAngleDeg * Math.PI / 180;
  const delta = segment.sweepDeg * Math.PI / 180;
  const theta2 = theta1 + delta;
  const { x: cx, z: cz } = segment.center;
  const r = segment.radiusMm;
  return 0.5 * (
    r * cx * (Math.sin(theta2) - Math.sin(theta1))
    - r * cz * (Math.cos(theta2) - Math.cos(theta1))
    + r * r * delta
  );
}

function pathPerimeter(segments: ProfilePathSegment[]) {
  return segments.reduce((sum, segment) => {
    if (segment.kind === 'line') return sum + distance2d(segment.start, segment.end);
    return sum + Math.abs(segment.sweepDeg) * Math.PI / 180 * segment.radiusMm;
  }, 0);
}

function samplePathSegments(segments: ProfilePathSegment[]) {
  const points: SketchPoint2D[] = [];
  for (const segment of segments) {
    if (points.length === 0) points.push({ ...segment.start });
    if (segment.kind === 'line') {
      points.push({ ...segment.end });
      continue;
    }
    const arcLength = Math.abs(segment.sweepDeg) * Math.PI / 180 * segment.radiusMm;
    const steps = Math.max(4, Math.ceil(Math.abs(segment.sweepDeg) / 5), Math.ceil(arcLength / 1.5));
    for (let index = 1; index <= steps; index += 1) {
      const angle = (segment.startAngleDeg + segment.sweepDeg * index / steps) * Math.PI / 180;
      points.push({
        x: segment.center.x + Math.cos(angle) * segment.radiusMm,
        z: segment.center.z + Math.sin(angle) * segment.radiusMm,
      });
    }
  }
  if (points.length > 1 && distance2d(points[0], points[points.length - 1]) <= 1e-6) points.pop();
  return points;
}

function angleOnSweep(angleDeg: number, startAngleDeg: number, sweepDeg: number) {
  const normalize = (value: number) => {
    let result = value % 360;
    if (result < 0) result += 360;
    return result;
  };
  if (sweepDeg >= 0) return normalize(angleDeg - startAngleDeg) <= sweepDeg + 1e-9;
  return normalize(startAngleDeg - angleDeg) <= -sweepDeg + 1e-9;
}

function pathBounds(segments: ProfilePathSegment[]): ProfileBounds {
  const points: SketchPoint2D[] = [];
  for (const segment of segments) {
    points.push({ ...segment.start }, { ...segment.end });
    if (segment.kind !== 'arc') continue;
    for (const angleDeg of [0, 90, 180, 270]) {
      if (!angleOnSweep(angleDeg, segment.startAngleDeg, segment.sweepDeg)) continue;
      const angle = angleDeg * Math.PI / 180;
      points.push({
        x: segment.center.x + Math.cos(angle) * segment.radiusMm,
        z: segment.center.z + Math.sin(angle) * segment.radiusMm,
      });
    }
  }
  return pointsBounds(points);
}

function analyzePathComponent(
  nodes: Node[],
  edges: GraphEdge[],
  component: number[],
  toleranceMm: number,
): SketchPathProfileCandidate | null {
  const vertexIndexes = new Set<number>();
  for (const edgeIndex of component) {
    vertexIndexes.add(edges[edgeIndex].a);
    vertexIndexes.add(edges[edgeIndex].b);
  }
  if (component.length < 2) return null;
  if ([...vertexIndexes].some((index) => nodes[index].edgeIndexes.filter((edgeIndex) => component.includes(edgeIndex)).length !== 2)) return null;

  const ordered = orderCycle(nodes, edges, component);
  if (!ordered) return null;
  const segments = ordered.map(segmentFromOrdered);
  const containsArc = segments.some((segment) => segment.kind === 'arc');
  if (!containsArc && segments.length < 3) return null;
  const sampledPoints = samplePathSegments(segments);
  if (sampledPoints.length < 3) return null;

  const signedArea = segments.reduce((sum, segment) => sum + signedAreaContribution(segment), 0);
  const intersections = selfIntersectionCount(sampledPoints, Math.max(1e-9, toleranceMm * 1e-3));
  const issues: string[] = [];
  if (Math.abs(signedArea) <= toleranceMm * toleranceMm) issues.push('Closed path has near-zero enclosed area.');
  if (intersections > 0) issues.push(`Closed path self-intersects ${intersections} time(s).`);
  const vertices = segments.map((segment) => segment.start);
  if (new Set(vertices.map(pointKey)).size !== vertices.length) issues.push('Closed path revisits a vertex and is not a simple loop.');
  for (let index = 0; index < segments.length; index += 1) {
    const current = segments[index];
    const next = segments[(index + 1) % segments.length];
    if (distance2d(current.end, next.start) > toleranceMm) issues.push(`Profile gap exceeds ${toleranceMm.toFixed(3)} mm near ${current.entityId}.`);
  }

  return {
    kind: containsArc ? 'mixed' : 'polyline',
    entityIds: segments.map((segment) => segment.entityId),
    segments,
    points: sampledPoints,
    areaMm2: Math.abs(signedArea),
    perimeterMm: pathPerimeter(segments),
    winding: signedArea >= 0 ? 'counter-clockwise' : 'clockwise',
    selfIntersectionCount: intersections,
    valid: issues.length === 0,
    issues,
  };
}

function circleCandidate(entity: SketchCircleEntity, toleranceMm: number): SketchCircleProfileCandidate {
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

export function analyzeSketchProfiles(
  entities: SketchEntity[],
  options: { endpointToleranceMm?: number } = {},
): SketchProfileAnalysis {
  const toleranceMm = Math.max(1e-5, options.endpointToleranceMm ?? 0.05);
  const pathEntities = entities.filter((entity): entity is PathEntity => entity.kind === 'line' || entity.kind === 'arc');
  const circles = entities.filter((entity): entity is SketchCircleEntity => entity.kind === 'circle');
  const candidates: SketchProfileCandidate[] = circles.map((circle) => circleCandidate(circle, toleranceMm));
  let openComponentCount = 0;

  if (pathEntities.length > 0) {
    const { nodes, edges } = buildPathGraph(pathEntities, toleranceMm);
    for (const component of connectedEdgeComponents(nodes, edges)) {
      const candidate = analyzePathComponent(nodes, edges, component, toleranceMm);
      if (candidate) candidates.push(candidate);
      else openComponentCount += 1;
    }
  }

  const selfIntersections = candidates.reduce((sum, candidate) => sum + candidate.selfIntersectionCount, 0);
  const issues: string[] = [];
  if (openComponentCount > 0) issues.push(`${openComponentCount} path component(s) are open, branched or too small to form a profile.`);
  for (const candidate of candidates) issues.push(...candidate.issues);
  if (candidates.length > 1) issues.push(`${candidates.length} separate closed loops exist; outer/hole classification is not promoted yet.`);
  if (candidates.length === 0 && entities.length > 0) issues.push('No closed manufacturing-profile candidate is currently available.');

  const primaryCandidate = candidates.length === 1 ? candidates[0] : null;
  const promotable = Boolean(
    primaryCandidate
    && primaryCandidate.valid
    && openComponentCount === 0
    && candidates.length === 1,
  );

  return {
    candidates,
    closedLoopCount: candidates.length,
    openComponentCount,
    unsupportedArcCount: 0,
    selfIntersectionCount: selfIntersections,
    promotable,
    primaryCandidate,
    issues,
  };
}

function pointsBounds(points: SketchPoint2D[]): ProfileBounds {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

/**
 * Resolve the solid-producing profile from persisted sketch data.
 * Existing schema-v5 `construction` flags remain the explicit promotion boundary.
 */
export function resolveManufacturingProfile(
  entities: SketchEntity[],
  fallbackWidth: number,
  fallbackDepth: number,
): ManufacturingProfileResolution {
  const manufacturingEntities = entities.filter((entity) => !entity.construction);
  if (manufacturingEntities.length === 0) {
    const width = Math.max(0.1, fallbackWidth);
    const depth = Math.max(0.1, fallbackDepth);
    return {
      promoted: false,
      issues: [],
      profile: {
        kind: 'rectangle',
        source: 'named-rectangle',
        entityIds: [],
        width,
        depth,
        areaMm2: width * depth,
        perimeterMm: 2 * (width + depth),
        bounds: { minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2, width, depth },
      },
    };
  }

  const analysis = analyzeSketchProfiles(manufacturingEntities);
  if (!analysis.promotable || !analysis.primaryCandidate) {
    return {
      promoted: true,
      profile: null,
      issues: analysis.issues.length > 0
        ? analysis.issues
        : ['The promoted sketch entities do not form one validated manufacturing loop.'],
    };
  }

  const candidate = analysis.primaryCandidate;
  if (candidate.kind === 'circle') {
    const bounds = {
      minX: candidate.center.x - candidate.radiusMm,
      maxX: candidate.center.x + candidate.radiusMm,
      minZ: candidate.center.z - candidate.radiusMm,
      maxZ: candidate.center.z + candidate.radiusMm,
      width: candidate.radiusMm * 2,
      depth: candidate.radiusMm * 2,
    };
    return {
      promoted: true,
      issues: [],
      profile: {
        kind: 'circle', source: 'sketch', entityIds: candidate.entityIds, center: { ...candidate.center },
        radiusMm: candidate.radiusMm, areaMm2: candidate.areaMm2, perimeterMm: candidate.perimeterMm, bounds,
      },
    };
  }

  if (candidate.kind === 'mixed') {
    return {
      promoted: true,
      issues: [],
      profile: {
        kind: 'mixed', source: 'sketch', entityIds: [...candidate.entityIds],
        segments: candidate.segments.map((segment) => segment.kind === 'line'
          ? { ...segment, start: { ...segment.start }, end: { ...segment.end } }
          : { ...segment, center: { ...segment.center }, start: { ...segment.start }, end: { ...segment.end } }),
        areaMm2: candidate.areaMm2, perimeterMm: candidate.perimeterMm, winding: candidate.winding,
        bounds: pathBounds(candidate.segments),
      },
    };
  }

  return {
    promoted: true,
    issues: [],
    profile: {
      kind: 'polyline', source: 'sketch', entityIds: [...candidate.entityIds],
      points: candidate.segments.map((segment) => ({ ...segment.start })),
      segments: candidate.segments.map((segment) => ({ ...segment, start: { ...segment.start }, end: { ...segment.end } })) as ProfileLineSegment[],
      areaMm2: candidate.areaMm2, perimeterMm: candidate.perimeterMm, winding: candidate.winding,
      bounds: pathBounds(candidate.segments),
    },
  };
}
