import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../cad/model';
import { planSplitAlignment } from './alignment-plan';
import { planBuildVolumeSplit } from './split-plan';

describe('split alignment planning', () => {
  it('proposes two registration pins for a roomy single-axis seam', () => {
    const project = createDefaultProject();
    project.printProfile.buildVolume = { width: 256, depth: 256, height: 256 };
    project.printProfile.nozzleMm = 0.4;
    const split = planBuildVolumeSplit({ width: 300, depth: 40, height: 12 }, project);
    expect(split).not.toBeNull();

    const alignment = planSplitAlignment(project, split!);

    expect(alignment.ready).toBe(true);
    expect(alignment.pins).toHaveLength(2);
    expect(alignment.unsupportedSeamIds).toEqual([]);
    expect(alignment.pins[0]).toMatchObject({
      malePieceId: 'piece-x1-y1-z1',
      femalePieceId: 'piece-x2-y1-z1',
      normalAxis: 'X',
      pinDiameterMm: 2,
      pocketDiameterMm: 2.4,
      clearancePerSideMm: 0.2,
      engagementMm: 4,
      purpose: 'registration-only',
      structuralAssessment: 'unassessed',
      exactCorridorVerification: 'required',
    });
    expect(alignment.pins.map((pin) => pin.centerFromEnvelopeMinMm.Y)).toEqual([6, 6]);
    expect(alignment.pins[0].centerFromEnvelopeMinMm.Z).toBeCloseTo(40 / 3);
    expect(alignment.pins[1].centerFromEnvelopeMinMm.Z).toBeCloseTo(80 / 3);
  });

  it('uses persisted project calibration in the registration pocket geometry', () => {
    const project = createDefaultProject();
    project.printProfile.buildVolume = { width: 256, depth: 256, height: 256 };
    project.printProfile.nozzleMm = 0.4;
    project.printProfile.fitCalibration.registrationClearancePerSideMm = 0.3;
    const split = planBuildVolumeSplit({ width: 300, depth: 40, height: 12 }, project);
    expect(split).not.toBeNull();

    const alignment = planSplitAlignment(project, split!);

    expect(alignment.ready).toBe(true);
    expect(alignment.pins).toHaveLength(2);
    expect(alignment.pins.every((pin) => pin.pinDiameterMm === 2)).toBe(true);
    expect(alignment.pins.every((pin) => pin.clearancePerSideMm === 0.3)).toBe(true);
    expect(alignment.pins.every((pin) => pin.pocketDiameterMm === 2.6)).toBe(true);
  });

  it('fails closed when the seam envelope is too small for two conservative pins', () => {
    const project = createDefaultProject();
    project.printProfile.buildVolume = { width: 256, depth: 256, height: 256 };
    const split = planBuildVolumeSplit({ width: 300, depth: 3, height: 1 }, project);
    expect(split).not.toBeNull();

    const alignment = planSplitAlignment(project, split!);

    expect(alignment.ready).toBe(false);
    expect(alignment.pins).toHaveLength(0);
    expect(alignment.unsupportedSeamIds).toEqual(split!.seams.map((seam) => seam.id));
  });

  it('is deterministic and fails closed for multi-axis grid alignment', () => {
    const project = createDefaultProject();
    project.printProfile.buildVolume = { width: 256, depth: 256, height: 256 };
    const split = planBuildVolumeSplit({ width: 300, depth: 300, height: 20 }, project);
    expect(split).not.toBeNull();

    const first = planSplitAlignment(project, split!);
    const second = planSplitAlignment(project, split!);

    expect(first).toEqual(second);
    expect(first.ready).toBe(false);
    expect(first.pins).toHaveLength(0);
    expect(first.unsupportedSeamIds).toEqual(split!.seams.map((seam) => seam.id));
  });
});
