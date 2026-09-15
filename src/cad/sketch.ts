export type SketchPoint2D = { x: number; z: number };

export type SketchEntityBase = {
  id: string;
  construction: boolean;
};

export type SketchLineEntity = SketchEntityBase & {
  kind: 'line';
  start: SketchPoint2D;
  end: SketchPoint2D;
};

export type SketchCircleEntity = SketchEntityBase & {
  kind: 'circle';
  center: SketchPoint2D;
  radiusMm: number;
};

export type SketchArcEntity = SketchEntityBase & {
  kind: 'arc';
  center: SketchPoint2D;
  radiusMm: number;
  startAngleDeg: number;
  endAngleDeg: number;
};

export type SketchEntity = SketchLineEntity | SketchCircleEntity | SketchArcEntity;

export type SketchAnchorRef = {
  entityId: string;
  point: 'start' | 'end' | 'center';
};

export type SketchAnchor = {
  point: SketchPoint2D;
  ref?: SketchAnchorRef;
  source: 'profile' | 'entity';
};

export type SketchSnapKind = 'none' | 'grid' | 'anchor';

export type SketchSnapResult = {
  point: SketchPoint2D;
  kind: SketchSnapKind;
  anchor?: SketchAnchor;
  distanceMm: number;
};

export type SketchEntityAnalysis = {
  entityCount: number;
  lineCount: number;
  circleCount: number;
  arcCount: number;
  estimatedDegreesOfFreedom: number;
  issues: string[];
};

export function distance2d(a: SketchPoint2D, b: SketchPoint2D) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function normalizeAngleDeg(value: number) {
  let result = value % 360;
  if (result < 0) result += 360;
  return result;
}

/** Positive design sweep used by persisted Arc entities. Full circles use Circle entities. */
export function positiveArcSweepDeg(startAngleDeg: number, endAngleDeg: number) {
  const start = normalizeAngleDeg(startAngleDeg);
  const end = normalizeAngleDeg(endAngleDeg);
  let sweep = end - start;
  if (sweep < 0) sweep += 360;
  return sweep;
}

export function arcPointAtAngle(entity: SketchArcEntity, angleDeg: number): SketchPoint2D {
  const angle = angleDeg * Math.PI / 180;
  return {
    x: entity.center.x + Math.cos(angle) * entity.radiusMm,
    z: entity.center.z + Math.sin(angle) * entity.radiusMm,
  };
}

export function arcEndpoint(entity: SketchArcEntity, point: 'start' | 'end'): SketchPoint2D {
  return arcPointAtAngle(entity, point === 'start' ? entity.startAngleDeg : entity.endAngleDeg);
}

export function createLineEntity(start: SketchPoint2D, end: SketchPoint2D, construction = true): SketchLineEntity {
  return { id: crypto.randomUUID(), kind: 'line', construction, start: { ...start }, end: { ...end } };
}

export function createCircleEntity(center: SketchPoint2D, radiusMm: number, construction = true): SketchCircleEntity {
  return { id: crypto.randomUUID(), kind: 'circle', construction, center: { ...center }, radiusMm: Math.max(0.1, radiusMm) };
}

export function createArcEntity(
  center: SketchPoint2D,
  radiusMm: number,
  startAngleDeg: number,
  endAngleDeg: number,
  construction = true,
): SketchArcEntity {
  return {
    id: crypto.randomUUID(),
    kind: 'arc',
    construction,
    center: { ...center },
    radiusMm: Math.max(0.1, radiusMm),
    startAngleDeg,
    endAngleDeg,
  };
}

export function entityAnchors(entity: SketchEntity): SketchAnchor[] {
  if (entity.kind === 'line') {
    return [
      { point: { ...entity.start }, ref: { entityId: entity.id, point: 'start' }, source: 'entity' },
      { point: { ...entity.end }, ref: { entityId: entity.id, point: 'end' }, source: 'entity' },
    ];
  }
  if (entity.kind === 'arc') {
    return [
      { point: { ...entity.center }, ref: { entityId: entity.id, point: 'center' }, source: 'entity' },
      { point: arcEndpoint(entity, 'start'), ref: { entityId: entity.id, point: 'start' }, source: 'entity' },
      { point: arcEndpoint(entity, 'end'), ref: { entityId: entity.id, point: 'end' }, source: 'entity' },
    ];
  }
  return [{ point: { ...entity.center }, ref: { entityId: entity.id, point: 'center' }, source: 'entity' }];
}

