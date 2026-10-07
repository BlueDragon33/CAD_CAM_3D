import { describe, expect, it } from 'vitest';
import {
  createDefaultProject,
  type HoleFeature,
  type LinearPatternFeature,
  type MirrorFeature,
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
