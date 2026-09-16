import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { ProfilePathSegment } from './profile';
import type { ManufacturingLoop } from './profile-region';
import type { RebuiltPart } from './rebuild';
import type { BaseFaceSeed } from './topology-evolution';

type Bounds2D = { minX: number; maxX: number; minY: number; maxY: number };
type SideDescriptor = {
  role: string;
  surfaceType: 'plane' | 'cylinder';
  bounds: Bounds2D;
};

type FaceObservation = {
  hash: number;
  surfaceType: string;
  bounds: Bounds2D & { minZ: number; maxZ: number };
};

function normalizeAngle(value: number) {
  let result = value % 360;
  if (result < 0) result += 360;
  return result;
}

function angleOnSweep(angleDeg: number, startAngleDeg: number, sweepDeg: number) {
  if (sweepDeg >= 0) return normalizeAngle(angleDeg - startAngleDeg) <= sweepDeg + 1e-9;
  return normalizeAngle(startAngleDeg - angleDeg) <= -sweepDeg + 1e-9;
}

function segmentBounds(segment: ProfilePathSegment): Bounds2D {
  const points = [segment.start, segment.end];
  if (segment.kind === 'arc') {
    for (const angleDeg of [0, 90, 180, 270]) {
      if (!angleOnSweep(angleDeg, segment.startAngleDeg, segment.sweepDeg)) continue;
      const angle = angleDeg * Math.PI / 180;
      points.push({
        x: segment.center.x + Math.cos(angle) * segment.radiusMm,
        z: segment.center.z + Math.sin(angle) * segment.radiusMm,
      });
    }
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function loopDescriptors(loop: ManufacturingLoop, scope: string): SideDescriptor[] {
  if (loop.kind === 'circle') {
    return [{
      role: `side:${scope}:circle:${loop.entityIds[0]}`,
      surfaceType: 'cylinder',
      bounds: {
        minX: loop.center.x - loop.radiusMm,
        maxX: loop.center.x + loop.radiusMm,
        minY: loop.center.z - loop.radiusMm,
        maxY: loop.center.z + loop.radiusMm,
      },
    }];
  }

  return loop.segments.map((segment) => ({
    role: `side:${scope}:${segment.kind}:${segment.entityId}`,
    surfaceType: segment.kind === 'line' ? 'plane' : 'cylinder',
    bounds: segmentBounds(segment),
  }));
}

function profileSideDescriptors(rebuilt: RebuiltPart) {
  const profile = rebuilt.manufacturingProfile;
  if (!profile || profile.kind === 'rectangle') return [] as SideDescriptor[];
  if (profile.kind === 'region') {
    return [
      ...loopDescriptors(profile.outer, 'outer'),
      ...profile.holes.flatMap((hole, index) => loopDescriptors(hole, `hole:${index + 1}`)),
    ];
  }
  if (profile.kind === 'circle') {
    return [{
      role: `side:outer:circle:${profile.entityIds[0]}`,
      surfaceType: 'cylinder' as const,
      bounds: {
        minX: profile.center.x - profile.radiusMm,
        maxX: profile.center.x + profile.radiusMm,
        minY: profile.center.z - profile.radiusMm,
        maxY: profile.center.z + profile.radiusMm,
      },
    }];
  }
  return profile.segments.map((segment) => ({
    role: `side:outer:${segment.kind}:${segment.entityId}`,
    surfaceType: segment.kind === 'line' ? 'plane' as const : 'cylinder' as const,
    bounds: segmentBounds(segment),
  }));
}

function boundsScore(actual: Bounds2D, expected: Bounds2D, span: number) {
  return (
    Math.abs(actual.minX - expected.minX)
    + Math.abs(actual.maxX - expected.maxX)
    + Math.abs(actual.minY - expected.minY)
    + Math.abs(actual.maxY - expected.maxY)
  ) / (4 * Math.max(span, 1));
}

function observeFace(kernel: OcctKernel, face: ShapeHandle): FaceObservation {
  const box = kernel.getBoundingBox(face, false);
  return {
    hash: kernel.hashCode(face, 2_147_483_647),
    surfaceType: kernel.surfaceType(face),
    bounds: {
      minX: box.xmin,
      maxX: box.xmax,
      minY: box.ymin,
      maxY: box.ymax,
      minZ: box.zmin,
      maxZ: box.zmax,
    },
  };
}

/**
 * Seed exact base-face lineage from semantic sketch entities.
 *
 * Rectangle roles retain their historical names. Promoted profiles gain stable
 * roles such as `side:outer:line:<entityId>` and
 * `side:hole:1:arc:<entityId>`. Runtime OCCT hashes are only used to attach the
 * semantic seed for the current rebuild and never enter persisted project data.
 */
export function classifyBaseFaceLineage(
  kernel: OcctKernel,
  shape: ShapeHandle,
  rebuilt: RebuiltPart,
  warnings: string[] = [],
): BaseFaceSeed[] {
  const handles = kernel.getSubShapes(shape, 'face');
  const observations: FaceObservation[] = [];
  try {
    for (const face of handles) observations.push(observeFace(kernel, face));
  } finally {
    for (const face of handles) kernel.release(face);
  }

  const tolerance = Math.max(rebuilt.width, rebuilt.depth, rebuilt.height, 1) * 1e-6;
  const seeds = new Map<number, string>();
  const sideFaces: FaceObservation[] = [];

  for (const face of observations) {
    const extentZ = face.bounds.maxZ - face.bounds.minZ;
    const centerZ = (face.bounds.minZ + face.bounds.maxZ) / 2;
    if (extentZ <= tolerance) {
      const role = Math.abs(centerZ - rebuilt.height) <= Math.max(tolerance, 1e-6) ? 'top' : 'bottom';
      seeds.set(face.hash, role);
      continue;
    }

    if (rebuilt.manufacturingProfile?.kind === 'rectangle') {
      const cx = (face.bounds.minX + face.bounds.maxX) / 2;
      const cy = (face.bounds.minY + face.bounds.maxY) / 2;
      const extentX = face.bounds.maxX - face.bounds.minX;
      const extentY = face.bounds.maxY - face.bounds.minY;
      if (extentX <= tolerance) seeds.set(face.hash, cx >= 0 ? 'side:+x' : 'side:-x');
      else if (extentY <= tolerance) seeds.set(face.hash, cy >= 0 ? 'side:+depth' : 'side:-depth');
      else sideFaces.push(face);
      continue;
    }

    sideFaces.push(face);
  }

  if (rebuilt.manufacturingProfile?.kind !== 'rectangle') {
    const descriptors = profileSideDescriptors(rebuilt);
    const span = Math.max(rebuilt.width, rebuilt.depth, 1);
    const pairs: { face: FaceObservation; descriptor: SideDescriptor; score: number }[] = [];
    for (const face of sideFaces) {
      for (const descriptor of descriptors) {
        const typePenalty = face.surfaceType === descriptor.surfaceType ? 0 : 2;
        pairs.push({
          face,
          descriptor,
          score: boundsScore(face.bounds, descriptor.bounds, span) + typePenalty,
        });
      }
    }
    pairs.sort((a, b) => a.score - b.score || a.descriptor.role.localeCompare(b.descriptor.role) || a.face.hash - b.face.hash);

    const claimedFaces = new Set<number>();
    const claimedRoles = new Set<string>();
    for (const pair of pairs) {
      if (claimedFaces.has(pair.face.hash) || claimedRoles.has(pair.descriptor.role)) continue;
      if (pair.score > 0.08) continue;
      claimedFaces.add(pair.face.hash);
      claimedRoles.add(pair.descriptor.role);
      seeds.set(pair.face.hash, pair.descriptor.role);
    }

    const missing = descriptors.filter((descriptor) => !claimedRoles.has(descriptor.role));
    const unclassified = sideFaces.filter((face) => !claimedFaces.has(face.hash));
    if (missing.length > 0 || unclassified.length > 0) {
      warnings.push(`Base side-face lineage matched ${descriptors.length - missing.length}/${descriptors.length} profile segment(s); ${unclassified.length} side face(s) remain generic.`);
    }
  }

  let genericOrdinal = 0;
  return observations.map((face) => {
    let role = seeds.get(face.hash);
    if (!role) {
      genericOrdinal += 1;
      role = `base-face:${genericOrdinal}`;
    }
    return { hash: face.hash, role };
  });
}
