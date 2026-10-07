import { describe, expect, it } from 'vitest';
import { createDefaultProject, type PadFeature, type ShellFeature, type SketchFeature } from './model';
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
  for (const version of [1, 2, 3, 4, 5, 6, 7]) {
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
      expect(parsed.schemaVersion).toBe(8);
      expect(parsed.migrated).toBe(true);
      expect(migratedSketch.params.plane).toEqual({ kind: 'base-xz' });
    });
  }

  it('round-trips schema v8', () => {
    const project = createDefaultProject();
    const parsed = parseProjectDocument(serializeProject(project));
    expect(parsed.schemaVersion).toBe(8);
    expect(parsed.sourceSchemaVersion).toBe(8);
    expect(parsed.migrated).toBe(false);
    expect(parsed.project.id).toBe(project.id);
  });

  it('round-trips schema v8 Shell intent with durable opening references', () => {
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
