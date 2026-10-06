import type { CadProject, SketchConstraint, SketchFeature, SketchPointRef } from './model';
import { analyzePromotableRegion, resolveManufacturingProfileWithRegions } from './profile-region';
import {
  analyzeSketchEntities,
  arcEndpoint,
  distance2d,
  type SketchEntity,
  type SketchPoint2D,
} from './sketch';

export type SketchConstraintState =
  | 'empty'
  | 'under-constrained'
  | 'fully-constrained'
  | 'over-constrained'
  | 'inconsistent';

export type SketchConstraintIssue = {
  code:
    | 'missing-entity'
    | 'invalid-target'
    | 'invalid-point'
    | 'conflicting-dimension'
    | 'conflicting-orientation'
    | 'redundant-constraint';
  constraintIds: string[];
  message: string;
};

export type SketchConstraintSetAnalysis = {
  conflicts: SketchConstraintIssue[];
  redundantConstraintIds: string[];
  independentDofReduction: number;
};

export type SolvedSketch = {
  entities: SketchEntity[];
  width: number;
  depth: number;
  centered: boolean;
  fullyConstrained: boolean;
  constraintState: SketchConstraintState;
  conflicts: SketchConstraintIssue[];
  redundantConstraintIds: string[];
  entityCount: number;
  estimatedDegreesOfFreedom: number;
  profileCandidateCount: number;
  profilePromotable: boolean;
  messages: string[];
};

const VALUE_TOLERANCE = 1e-6;

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

