import {
  analyzeSketchProfiles,
  resolveManufacturingProfile,
  type ManufacturingProfile,
  type ProfileArcSegment,
  type ProfileBounds,
  type ProfileLineSegment,
  type ProfilePathSegment,
  type ProfileWinding,
  type SketchPathProfileCandidate,
  type SketchProfileAnalysis,
  type SketchProfileCandidate,
} from './profile';
import type { SketchEntity, SketchPoint2D } from './sketch';

export type ManufacturingPathLoop = {
  kind: 'polyline' | 'mixed';
  entityIds: string[];
  segments: ProfilePathSegment[];
  areaMm2: number;
  perimeterMm: number;
  winding: Exclude<ProfileWinding, 'not-applicable'>;
  bounds: ProfileBounds;
};

export type ManufacturingCircleLoop = {
  kind: 'circle';
  entityIds: [string];
  center: SketchPoint2D;
  radiusMm: number;
  areaMm2: number;
  perimeterMm: number;
  bounds: ProfileBounds;
};

export type ManufacturingLoop = ManufacturingPathLoop | ManufacturingCircleLoop;

export type ManufacturingRegionProfile = {
  kind: 'region';
  source: 'sketch';
  entityIds: string[];
  outer: ManufacturingLoop;
  holes: ManufacturingLoop[];
  areaMm2: number;
  perimeterMm: number;
  bounds: ProfileBounds;
};

export type ResolvedManufacturingProfile = ManufacturingProfile | ManufacturingRegionProfile;

export type ManufacturingRegionAnalysis = {
  analysis: SketchProfileAnalysis;
  promotable: boolean;
  outerCandidate: SketchProfileCandidate | null;
  holeCandidates: SketchProfileCandidate[];
  promotionEntityIds: string[];
  areaMm2: number;
  perimeterMm: number;
  issues: string[];
};

export type ManufacturingProfileResolution = {
  profile: ResolvedManufacturingProfile | null;
  promoted: boolean;
  issues: string[];
};

function pointsBounds(points: SketchPoint2D[]): ProfileBounds {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

function normalizeAngle(value: number) {
  let result = value % 360;
  if (result < 0) result += 360;
  return result;
}

function angleOnSweep(angleDeg: number, startAngleDeg: number, sweepDeg: number) {
  if (sweepDeg >= 0) return normalizeAngle(angleDeg - startAngleDeg) <= sweepDeg + 1e-9;
  return normalizeAngle(startAngleDeg - angleDeg) <= -sweepDeg + 1e-9;
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

function sampleCircle(center: SketchPoint2D, radiusMm: number, count = 128) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * radiusMm, z: center.z + Math.sin(angle) * radiusMm };
  });
}

