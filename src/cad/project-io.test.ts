import { describe, expect, it } from 'vitest';
import { createDefaultProject, type LinearPatternFeature, type PadFeature, type ShellFeature, type SketchFeature } from './model';
import { parseProjectDocument, serializeProject } from './project-io';

function baseDocument() {
  return JSON.parse(serializeProject(createDefaultProject())) as {
    format: string;
    schemaVersion: number;
    savedAt: string;
    project: ReturnType<typeof createDefaultProject>;
  };
}

describe('project schema migration', () => {
  for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`loads schema v${version} into the current base-XZ sketch contract`, () => {
      const doc = baseDocument();
      doc.schemaVersion = version;
      const sketch = doc.project.features.find((feature) => feature.kind === 'sketch') as unknown as {
        params: { plane: unknown; entities?: unknown[] };
      };
      if (version <= 5) sketch.params.plane = 'XZ';
      if (version <= 4) delete sketch.params.entities;

      const parsed = parseProjectDocument(JSON.stringify(doc));
      const migratedSketch = parsed.project.features.find((feature): feature is SketchFeature => feature.kind === 'sketch')!;
      expect(parsed.sourceSchemaVersion).toBe(version);
      expect(parsed.schemaVersion).toBe(9);
      expect(parsed.migrated).toBe(true);
      expect(migratedSketch.params.plane).toEqual({ kind: 'base-xz' });
    });
  }

  it('round-trips schema v9', () => {
    const project = createDefaultProject();
    const parsed = parseProjectDocument(serializeProject(project));
    expect(parsed.schemaVersion).toBe(8);
    expect(parsed.sourceSchemaVersion).toBe(9);
    expect(parsed.migrated).toBe(false);
    expect(parsed.project.id).toBe(project.id);
  });

  it('round-trips schema v9 Shell intent with durable opening references', () => {
    const project = createDefaultProject();
    const shell: ShellFeature = {
      id: 'shell-1',
      kind: 'shell',
      name: 'Shell 1',
      enabled: true,
      params: {
        thicknessMm: 2,
        join: 'arc',
        openings: [{
          kind: 'face',
          lineageIds: ['extrude-1:top'],
          capturedAfterFeatureId: 'extrude-1',
          signature: { centroid: [0, 12, 0], normal: [0, 1, 0], areaMm2: 2400 },
        }],
      },
    };
    project.features.push(shell);
    const parsed = parseProjectDocument(serializeProject(project));
    const loaded = parsed.project.features.find((feature): feature is ShellFeature => feature.kind === 'shell');
    expect(loaded?.params.thicknessMm).toBe(2);
    expect(loaded?.params.openings[0]?.lineageIds).toEqual(['extrude-1:top']);
    expect(loaded?.params.join).toBe('arc');
  });

  it('rejects schema v8 Shell without an opening face', () => {
    const doc = baseDocument();
    doc.project.features.push({
      id: 'shell-invalid',
      kind: 'shell',
      name: 'Invalid Shell',
      enabled: true,
      params: { thicknessMm: 2, openings: [], join: 'arc' },
    } as unknown as ShellFeature);
    expect(() => parseProjectDocument(JSON.stringify(doc))).toThrow(/at least one face reference/i);
  });

  it('round-trips schema v9 Linear Pattern without copying its source feature', () => {
    const project = createDefaultProject();
    const source = {
      id: 'hole-source',
      kind: 'hole',
      name: 'Hole Source',
      enabled: true,
      params: { diameter: 4, x: -10, z: 0, through: true, placement: { mode: 'global-xz' } },
    } as const;
    const pattern: LinearPatternFeature = {
      id: 'pattern-1',
      kind: 'linear-pattern',
      name: 'Linear Pattern 1',
      enabled: true,
      params: { sourceFeatureId: source.id, count: 4, spacingMm: 8, axis: 'x' },
    };
    project.features.push(source, pattern);
    const parsed = parseProjectDocument(serializeProject(project));
    const loaded = parsed.project.features.find((feature): feature is LinearPatternFeature => feature.kind === 'linear-pattern');
    expect(loaded?.params).toEqual(pattern.params);
    expect(parsed.project.features.filter((feature) => feature.kind === 'hole')).toHaveLength(1);
  });

  it('rejects Linear Pattern with a missing or incompatible source', () => {
    const doc = baseDocument();
    doc.schemaVersion = 9;
    doc.project.features.push({
      id: 'pattern-invalid',
      kind: 'linear-pattern',
      name: 'Invalid Pattern',
      enabled: true,
      params: { sourceFeatureId: 'missing-hole', count: 3, spacingMm: 8, axis: 'x' },
    } as unknown as LinearPatternFeature);
    expect(() => parseProjectDocument(JSON.stringify(doc))).toThrow(/earlier Hole or Cut/i);
  });

  it('rejects Pad when its source sketch is missing or later', () => {
    const doc = baseDocument();
    const pad: PadFeature = {
      id: 'pad-invalid',
      kind: 'pad',
      name: 'Invalid Pad',
      enabled: true,
      params: { sketchId: 'missing-sketch', distanceMm: 5, direction: 'normal' },
    };
    doc.project.features.push(pad);
    expect(() => parseProjectDocument(JSON.stringify(doc))).toThrow(/missing or later sketch/i);
  });

  it('rejects future unknown project schemas', () => {
    const doc = baseDocument();
    doc.schemaVersion = 999;
    expect(() => parseProjectDocument(JSON.stringify(doc))).toThrow(/Unsupported project schema version/);
  });
});