function pointRefValid(entity: SketchEntity | undefined, ref: SketchPointRef) {
  if (!entity || entity.id !== ref.entityId) return false;
  if (entity.kind === 'line') return ref.point === 'start' || ref.point === 'end';
  if (entity.kind === 'circle') return ref.point === 'center';
  return ref.point === 'start' || ref.point === 'end' || ref.point === 'center';
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

function near(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(VALUE_TOLERANCE, Math.max(Math.abs(a), Math.abs(b)) * VALUE_TOLERANCE);
}

function pointToken(ref: SketchPointRef) {
  return `${ref.entityId}:${ref.point}`;
}

function coincidentToken(first: SketchPointRef, second: SketchPointRef) {
  return [pointToken(first), pointToken(second)].sort().join('=');
}

function issue(
  code: SketchConstraintIssue['code'],
  constraintIds: string[],
  message: string,
): SketchConstraintIssue {
  return { code, constraintIds: [...new Set(constraintIds)].sort(), message };
}

/**
 * Analyze only the supported constraint vocabulary. This deliberately does not
 * pretend to be a nonlinear geometric solver; it detects contradictions and
 * redundancy that are provable from the current application-level contracts.
 */
export function analyzeSketchConstraintSet(
  entities: SketchEntity[],
  constraints: SketchConstraint[],
): SketchConstraintSetAnalysis {
  const byId = new Map(entities.map((entity) => [entity.id, entity] as const));
  const conflicts: SketchConstraintIssue[] = [];
  const redundant = new Set<string>();
  const invalid = new Set<string>();

  const baseKinds = new Map<'centered' | 'width' | 'depth', string[]>();
  const orientations = new Map<string, { horizontal: string[]; vertical: string[] }>();
  const dimensions = new Map<string, { kind: 'distance' | 'radius'; values: { id: string; value: number }[] }>();
  const coincidentSeen = new Map<string, string>();

  for (const constraint of constraints) {
    if (constraint.kind === 'centered' || constraint.kind === 'width' || constraint.kind === 'depth') {
      const ids = baseKinds.get(constraint.kind) ?? [];
      ids.push(constraint.id);
      baseKinds.set(constraint.kind, ids);
      continue;
    }

    if (constraint.kind === 'coincident') {
      const firstEntity = byId.get(constraint.first.entityId);
      const secondEntity = byId.get(constraint.second.entityId);
      if (!firstEntity || !secondEntity) {
        invalid.add(constraint.id);
        conflicts.push(issue(
          'missing-entity',
          [constraint.id],
          `Coincident constraint ${constraint.id} references a missing sketch entity.`,
        ));
        continue;
      }
      if (!pointRefValid(firstEntity, constraint.first) || !pointRefValid(secondEntity, constraint.second)) {
        invalid.add(constraint.id);
        conflicts.push(issue(
          'invalid-point',
          [constraint.id],
          `Coincident constraint ${constraint.id} uses a point that is not valid for its sketch entity type.`,
        ));
        continue;
      }
      const token = coincidentToken(constraint.first, constraint.second);
      const previous = coincidentSeen.get(token);
      if (previous) redundant.add(constraint.id);
      else coincidentSeen.set(token, constraint.id);
      continue;
    }

    const entity = byId.get(constraint.entityId);
    if (!entity) {
      invalid.add(constraint.id);
      conflicts.push(issue(
        'missing-entity',
        [constraint.id],
        `${constraint.kind} constraint ${constraint.id} references missing entity ${constraint.entityId}.`,
      ));
      continue;
    }

    if (constraint.kind === 'horizontal' || constraint.kind === 'vertical') {
      if (entity.kind !== 'line') {
        invalid.add(constraint.id);
        conflicts.push(issue(
          'invalid-target',
          [constraint.id],
          `${constraint.kind} constraint ${constraint.id} can target only a Line.`,
        ));
        continue;
      }
      const current = orientations.get(entity.id) ?? { horizontal: [], vertical: [] };
      current[constraint.kind].push(constraint.id);
      orientations.set(entity.id, current);
      continue;
    }

    if (constraint.kind === 'distance' && entity.kind !== 'line') {
      invalid.add(constraint.id);
      conflicts.push(issue(
        'invalid-target',
        [constraint.id],
        `Distance constraint ${constraint.id} can target only a Line.`,
      ));
      continue;
    }

    if (constraint.kind === 'radius' && entity.kind === 'line') {
      invalid.add(constraint.id);
      conflicts.push(issue(
        'invalid-target',
        [constraint.id],
        `Radius constraint ${constraint.id} can target only a Circle or Arc.`,
      ));
      continue;
    }

    const key = `${constraint.kind}:${entity.id}`;
    const group = dimensions.get(key) ?? { kind: constraint.kind, values: [] };
    group.values.push({ id: constraint.id, value: constraint.valueMm });
    dimensions.set(key, group);
  }

  for (const [kind, ids] of baseKinds) {
    if (ids.length <= 1) continue;
    for (const id of ids.slice(1)) redundant.add(id);
    conflicts.push(issue(
      'redundant-constraint',
      ids.slice(1),
      `Duplicate ${kind} base-profile constraint(s) are redundant.`,
    ));
  }

  for (const [entityId, value] of orientations) {
    for (const id of value.horizontal.slice(1)) redundant.add(id);
    for (const id of value.vertical.slice(1)) redundant.add(id);

    if (value.horizontal.length > 0 && value.vertical.length > 0) {
      const entity = byId.get(entityId);
      const distanceGroups = dimensions.get(`distance:${entityId}`);
      const positiveLength = distanceGroups?.values.some((entry) => entry.value > VALUE_TOLERANCE)
        || (entity?.kind === 'line' && distance2d(entity.start, entity.end) > VALUE_TOLERANCE);
      if (positiveLength) {
        const ids = [...value.horizontal, ...value.vertical];
        for (const id of ids) invalid.add(id);
        conflicts.push(issue(
          'conflicting-orientation',
          ids,
          `Line ${entityId} cannot remain positive-length while constrained both horizontal and vertical.`,
        ));
      }
    }
  }

  for (const [key, group] of dimensions) {
    if (group.values.length <= 1) continue;
    const first = group.values[0];
    const different = group.values.filter((entry) => !near(entry.value, first.value));
    if (different.length > 0) {
      const ids = group.values.map((entry) => entry.id);
      for (const id of ids) invalid.add(id);
      conflicts.push(issue(
        'conflicting-dimension',
        ids,
        `Conflicting ${group.kind} values target ${key.split(':').slice(1).join(':')}.`,
      ));
    } else {
      for (const entry of group.values.slice(1)) redundant.add(entry.id);
    }
  }

  for (const id of redundant) {
    if (invalid.has(id)) redundant.delete(id);
  }

  let independentDofReduction = 0;
  for (const constraint of constraints) {
    if (invalid.has(constraint.id) || redundant.has(constraint.id)) continue;
    if (constraint.kind === 'horizontal' || constraint.kind === 'vertical') independentDofReduction += 1;
    else if (constraint.kind === 'coincident') independentDofReduction += 2;
    else if (constraint.kind === 'distance' || constraint.kind === 'radius') independentDofReduction += 1;
  }

  return {
    conflicts: conflicts.filter((entry) => entry.code !== 'redundant-constraint'),
    redundantConstraintIds: [...redundant].sort(),
    independentDofReduction,
  };
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

function constrainedEntityDof(feature: SketchFeature, setAnalysis: SketchConstraintSetAnalysis) {
  const analysis = analyzeSketchEntities(feature.params.entities);
  return {
    ...analysis,
    estimatedDegreesOfFreedom: Math.max(0, analysis.estimatedDegreesOfFreedom - setAnalysis.independentDofReduction),
  };
}

function determineConstraintState(
  feature: SketchFeature,
  hasBaseIntent: boolean,
  estimatedDegreesOfFreedom: number,
  setAnalysis: SketchConstraintSetAnalysis,
): SketchConstraintState {
  if (setAnalysis.conflicts.length > 0) return 'inconsistent';

  const entityCount = feature.params.entities.length;
  if (feature.params.plane.kind === 'face' && entityCount === 0) return 'empty';

  if (!hasBaseIntent || estimatedDegreesOfFreedom > 0) return 'under-constrained';
  if (setAnalysis.redundantConstraintIds.length > 0) return 'over-constrained';
  return 'fully-constrained';
}

/** Deterministic sketch-state analyzer shared by editing and semantic rebuild. */
export function solveSketch(project: CadProject, feature: SketchFeature): SolvedSketch {
  const constraints = feature.params.constraints;
  const basePlane = feature.params.plane.kind === 'base-xz';
  const hasCentered = constraints.some((constraint) => constraint.kind === 'centered');
  const hasWidth = constraints.some((constraint) => constraint.kind === 'width');
  const hasDepth = constraints.some((constraint) => constraint.kind === 'depth');
  const setAnalysis = analyzeSketchConstraintSet(feature.params.entities, constraints);
  const entityAnalysis = constrainedEntityDof(feature, setAnalysis);
  const constrained = setAnalysis.conflicts.length > 0
    ? feature.params.entities.map(cloneEntity)
    : applySketchConstraints(feature.params.entities, constraints);
  const constructionEntities = constrained.filter((entity) => entity.construction);
  const regionAnalysis = analyzePromotableRegion(constructionEntities.length > 0 ? constructionEntities : constrained);
  const manufacturing = basePlane
    ? resolveManufacturingProfileWithRegions(constrained, project.dimensions.width, project.dimensions.depth)
    : null;
  const messages = [...entityAnalysis.issues];

  const hasBaseIntent = basePlane ? hasCentered && hasWidth && hasDepth : true;
  const constraintState = determineConstraintState(
    feature,
    hasBaseIntent,
    entityAnalysis.estimatedDegreesOfFreedom,
    setAnalysis,
  );

  if (basePlane && !hasCentered) messages.push('Sketch is missing the centered profile constraint.');
  if (basePlane && !hasWidth) messages.push('Sketch width is not tied to the named width parameter.');
  if (basePlane && !hasDepth) messages.push('Sketch depth is not tied to the named depth parameter.');

  for (const conflict of setAnalysis.conflicts) messages.push(`Constraint conflict: ${conflict.message}`);
  if (setAnalysis.redundantConstraintIds.length > 0) {
    messages.push(`${setAnalysis.redundantConstraintIds.length} redundant constraint(s) are present; they are preserved but do not receive independent DOF credit.`);
  }

  if (entityAnalysis.entityCount > 0 && entityAnalysis.estimatedDegreesOfFreedom > 0) {
    messages.push(`${entityAnalysis.estimatedDegreesOfFreedom} estimated sketch degree(s) of freedom remain.`);
  }

  if (setAnalysis.conflicts.length === 0) {
    for (let index = 0; index < constrained.length; index += 1) {
      const before = feature.params.entities[index];
      const after = constrained[index];
      if (before.kind === 'line' && after.kind === 'line' && distance2d(before.start, after.start) + distance2d(before.end, after.end) > 1e-5) {
        messages.push(`Line ${before.id} is geometry-constrained and is solved deterministically in the sketch workspace.`);
      }
    }
  }

  if (manufacturing?.promoted) {
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
    entities: constrained,
    width: Math.max(0.1, project.dimensions.width),
    depth: Math.max(0.1, project.dimensions.depth),
    centered: hasCentered,
    fullyConstrained: constraintState === 'fully-constrained',
    constraintState,
    conflicts: setAnalysis.conflicts,
    redundantConstraintIds: setAnalysis.redundantConstraintIds,
    entityCount: entityAnalysis.entityCount,
    estimatedDegreesOfFreedom: entityAnalysis.estimatedDegreesOfFreedom,
    profileCandidateCount: regionAnalysis.analysis.closedLoopCount,
    profilePromotable: regionAnalysis.promotable,
    messages,
  };
}
