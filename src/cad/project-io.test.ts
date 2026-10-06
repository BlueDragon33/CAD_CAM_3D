import { describe, expect, it } from 'vitest';
import { createDefaultProject, type PadFeature, type SketchFeature } from './model';
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
  for (const version of [1, 2, 3, 4, 5, 6]) {
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
      expect(parsed.schemaVersion).toBe(7);
      expect(parsed.migrated).toBe(true);
      expect(migratedSketch.params.plane).toEqual({ kind: 'base-xz' });
    });
  }

  it('round-trips schema v7', () => {
    const project = createDefaultProject();
    const parsed = parseProjectDocument(serializeProject(project));
    expect(parsed.schemaVersion).toBe(7);
    expect(parsed.sourceSchemaVersion).toBe(7);
    expect(parsed.migrated).toBe(false);
    expect(parsed.project.id).toBe(project.id);
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
