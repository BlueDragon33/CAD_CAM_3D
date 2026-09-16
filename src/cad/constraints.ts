import type { CadProject, SketchConstraint, SketchFeature, SketchPointRef } from './model';
import { analyzePromotableRegion, resolveManufacturingProfileWithRegions } from './profile-region';
import {
  analyzeSketchEntities,
  arcEndpoint,
  distance2d,
  type SketchEntity,
  type SketchPoint2D,
} from './sketch';

export type SolvedSketch = {
  width: number;
  depth: number;
  centered: boolean;
  fullyConstrained: boolean;
  entityCount: number;
  estimatedDegreesOfFreedom: number;
  profileCandidateCount: number;
  profilePromotable: boolean;
  messages: string[];
};

function cloneEntity(entity: SketchEntity): SketchEntity {
  if (entity.kind === 'line') return { ...entity, start: { ...entity.start }, end: { ...entity.end } };
  return { ...entity, center: { ...entity.center } };
}

function readPoint(entity: SketchEntity | undefined, ref: SketchPointRef): SketchPoint2D | null {
  if (!entity || entity.id !== ref.entityId) return null;
  if (ref.point === 'center') return entity.kind === 'line' ? null : { ...entity.center };
  if (entity.kind === 'line') return ref.point === 'start' ? { ...entity.start } : { ...entity.end };
  if (entity.kind === 'arc') return arcEndpoint(entity, ref.point);
  return null;
}

function writePoint(entity: SketchEntity | undefined, ref: SketchPointRef, point: SketchPoint2D) {
  if (!entity || entity.id !== ref.entityId) return;
  if (ref.point === 'center') {
    if (entity.kind !== 'line') entity.center = { ...point };
    return;
  }
  if (entity.kind === 'line') {
    if (ref.point === 'start') entity.start = { ...point };
    else entity.end = { ...point };
    return;
  }
  if (entity.kind !== 'arc') return;

  const radiusMm = distance2d(entity.center, point);
  if (radiusMm <= 1e-9) return;
  const angleDeg = Math.atan2(point.z - entity.center.z, point.x - entity.center.x) * 180 / Math.PI;
  entity.radiusMm = Math.max(0.1, radiusMm);
  if (ref.point === 'start') entity.startAngleDeg = angleDeg;
  else entity.endAngleDeg = angleDeg;
}

/**
 * Apply the subset of sketch constraints currently exposed by the product.
 * The solver is deliberately deterministic and directional: a coincident
 * constraint moves its `first` point onto `second`. Repeating the ordered pass
 * lets small dependency chains settle without introducing a second geometry
 * model or a non-deterministic numerical optimizer.
 */
export function applySketchConstraints(
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  iterations = 4,
): SketchEntity[] {
  const solved = entities.map(cloneEntity);
  const byId = new Map(solved.map((entity) => [entity.id, entity] as const));
  const passes = Math.max(1, Math.min(12, Math.floor(iterations)));

  for (let pass = 0; pass < passes; pass += 1) {
    for (const constraint of constraints) {
      if (constraint.kind === 'horizontal' || constraint.kind === 'vertical') {
        const entity = byId.get(constraint.entityId);
        if (!entity || entity.kind !== 'line') continue;
        if (constraint.kind === 'horizontal') entity.end.z = entity.start.z;
        else entity.end.x = entity.start.x;
        continue;
      }

      if (constraint.kind === 'coincident') {
        const target = readPoint(byId.get(constraint.second.entityId), constraint.second);
        if (!target) continue;
        writePoint(byId.get(constraint.first.entityId), constraint.first, target);
        continue;
      }

      if (constraint.kind === 'radius') {
        const entity = byId.get(constraint.entityId);
        if (!entity || entity.kind === 'line') continue;
        entity.radiusMm = Math.max(0.1, constraint.valueMm);
        continue;
      }

      if (constraint.kind === 'distance') {
        const entity = byId.get(constraint.entityId);
        if (!entity || entity.kind !== 'line') continue;
        const targetLength = Math.max(0.1, constraint.valueMm);
        const dx = entity.end.x - entity.start.x;
        const dz = entity.end.z - entity.start.z;
        const length = Math.hypot(dx, dz);
        if (length <= 1e-9) {
          entity.end = { x: entity.start.x + targetLength, z: entity.start.z };
        } else {
          entity.end = {
            x: entity.start.x + (dx / length) * targetLength,
            z: entity.start.z + (dz / length) * targetLength,
          };
        }
      }
    }
  }

  return solved;
}

export function upsertEntityDimensionConstraint(
  constraints: SketchConstraint[],
  entityId: string,
  kind: 'distance' | 'radius',
  valueMm: number,
) {
  const value = Math.max(0.1, valueMm);
  let replaced = false;
  const next = constraints.map((constraint) => {
    if ((constraint.kind === 'distance' || constraint.kind === 'radius') && constraint.entityId === entityId && constraint.kind === kind) {
      replaced = true;
      return { ...constraint, valueMm: value } as SketchConstraint;
    }
    return constraint;
  });
  if (!replaced) next.push({ id: crypto.randomUUID(), kind, entityId, valueMm: value });
  return next;
}

