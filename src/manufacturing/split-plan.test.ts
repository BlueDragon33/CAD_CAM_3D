import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../cad/model';
import { planBuildVolumeSplit } from './split-plan';

describe('build-volume split planning', () => {
  it('returns a two-piece single-axis plan when only one source dimension exceeds the printer', () => {
    const project = createDefaultProject();
    project.printProfile.buildVolume = { width: 256, depth: 256, height: 256 };

    const plan = planBuildVolumeSplit({ width: 300, depth: 40, height: 12 }, project);

    expect(plan).not.toBeNull();
    expect(plan?.strategy).toBe('single-axis');
    expect(plan?.pieceCount).toBe(2);
    expect(plan?.splitAxes).toHaveLength(1);
    expect(plan?.splitAxes[0].sourceAxis).toBe('X');
    expect(plan?.splitAxes[0].segmentCount).toBe(2);
    expect(plan?.splitAxes[0].cutPositionsFromEnvelopeMinMm).toEqual([150]);
    expect(plan?.geometryGenerationReady).toBe(false);
  });

  it('uses a multi-axis grid when more than one dimension exceeds every assigned printer axis', () => {
    const project = createDefaultProject();
    project.printProfile.buildVolume = { width: 256, depth: 256, height: 256 };

    const plan = planBuildVolumeSplit({ width: 300, depth: 300, height: 12 }, project);

    expect(plan?.strategy).toBe('grid');
    expect(plan?.pieceCount).toBe(4);
    expect(plan?.splitAxes.map((axis) => axis.segmentCount).sort()).toEqual([2, 2]);
  });

  it('selects the orientation that minimizes total piece count for a non-cubic printer', () => {
    const project = createDefaultProject();
    project.printProfile.buildVolume = { width: 300, depth: 200, height: 100 };

    const plan = planBuildVolumeSplit({ width: 350, depth: 190, height: 90 }, project);

    expect(plan?.pieceCount).toBe(2);
    expect(plan?.strategy).toBe('single-axis');
  });

  it('returns null when the part already fits without splitting', () => {
    const project = createDefaultProject();
    project.printProfile.buildVolume = { width: 256, depth: 256, height: 256 };

    expect(planBuildVolumeSplit({ width: 100, depth: 80, height: 60 }, project)).toBeNull();
  });

  it('fails closed for invalid printer capacity', () => {
    const project = createDefaultProject();
    project.printProfile.buildVolume = { width: 0, depth: 256, height: 256 };

    expect(planBuildVolumeSplit({ width: 300, depth: 40, height: 12 }, project)).toBeNull();
  });
});
