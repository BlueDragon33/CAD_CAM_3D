import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../cad/model';
import { isManufacturingEvidenceCurrent, manufacturingEvidenceKey } from './evidence';

describe('manufacturing evidence key', () => {
  it('is stable for unchanged manufacturing inputs', () => {
    const project = createDefaultProject();
    expect(manufacturingEvidenceKey(project)).toBe(manufacturingEvidenceKey(project));
  });

  it('invalidates when fit calibration changes', () => {
    const project = createDefaultProject();
    const before = manufacturingEvidenceKey(project);

    project.printProfile.fitCalibration.registrationClearancePerSideMm = 0.3;

    expect(manufacturingEvidenceKey(project)).not.toBe(before);
    expect(isManufacturingEvidenceCurrent(project, before)).toBe(false);
  });

  it('invalidates when parametric features change', () => {
    const project = createDefaultProject();
    const before = manufacturingEvidenceKey(project);
    const extrude = project.features.find((feature) => feature.kind === 'extrude');
    if (!extrude || extrude.kind !== 'extrude') throw new Error('Default Extrude missing.');

    extrude.enabled = false;

    expect(isManufacturingEvidenceCurrent(project, before)).toBe(false);
  });
});