function candidateSamplePoints(candidate: SketchProfileCandidate) {
  return candidate.kind === 'circle'
    ? sampleCircle(candidate.center, candidate.radiusMm)
    : candidate.points.map((point) => ({ ...point }));
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

function loopsIntersect(a: SketchProfileCandidate, b: SketchProfileCandidate, epsilon: number) {
  const aPoints = candidateSamplePoints(a);
  const bPoints = candidateSamplePoints(b);
  for (let ai = 0; ai < aPoints.length; ai += 1) {
    const a0 = aPoints[ai];
    const a1 = aPoints[(ai + 1) % aPoints.length];
    for (let bi = 0; bi < bPoints.length; bi += 1) {
      const b0 = bPoints[bi];
      const b1 = bPoints[(bi + 1) % bPoints.length];
      if (segmentsIntersect(a0, a1, b0, b1, epsilon)) return true;
    }
  }
  return false;
}

function pointInPolygon(point: SketchPoint2D, polygon: SketchPoint2D[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.z > point.z) !== (b.z > point.z)
      && point.x < (b.x - a.x) * (point.z - a.z) / ((b.z - a.z) || 1e-12) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInsideCandidate(point: SketchPoint2D, candidate: SketchProfileCandidate, epsilon: number) {
  if (candidate.kind === 'circle') {
    return Math.hypot(point.x - candidate.center.x, point.z - candidate.center.z) < candidate.radiusMm - epsilon;
  }
  return pointInPolygon(point, candidate.points);
}

function candidateContainedBy(inner: SketchProfileCandidate, outer: SketchProfileCandidate, epsilon: number) {
  const samples = candidateSamplePoints(inner);
  return samples.every((point) => pointInsideCandidate(point, outer, epsilon));
}

function cloneSegment(segment: ProfilePathSegment): ProfilePathSegment {
  if (segment.kind === 'line') {
    const line: ProfileLineSegment = { ...segment, start: { ...segment.start }, end: { ...segment.end } };
    return line;
  }
  const arc: ProfileArcSegment = {
    ...segment,
    center: { ...segment.center },
    start: { ...segment.start },
    end: { ...segment.end },
  };
  return arc;
}

function candidateToLoop(candidate: SketchProfileCandidate): ManufacturingLoop {
  if (candidate.kind === 'circle') {
    return {
      kind: 'circle',
      entityIds: candidate.entityIds,
      center: { ...candidate.center },
      radiusMm: candidate.radiusMm,
      areaMm2: candidate.areaMm2,
      perimeterMm: candidate.perimeterMm,
      bounds: {
        minX: candidate.center.x - candidate.radiusMm,
        maxX: candidate.center.x + candidate.radiusMm,
        minZ: candidate.center.z - candidate.radiusMm,
        maxZ: candidate.center.z + candidate.radiusMm,
        width: candidate.radiusMm * 2,
        depth: candidate.radiusMm * 2,
      },
    };
  }

  return {
    kind: candidate.kind,
    entityIds: [...candidate.entityIds],
    segments: candidate.segments.map(cloneSegment),
    areaMm2: candidate.areaMm2,
    perimeterMm: candidate.perimeterMm,
    winding: candidate.winding,
    bounds: pathBounds(candidate.segments),
  };
}

/**
 * Classifies validated closed loops into the intentionally narrow first
 * multi-loop region model: exactly one outer loop plus zero or more direct
 * holes. Intersecting/touching loops and nested islands are rejected rather
 * than assigned ambiguous manufacturing meaning.
 */
export function analyzePromotableRegion(
  entities: SketchEntity[],
  options: { endpointToleranceMm?: number } = {},
): ManufacturingRegionAnalysis {
  const toleranceMm = Math.max(1e-5, options.endpointToleranceMm ?? 0.05);
  const analysis = analyzeSketchProfiles(entities, options);
  const candidates = analysis.candidates;
  const issues: string[] = [];

  if (analysis.openComponentCount > 0) issues.push(`${analysis.openComponentCount} path component(s) are open or branched.`);
  for (const candidate of candidates) issues.push(...candidate.issues);
  if (candidates.length === 0 && entities.length > 0) issues.push('No closed manufacturing region is available.');
  if (entities.length === 0) issues.push('No sketch entities are available for manufacturing promotion.');

  if (issues.length > 0 || candidates.length === 0) {
    return { analysis, promotable: false, outerCandidate: null, holeCandidates: [], promotionEntityIds: [], areaMm2: 0, perimeterMm: 0, issues };
  }

  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      if (loopsIntersect(candidates[first], candidates[second], Math.max(1e-7, toleranceMm * 1e-3))) {
        issues.push(`Closed loops ${first + 1} and ${second + 1} intersect or touch; region promotion is ambiguous.`);
      }
    }
  }
  if (issues.length > 0) {
    return { analysis, promotable: false, outerCandidate: null, holeCandidates: [], promotionEntityIds: [], areaMm2: 0, perimeterMm: 0, issues };
  }

  const depths = candidates.map((candidate, candidateIndex) => candidates.reduce((depth, possibleOuter, outerIndex) => {
    if (candidateIndex === outerIndex) return depth;
    return depth + (candidateContainedBy(candidate, possibleOuter, toleranceMm * 0.1) ? 1 : 0);
  }, 0));

  const outerIndexes = depths.map((depth, index) => ({ depth, index })).filter(({ depth }) => depth === 0).map(({ index }) => index);
  if (outerIndexes.length !== 1) {
    issues.push(`Expected one outer contour but found ${outerIndexes.length}. Separate islands are not enabled yet.`);
    return { analysis, promotable: false, outerCandidate: null, holeCandidates: [], promotionEntityIds: [], areaMm2: 0, perimeterMm: 0, issues };
  }

  const outerIndex = outerIndexes[0];
  const nestedIndexes = depths.map((depth, index) => ({ depth, index })).filter(({ depth, index }) => index !== outerIndex && depth !== 1);
  if (nestedIndexes.length > 0) {
    issues.push('Nested islands/depth > 1 are not enabled yet; only direct holes inside one outer contour are supported.');
    return { analysis, promotable: false, outerCandidate: null, holeCandidates: [], promotionEntityIds: [], areaMm2: 0, perimeterMm: 0, issues };
  }

  const outerCandidate = candidates[outerIndex];
  const holeCandidates = candidates.filter((_, index) => index !== outerIndex);
  const holeArea = holeCandidates.reduce((sum, candidate) => sum + candidate.areaMm2, 0);
  const netArea = outerCandidate.areaMm2 - holeArea;
  if (netArea <= toleranceMm * toleranceMm) {
    issues.push('Inner holes consume the entire outer manufacturing region.');
  }

  const promotionEntityIds = candidates.flatMap((candidate) => candidate.entityIds);
  return {
    analysis,
    promotable: issues.length === 0,
    outerCandidate: issues.length === 0 ? outerCandidate : null,
    holeCandidates: issues.length === 0 ? holeCandidates : [],
    promotionEntityIds: issues.length === 0 ? promotionEntityIds : [],
    areaMm2: issues.length === 0 ? netArea : 0,
    perimeterMm: issues.length === 0
      ? outerCandidate.perimeterMm + holeCandidates.reduce((sum, candidate) => sum + candidate.perimeterMm, 0)
      : 0,
    issues,
  };
}

/** Resolve the manufacturing profile while extending schema-v5 promotion to a
 * single connected region with direct inner holes. No project-format change is
 * needed because loop membership is still persisted by construction=false. */
export function resolveManufacturingProfileWithRegions(
  entities: SketchEntity[],
  fallbackWidth: number,
  fallbackDepth: number,
): ManufacturingProfileResolution {
  const manufacturingEntities = entities.filter((entity) => !entity.construction);
  if (manufacturingEntities.length === 0) {
    return resolveManufacturingProfile(entities, fallbackWidth, fallbackDepth);
  }

  const region = analyzePromotableRegion(manufacturingEntities);
  if (!region.promotable || !region.outerCandidate) {
    return {
      promoted: true,
      profile: null,
      issues: region.issues.length > 0 ? region.issues : ['The promoted sketch entities do not form one supported manufacturing region.'],
    };
  }

  if (region.holeCandidates.length === 0) {
    return resolveManufacturingProfile(manufacturingEntities, fallbackWidth, fallbackDepth);
  }

  const outer = candidateToLoop(region.outerCandidate);
  const holes = region.holeCandidates.map(candidateToLoop);
  return {
    promoted: true,
    issues: [],
    profile: {
      kind: 'region',
      source: 'sketch',
      entityIds: [...region.promotionEntityIds],
      outer,
      holes,
      areaMm2: region.areaMm2,
      perimeterMm: region.perimeterMm,
      bounds: { ...outer.bounds },
    },
  };
}
