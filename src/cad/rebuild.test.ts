import { describe, expect, it } from 'vitest';
import {
  createDefaultProject,
  type DatumAxisFeature,
  type HoleFeature,
  type LinearPatternFeature,
  type MirrorFeature,
  type RevolveFeature,
  type SketchFeature,
} from './model';
import { rebuildProject } from './rebuild';

function globalHole(id = 'hole-source'): HoleFeature {
  return {
    id,
    kind: 'hole',
    name: 'Hole Source',
    enabled: true,
    params: {
      diameter: 4,
      x: -10,
      z: 0,
      through: true,
      placement: { mode: 'global-xz' },
    },
  };
}

describe('semantic Datum Axis', () => {
  it('accepts a durable base-XZ axis without scheduling a solid operation', () => {
    const project = createDefaultProject();
    const sketch = project.features.find((feature) => feature.kind === 'sketch')!;
    const datum: DatumAxisFeature = {
      id: 'datum-x',
      kind: 'datum-axis',
      name: 'Datum Axis 1',
      enabled: true,
      params: { source: { kind: 'base-xz', sketchId: sketch.id, axis: 'x', offsetMm: 2 } },
    };
    project.features.splice(1, 0, datum);
    const rebuilt = rebuildProject(project);
    expect(rebuilt.hasSolid).toBe(true);
    expect(rebuilt.operationSequence).toHaveLength(0);
    expect(rebuilt.diagnostics.some((item) => item.featureId === datum.id && item.level === 'info')).toBe(true);
  });

  it('rejects a local axis bound to a base-XZ Sketch', () => {
    const project = createDefaultProject();
    const sketch = project.features.find((feature) => feature.kind === 'sketch')!;
    const datum: DatumAxisFeature = {
      id: 'datum-invalid',
      kind: 'datum-axis',
      name: 'Invalid Datum',
      enabled: true,
      params: { source: { kind: 'sketch-local', sketchId: sketch.id, axis: 'u', offsetMm: 0 } },
    };
    project.features.splice(1, 0, datum);
    const rebuilt = rebuildProject(project);
    expect(rebuilt.diagnostics.some((item) => item.featureId === datum.id && item.level === 'error')).toBe(true);
  });
});


describe('semantic Revolve', () => {
  function addAttachedRevolveFixture(axisOffsetMm = 0) {
    const project = createDefaultProject();
    const baseExtrude = project.features.find((feature) => feature.kind === 'extrude')!;
    const attached: SketchFeature = {
      id: 'revolve-sketch',
      kind: 'sketch',
      name: 'Revolve Sketch',
      enabled: true,
      params: {
        plane: {
          kind: 'face',
          ref: {
            kind: 'face',
            lineageIds: [`${baseExtrude.id}:top`],
            capturedAfterFeatureId: baseExtrude.id,
            signature: { centroid: [0, 12, 0], normal: [0, 1, 0], areaMm2: 2400 },
          },
          originUMm: 0,
          originVMm: 0,
        },
        profile: 'rectangle',
        entities: [
          { id: 'rv-1', kind: 'line', construction: false, start: { x: 8, z: 2 }, end: { x: 12, z: 2 } },
          { id: 'rv-2', kind: 'line', construction: false, start: { x: 12, z: 2 }, end: { x: 12, z: 6 } },
          { id: 'rv-3', kind: 'line', construction: false, start: { x: 12, z: 6 }, end: { x: 8, z: 6 } },
          { id: 'rv-4', kind: 'line', construction: false, start: { x: 8, z: 6 }, end: { x: 8, z: 2 } },
        ],
        constraints: [],
      },
    };
    const axis: DatumAxisFeature = {
      id: 'revolve-axis',
      kind: 'datum-axis',
      name: 'Revolve Axis',
      enabled: true,
      params: { source: { kind: 'sketch-local', sketchId: attached.id, axis: 'u', offsetMm: axisOffsetMm } },
    };
    const revolve: RevolveFeature = {
      id: 'revolve-feature',
      kind: 'revolve',
      name: 'Revolve 1',
      enabled: true,
      params: { sketchId: attached.id, axisId: axis.id, angleDeg: 360, operation: 'add' },
    };
    project.features.push(attached, axis, revolve);
    return { project, revolve };
  }

  it('schedules an exact Revolve from an attached Sketch and same-sketch local Datum Axis', () => {
    const { project, revolve } = addAttachedRevolveFixture(0);
    const rebuilt = rebuildProject(project);
    expect(rebuilt.operationSequence.at(-1)?.kind).toBe('revolve');
    expect(rebuilt.diagnostics.some((item) => item.level === 'error' && item.featureId === revolve.id)).toBe(false);
  });

  it('blocks Revolve when the Datum Axis crosses the promoted profile interior', () => {
    const { project, revolve } = addAttachedRevolveFixture(4);
    const rebuilt = rebuildProject(project);
    expect(rebuilt.operationSequence.some((feature) => feature.kind === 'revolve')).toBe(false);
    expect(rebuilt.diagnostics.some((item) => item.level === 'error' && item.featureId === revolve.id && /crosses/i.test(item.message))).toBe(true);
  });
});

