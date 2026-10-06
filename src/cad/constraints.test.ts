import { describe, expect, it } from 'vitest';
import { analyzeSketchConstraintSet, solveSketch } from './constraints';
import { createDefaultProject, type SketchConstraint, type SketchFeature } from './model';
import type { SketchEntity } from './sketch';

const line: SketchEntity = {
  id: 'line-1',
  kind: 'line',
  construction: true,
  start: { x: 0, z: 0 },
  end: { x: 10, z: 4 },
};

const circle: SketchEntity = {
  id: 'circle-1',
  kind: 'circle',
  construction: true,
  center: { x: 0, z: 0 },
  radiusMm: 5,
};

function attachedSketch(entities: SketchEntity[], constraints: SketchConstraint[] = []): SketchFeature {
  return {
    id: 'attached-sketch',
    kind: 'sketch',
    name: 'Attached Sketch',
    enabled: true,
    params: {
      plane: {
        kind: 'face',
        ref: {
          kind: 'face',
          lineageIds: ['extrude-1:top'],
          capturedAfterFeatureId: 'extrude-1',
          signature: { centroid: [0, 10, 0], normal: [0, 1, 0], areaMm2: 1200 },
        },
        originUMm: 0,
        originVMm: 0,
      },
      profile: 'rectangle',
      entities,
      constraints,
    },
  };
}

describe('sketch constraint consistency', () => {
  it('detects conflicting line distances', () => {
    const analysis = analyzeSketchConstraintSet([line], [
      { id: 'd1', kind: 'distance', entityId: line.id, valueMm: 10 },
      { id: 'd2', kind: 'distance', entityId: line.id, valueMm: 12 },
    ]);
    expect(analysis.conflicts.map((entry) => entry.code)).toContain('conflicting-dimension');
    expect(analysis.redundantConstraintIds).toEqual([]);
  });

  it('detects conflicting radii', () => {
    const analysis = analyzeSketchConstraintSet([circle], [
      { id: 'r1', kind: 'radius', entityId: circle.id, valueMm: 5 },
      { id: 'r2', kind: 'radius', entityId: circle.id, valueMm: 6 },
    ]);
    expect(analysis.conflicts[0]?.code).toBe('conflicting-dimension');
  });

  it('rejects horizontal plus vertical on a positive-length line', () => {
    const analysis = analyzeSketchConstraintSet([line], [
      { id: 'h', kind: 'horizontal', entityId: line.id },
      { id: 'v', kind: 'vertical', entityId: line.id },
    ]);
    expect(analysis.conflicts[0]?.code).toBe('conflicting-orientation');
  });

  it('detects dangling and incompatible targets', () => {
    const missing = analyzeSketchConstraintSet([line], [
      { id: 'missing', kind: 'distance', entityId: 'not-there', valueMm: 4 },
    ]);
    expect(missing.conflicts[0]?.code).toBe('missing-entity');

    const incompatible = analyzeSketchConstraintSet([line], [
      { id: 'bad-radius', kind: 'radius', entityId: line.id, valueMm: 4 },
    ]);
    expect(incompatible.conflicts[0]?.code).toBe('invalid-target');
  });

  it('marks equal duplicate dimensions and reversed coincidence as redundant', () => {
    const analysis = analyzeSketchConstraintSet([line, circle], [
      { id: 'd1', kind: 'distance', entityId: line.id, valueMm: 10 },
      { id: 'd2', kind: 'distance', entityId: line.id, valueMm: 10 },
      {
        id: 'c1',
        kind: 'coincident',
        first: { entityId: line.id, point: 'start' },
        second: { entityId: circle.id, point: 'center' },
      },
      {
        id: 'c2',
        kind: 'coincident',
        first: { entityId: circle.id, point: 'center' },
        second: { entityId: line.id, point: 'start' },
      },
    ]);
    expect(analysis.conflicts).toEqual([]);
    expect(analysis.redundantConstraintIds).toEqual(['c2', 'd2']);
  });
});

describe('sketch constraint state', () => {
  it('keeps the named base rectangle fully constrained', () => {
    const project = createDefaultProject();
    const sketch = project.features.find((feature): feature is SketchFeature => feature.kind === 'sketch');
    expect(sketch).toBeTruthy();
    expect(solveSketch(project, sketch!).constraintState).toBe('fully-constrained');
  });

  it('reports an empty attached sketch', () => {
    const project = createDefaultProject();
    expect(solveSketch(project, attachedSketch([])).constraintState).toBe('empty');
  });

  it('reports a free attached line as under-constrained', () => {
    const project = createDefaultProject();
    const solved = solveSketch(project, attachedSketch([line]));
    expect(solved.constraintState).toBe('under-constrained');
    expect(solved.estimatedDegreesOfFreedom).toBeGreaterThan(0);
  });

  it('reports contradictory attached intent as inconsistent and preserves raw geometry', () => {
    const project = createDefaultProject();
    const sketch = attachedSketch([line], [
      { id: 'd1', kind: 'distance', entityId: line.id, valueMm: 10 },
      { id: 'd2', kind: 'distance', entityId: line.id, valueMm: 20 },
    ]);
    const solved = solveSketch(project, sketch);
    expect(solved.constraintState).toBe('inconsistent');
    expect(solved.entities[0]).toEqual(line);
  });

  it('reports duplicate base intent as over-constrained', () => {
    const project = createDefaultProject();
    const sketch = project.features.find((feature): feature is SketchFeature => feature.kind === 'sketch')!;
    const duplicate: SketchFeature = {
      ...sketch,
      params: {
        ...sketch.params,
        constraints: [...sketch.params.constraints, { id: 'centered-duplicate', kind: 'centered' }],
      },
    };
    expect(solveSketch(project, duplicate).constraintState).toBe('over-constrained');
  });
});
