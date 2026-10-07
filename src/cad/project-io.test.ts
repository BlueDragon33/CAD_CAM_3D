import { describe, expect, it } from 'vitest';
import { createDefaultProject, type DatumAxisFeature, type HoleFeature, type LinearPatternFeature, type MirrorFeature, type PadFeature, type RevolveFeature, type ShellFeature, type SketchFeature } from './model';
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
  for (const version of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
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
      expect(parsed.schemaVersion).toBe(12);
      expect(parsed.migrated).toBe(true);
      expect(migratedSketch.params.plane).toEqual({ kind: 'base-xz' });
    });
  }

  it('round-trips schema v12', () => {
    const project = createDefaultProject();
    const parsed = parseProjectDocument(serializeProject(project));
    expect(parsed.schemaVersion).toBe(12);
    expect(parsed.sourceSchemaVersion).toBe(12);
    expect(parsed.migrated).toBe(false);
    expect(parsed.project.id).toBe(project.id);
  });

  it('round-trips schema v12 Shell intent with durable opening references', () => {
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

  it('round-trips schema v12 Datum Axis with durable source semantics', () => {
    const project = createDefaultProject();
    const sketch = project.features.find((feature): feature is SketchFeature => feature.kind === 'sketch')!;
    const datum: DatumAxisFeature = {
      id: 'datum-axis-1',
      kind: 'datum-axis',
      name: 'Datum Axis 1',
      enabled: true,
      params: { source: { kind: 'base-xz', sketchId: sketch.id, axis: 'x', offsetMm: 3 } },
    };
    project.features.push(datum);
    const parsed = parseProjectDocument(serializeProject(project));
    const loaded = parsed.project.features.find((feature): feature is DatumAxisFeature => feature.kind === 'datum-axis');
    expect(loaded?.params).toEqual(datum.params);
  });

  it('rejects Datum Axis when its source Sketch is missing', () => {
    const doc = baseDocument();
    doc.project.features.push({
      id: 'datum-invalid',
      kind: 'datum-axis',
      name: 'Invalid Datum',
      enabled: true,
      params: { source: { kind: 'base-xz', sketchId: 'missing-sketch', axis: 'x', offsetMm: 0 } },
    } as DatumAxisFeature);
    expect(() => parseProjectDocument(JSON.stringify(doc))).toThrow(/earlier Sketch/i);
  });

  it('round-trips schema v12 Revolve with one attached Sketch and local Datum Axis', () => {
    const project = createDefaultProject();
    const baseExtrude = project.features.find((feature) => feature.kind === 'extrude')!;
    const attached: SketchFeature = {
      id: 'sketch-revolve',
      kind: 'sketch',
      name: 'Sketch Revolve',
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
          { id: 'r1', kind: 'line', construction: false, start: { x: 8, z: 0 }, end: { x: 12, z: 0 } },
          { id: 'r2', kind: 'line', construction: false, start: { x: 12, z: 0 }, end: { x: 12, z: 4 } },
          { id: 'r3', kind: 'line', construction: false, start: { x: 12, z: 4 }, end: { x: 8, z: 4 } },
          { id: 'r4', kind: 'line', construction: false, start: { x: 8, z: 4 }, end: { x: 8, z: 0 } },
        ],
        constraints: [],
      },
    };
    const axis: DatumAxisFeature = {
      id: 'axis-revolve',
      kind: 'datum-axis',
      name: 'Axis Revolve',
      enabled: true,
      params: { source: { kind: 'sketch-local', sketchId: attached.id, axis: 'u', offsetMm: 0 } },
    };
    const revolve: RevolveFeature = {
      id: 'revolve-1',
      kind: 'revolve',
      name: 'Revolve 1',
      enabled: true,
      params: { sketchId: attached.id, axisId: axis.id, angleDeg: 270, operation: 'add' },
    };
    project.features.push(attached, axis, revolve);
    const parsed = parseProjectDocument(serializeProject(project));
    const loaded = parsed.project.features.find((feature): feature is RevolveFeature => feature.kind === 'revolve');
    expect(loaded?.params).toEqual(revolve.params);
  });

  it('rejects Revolve when Datum Axis is missing or incompatible', () => {
    const project = createDefaultProject();
    const baseExtrude = project.features.find((feature) => feature.kind === 'extrude')!;
    const attached: SketchFeature = {
      id: 'sketch-revolve-invalid',
      kind: 'sketch',
      name: 'Sketch Revolve Invalid',
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
        entities: [],
        constraints: [],
      },
    };
    project.features.push(attached, {
      id: 'revolve-invalid',
      kind: 'revolve',
      name: 'Invalid Revolve',
      enabled: true,
      params: { sketchId: attached.id, axisId: 'missing-axis', angleDeg: 360, operation: 'add' },
    } as RevolveFeature);
    expect(() => parseProjectDocument(serializeProject(project))).toThrow(/Datum Axis/i);
  });

  it('round-trips schema v12 Linear Pattern without copying its source feature', () => {
    const project = createDefaultProject();
    const source: HoleFeature = {
      id: 'hole-source',
      kind: 'hole',
      name: 'Hole Source',
      enabled: true,
      params: { diameter: 4, x: -10, z: 0, through: true, placement: { mode: 'global-xz' } },
    };
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

  it('round-trips schema v12 Mirror with an explicit symmetry plane', () => {
    const project = createDefaultProject();
    const source: HoleFeature = {
      id: 'mirror-hole',
      kind: 'hole',
      name: 'Mirror Hole',
      enabled: true,
      params: { diameter: 4, x: -10, z: 0, through: true, placement: { mode: 'global-xz' } },
    };
    const mirror: MirrorFeature = {
      id: 'mirror-1',
      kind: 'mirror',
      name: 'Mirror 1',
      enabled: true,
      params: {
        sourceFeatureId: source.id,
        plane: { kind: 'global', axis: 'x', offsetMm: 0 },
      },
    };
    project.features.push(source, mirror);
    const parsed = parseProjectDocument(serializeProject(project));
    const loaded = parsed.project.features.find((feature): feature is MirrorFeature => feature.kind === 'mirror');
    expect(loaded?.params).toEqual(mirror.params);
    expect(parsed.project.features.filter((feature) => feature.kind === 'hole')).toHaveLength(1);
  });

  it('rejects Mirror when its plane family does not match source placement', () => {
    const doc = baseDocument();
    const source: HoleFeature = {
      id: 'global-hole',
      kind: 'hole',
      name: 'Global Hole',
      enabled: true,
      params: { diameter: 4, x: -10, z: 0, through: true, placement: { mode: 'global-xz' } },
    };
    doc.project.features.push(source, {
      id: 'mirror-invalid',
      kind: 'mirror',
      name: 'Invalid Mirror',
      enabled: true,
      params: { sourceFeatureId: source.id, plane: { kind: 'face-local', axis: 'u', offsetMm: 0 } },
    } as MirrorFeature);
    expect(() => parseProjectDocument(JSON.stringify(doc))).toThrow(/global mirror plane/i);
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