describe('semantic rebuild Linear Pattern', () => {
  it('keeps one canonical source and schedules a global pattern after it', () => {
    const project = createDefaultProject();
    const source = globalHole();
    const pattern: LinearPatternFeature = {
      id: 'pattern-1',
      kind: 'linear-pattern',
      name: 'Linear Pattern 1',
      enabled: true,
      params: { sourceFeatureId: source.id, count: 4, spacingMm: 8, axis: 'x' },
    };
    project.features.push(source, pattern);

    const rebuilt = rebuildProject(project);
    expect(rebuilt.hasSolid).toBe(true);
    expect(rebuilt.holes).toHaveLength(1);
    expect(rebuilt.operationSequence.map((feature) => feature.kind)).toEqual(['hole', 'linear-pattern']);
    expect(rebuilt.diagnostics.some((item) => item.level === 'error' && item.featureId === pattern.id)).toBe(false);
  });

  it('rejects a local axis for a global source without mutating the solid history', () => {
    const project = createDefaultProject();
    const source = globalHole();
    const pattern: LinearPatternFeature = {
      id: 'pattern-invalid-axis',
      kind: 'linear-pattern',
      name: 'Invalid Pattern',
      enabled: true,
      params: { sourceFeatureId: source.id, count: 3, spacingMm: 8, axis: 'u' },
    };
    project.features.push(source, pattern);

    const rebuilt = rebuildProject(project);
    expect(rebuilt.operationSequence.map((feature) => feature.kind)).toEqual(['hole']);
    expect(rebuilt.diagnostics.some((item) => item.level === 'error' && item.featureId === pattern.id)).toBe(true);
  });

  it('accepts local U/V for a face-bound source', () => {
    const project = createDefaultProject();
    const source: HoleFeature = {
      ...globalHole(),
      id: 'face-hole',
      params: {
        diameter: 4,
        x: 0,
        z: 0,
        through: true,
        placement: {
          mode: 'face',
          ref: {
            kind: 'face',
            lineageIds: ['extrude-1:top'],
            capturedAfterFeatureId: project.features[1].id,
            signature: { centroid: [0, 12, 0], normal: [0, 1, 0], areaMm2: 2400 },
          },
          uMm: -10,
          vMm: 0,
        },
      },
    };
    const pattern: LinearPatternFeature = {
      id: 'face-pattern',
      kind: 'linear-pattern',
      name: 'Face Pattern',
      enabled: true,
      params: { sourceFeatureId: source.id, count: 3, spacingMm: 8, axis: 'u' },
    };
    project.features.push(source, pattern);

    const rebuilt = rebuildProject(project);
    expect(rebuilt.operationSequence.at(-1)?.kind).toBe('linear-pattern');
    expect(rebuilt.diagnostics.some((item) => item.level === 'error' && item.featureId === pattern.id)).toBe(false);
  });  it('accepts a global Mirror only when the source placement uses global coordinates', () => {
    const project = createDefaultProject();
    const source = globalHole();
    const mirror: MirrorFeature = {
      id: 'mirror-1',
      kind: 'mirror',
      name: 'Mirror 1',
      enabled: true,
      params: { sourceFeatureId: source.id, plane: { kind: 'global', axis: 'x', offsetMm: 0 } },
    };
    project.features.push(source, mirror);

    const rebuilt = rebuildProject(project);
    expect(rebuilt.operationSequence.map((feature) => feature.kind)).toEqual(['hole', 'mirror']);
    expect(rebuilt.diagnostics.some((item) => item.level === 'error' && item.featureId === mirror.id)).toBe(false);
  });

  it('rejects face-local Mirror plane for a global source', () => {
    const project = createDefaultProject();
    const source = globalHole();
    const mirror: MirrorFeature = {
      id: 'mirror-invalid',
      kind: 'mirror',
      name: 'Invalid Mirror',
      enabled: true,
      params: { sourceFeatureId: source.id, plane: { kind: 'face-local', axis: 'u', offsetMm: 0 } },
    };
    project.features.push(source, mirror);

    const rebuilt = rebuildProject(project);
    expect(rebuilt.operationSequence.map((feature) => feature.kind)).toEqual(['hole']);
    expect(rebuilt.diagnostics.some((item) => item.level === 'error' && item.featureId === mirror.id)).toBe(true);
  });


});