export function rectangleProfileAnchors(width: number, depth: number): SketchAnchor[] {
  const hw = Math.max(0.1, width) / 2;
  const hd = Math.max(0.1, depth) / 2;
  return [
    { point: { x: -hw, z: -hd }, source: 'profile' },
    { point: { x: hw, z: -hd }, source: 'profile' },
    { point: { x: hw, z: hd }, source: 'profile' },
    { point: { x: -hw, z: hd }, source: 'profile' },
    { point: { x: 0, z: 0 }, source: 'profile' },
  ];
}

export function snapSketchPoint(
  raw: SketchPoint2D,
  entities: SketchEntity[],
  extraAnchors: SketchAnchor[] = [],
  options: { gridMm?: number; toleranceMm?: number } = {},
): SketchSnapResult {
  const gridMm = Math.max(0.1, options.gridMm ?? 1);
  const toleranceMm = Math.max(0.05, options.toleranceMm ?? 1.25);
  const anchors = [...extraAnchors, ...entities.flatMap(entityAnchors)];

  let closest: SketchAnchor | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const current = distance2d(raw, anchor.point);
    if (current < closestDistance) {
      closest = anchor;
      closestDistance = current;
    }
  }
  if (closest && closestDistance <= toleranceMm) {
    return { point: { ...closest.point }, kind: 'anchor', anchor: closest, distanceMm: closestDistance };
  }

  const gridPoint = {
    x: Math.round(raw.x / gridMm) * gridMm,
    z: Math.round(raw.z / gridMm) * gridMm,
  };
  return { point: gridPoint, kind: 'grid', distanceMm: distance2d(raw, gridPoint) };
}

export function orthogonalizeLineEnd(start: SketchPoint2D, rawEnd: SketchPoint2D, toleranceMm = 1) {
  const dx = rawEnd.x - start.x;
  const dz = rawEnd.z - start.z;
  if (Math.abs(dz) <= toleranceMm && Math.abs(dx) > 1e-9) {
    return { point: { x: rawEnd.x, z: start.z }, constraint: 'horizontal' as const };
  }
  if (Math.abs(dx) <= toleranceMm && Math.abs(dz) > 1e-9) {
    return { point: { x: start.x, z: rawEnd.z }, constraint: 'vertical' as const };
  }
  return { point: { ...rawEnd }, constraint: null };
}

export function analyzeSketchEntities(entities: SketchEntity[]): SketchEntityAnalysis {
  let lineCount = 0;
  let circleCount = 0;
  let arcCount = 0;
  let estimatedDegreesOfFreedom = 0;
  const issues: string[] = [];

  for (const entity of entities) {
    if (entity.kind === 'line') {
      lineCount += 1;
      estimatedDegreesOfFreedom += 4;
      if (distance2d(entity.start, entity.end) <= 1e-6) issues.push(`Line ${entity.id} has zero length.`);
      continue;
    }
    if (entity.kind === 'circle') {
      circleCount += 1;
      estimatedDegreesOfFreedom += 3;
      if (!Number.isFinite(entity.radiusMm) || entity.radiusMm <= 0) issues.push(`Circle ${entity.id} has invalid radius.`);
      continue;
    }
    arcCount += 1;
    estimatedDegreesOfFreedom += 5;
    if (!Number.isFinite(entity.radiusMm) || entity.radiusMm <= 0) issues.push(`Arc ${entity.id} has invalid radius.`);
    if (!Number.isFinite(entity.startAngleDeg) || !Number.isFinite(entity.endAngleDeg)) issues.push(`Arc ${entity.id} has invalid angles.`);
    if (positiveArcSweepDeg(entity.startAngleDeg, entity.endAngleDeg) <= 1e-6) issues.push(`Arc ${entity.id} has a zero sweep; use Circle for a full loop.`);
  }

  return {
    entityCount: entities.length,
    lineCount,
    circleCount,
    arcCount,
    estimatedDegreesOfFreedom,
    issues,
  };
}