export function replaceLineOrientationConstraint(
  constraints: SketchConstraint[],
  entityId: string,
  kind: 'horizontal' | 'vertical' | null,
) {
  const next = constraints.filter((constraint) => !(
    (constraint.kind === 'horizontal' || constraint.kind === 'vertical') && constraint.entityId === entityId
  ));
  if (kind) next.push({ id: crypto.randomUUID(), kind, entityId });
  return next;
}

export function removeEntityConstraints(constraints: SketchConstraint[], entityId: string) {
  return constraints.filter((constraint) => {
    if (constraint.kind === 'centered' || constraint.kind === 'width' || constraint.kind === 'depth') return true;
    if (constraint.kind === 'coincident') {
      return constraint.first.entityId !== entityId && constraint.second.entityId !== entityId;
    }
    return constraint.entityId !== entityId;
  });
}

function constrainedEntityDof(feature: SketchFeature) {
  const analysis = analyzeSketchEntities(feature.params.entities);
  let reduction = 0;

  for (const constraint of feature.params.constraints) {
    if (constraint.kind === 'horizontal' || constraint.kind === 'vertical') reduction += 1;
    else if (constraint.kind === 'coincident') reduction += 2;
    else if (constraint.kind === 'distance' || constraint.kind === 'radius') reduction += 1;
  }

  return {
    ...analysis,
    estimatedDegreesOfFreedom: Math.max(0, analysis.estimatedDegreesOfFreedom - reduction),
  };
}

/** Deterministic sketch-state analyzer shared by editing and semantic rebuild. */
export function solveSketch(project: CadProject, feature: SketchFeature): SolvedSketch {
  const constraints = feature.params.constraints;
  const hasCentered = constraints.some((constraint) => constraint.kind === 'centered');
  const hasWidth = constraints.some((constraint) => constraint.kind === 'width');
  const hasDepth = constraints.some((constraint) => constraint.kind === 'depth');
  const entityAnalysis = constrainedEntityDof(feature);
  const constrained = applySketchConstraints(feature.params.entities, constraints);
  const constructionEntities = constrained.filter((entity) => entity.construction);
  const regionAnalysis = analyzePromotableRegion(constructionEntities.length > 0 ? constructionEntities : constrained);
  const manufacturing = resolveManufacturingProfileWithRegions(constrained, project.dimensions.width, project.dimensions.depth);
  const messages = [...entityAnalysis.issues];

  if (!hasCentered) messages.push('Sketch is missing the centered profile constraint.');
  if (!hasWidth) messages.push('Sketch width is not tied to the named width parameter.');
  if (!hasDepth) messages.push('Sketch depth is not tied to the named depth parameter.');
  if (entityAnalysis.entityCount > 0 && entityAnalysis.estimatedDegreesOfFreedom > 0) {
    messages.push(`${entityAnalysis.estimatedDegreesOfFreedom} estimated sketch degree(s) of freedom remain.`);
  }

  for (let index = 0; index < constrained.length; index += 1) {
    const before = feature.params.entities[index];
    const after = constrained[index];
    if (before.kind === 'line' && after.kind === 'line' && distance2d(before.start, after.start) + distance2d(before.end, after.end) > 1e-5) {
      messages.push(`Line ${before.id} is geometry-constrained and is solved deterministically in the sketch workspace.`);
    }
  }

  if (manufacturing.promoted) {
    if (manufacturing.profile) {
      const holeText = manufacturing.profile.kind === 'region' ? ` · ${manufacturing.profile.holes.length} inner hole(s)` : '';
      messages.push(`Promoted ${manufacturing.profile.kind} manufacturing profile is active · area ${manufacturing.profile.areaMm2.toFixed(2)} mm²${holeText}.`);
    } else {
      messages.push(...manufacturing.issues.map((message) => `Manufacturing profile: ${message}`));
    }
  } else if (regionAnalysis.promotable && regionAnalysis.outerCandidate) {
    const holeText = regionAnalysis.holeCandidates.length > 0 ? ` · ${regionAnalysis.holeCandidates.length} inner hole(s)` : '';
    messages.push(`Closed manufacturing region ready · area ${regionAnalysis.areaMm2.toFixed(2)} mm² · perimeter ${regionAnalysis.perimeterMm.toFixed(2)} mm${holeText}.`);
  } else if (constructionEntities.length > 0) {
    messages.push(...regionAnalysis.issues.map((message) => `Profile validation: ${message}`));
  }

  return {
    width: Math.max(0.1, project.dimensions.width),
    depth: Math.max(0.1, project.dimensions.depth),
    centered: hasCentered,
    fullyConstrained: hasCentered && hasWidth && hasDepth && entityAnalysis.estimatedDegreesOfFreedom === 0,
    entityCount: entityAnalysis.entityCount,
    estimatedDegreesOfFreedom: entityAnalysis.estimatedDegreesOfFreedom,
    profileCandidateCount: regionAnalysis.analysis.closedLoopCount,
    profilePromotable: regionAnalysis.promotable,
    messages,
  };
}
