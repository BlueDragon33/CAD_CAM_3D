import { describe, expect, it } from 'vitest';
import { createDefaultProject, createFeature, type CadProject, type FaceTopologyRef } from '../cad/model';
import { rebuildProject } from '../cad/rebuild';
import { evaluateManufacturingReadiness } from './readiness';

describe('manufacturing readiness foundation', () => {
  it('uses final dimensions to detect selected-printer build-volume overflow without blocking file export', () => {
    const project = createDefaultProject();
    project.dimensions.width = 300;
    const rebuilt = rebuildProject(project);
    const report = evaluateManufacturingReadiness(
      project,
      rebuilt,
      { width: 300, depth: 40, height: 12 },
      'mesh-mvp-v1',
      false,
    );

    const finding = report.findings.find((entry) => entry.id === 'build-volume:exceeded');
    expect(finding?.level).toBe('blocker');
    expect(finding?.blocksExport).toBe(false);
    expect(report.exportBlocked).toBe(false);
    expect(report.selectedPrinterReady).toBe(false);
  });

  it('warns when a through hole is below two nozzle diameters', () => {
    const project = createDefaultProject();
    const hole = createFeature('hole', project);
    if (hole.kind !== 'hole') throw new Error('Expected Hole feature.');
    hole.params.diameter = 0.6;
    project.features.push(hole);
    const rebuilt = rebuildProject(project);
    const report = evaluateManufacturingReadiness(
      project,
      rebuilt,
      { width: 60, depth: 40, height: 12 },
      'mesh-mvp-v1',
      false,
    );

    expect(report.findings.some((entry) => entry.id === 'feature-size:hole:' + hole.id && entry.level === 'warning')).toBe(true);
  });

  it('marks thin Shell walls as a heuristic warning rather than an export blocker', () => {
    const baseProject = createDefaultProject();
    const rebuilt = rebuildProject(baseProject);
    const project: CadProject = structuredClone(baseProject);
    const opening: FaceTopologyRef = {
      kind: 'face',
      lineageIds: ['base-extrude:top'],
      capturedAfterFeatureId: project.features[1]?.id ?? null,
      signature: {
        centroid: [0, 12, 0],
        normal: [0, 1, 0],
        areaMm2: 2400,
      },
    };
    const shell = createFeature('shell', project);
    if (shell.kind !== 'shell') throw new Error('Expected Shell feature.');
    shell.params.thicknessMm = 0.5;
    shell.params.openings = [opening];
    project.features.push(shell);

    const report = evaluateManufacturingReadiness(
      project,
      rebuilt,
      { width: 60, depth: 40, height: 12 },
      'occt-wasm-v5',
      true,
    );
    const finding = report.findings.find((entry) => entry.id === 'wall:shell:' + shell.id);
    expect(finding?.level).toBe('warning');
    expect(finding?.blocksExport).toBe(false);
  });

  it('blocks manufacturing export when semantic rebuild has no solid', () => {
    const project = createDefaultProject();
    project.features = project.features.filter((feature) => feature.kind !== 'extrude');
    const rebuilt = rebuildProject(project);
    const report = evaluateManufacturingReadiness(
      project,
      rebuilt,
      { width: rebuilt.width, depth: rebuilt.depth, height: rebuilt.height },
      'mesh-mvp-v1',
      false,
    );

    expect(report.exportBlocked).toBe(true);
    expect(report.findings.some((entry) => entry.id === 'geometry:no-solid')).toBe(true);
  });
});
