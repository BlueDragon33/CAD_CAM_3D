import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../cad/model';
import { deriveRegistrationFitPolicy } from './fit-policy';

describe('registration fit policy', () => {
  it('derives the current conservative nozzle-relative registration geometry', () => {
    const project = createDefaultProject();
    project.printProfile.nozzleMm = 0.4;

    expect(deriveRegistrationFitPolicy(project.printProfile)).toEqual({
      id: 'fdm-registration-uncalibrated-v1',
      fitClass: 'registration-clearance',
      source: 'uncalibrated-default',
      nozzleMm: 0.4,
      pinDiameterMm: 2,
      clearancePerSideMm: 0.2,
      pocketDiameterMm: 2.4,
      desiredEngagementMm: 4,
      calibrationRequiredForPrecisionFit: true,
      note: expect.stringContaining('calibration'),
    });
  });

  it('scales larger-nozzle registration geometry without claiming calibration', () => {
    const project = createDefaultProject();
    project.printProfile.nozzleMm = 0.8;

    const policy = deriveRegistrationFitPolicy(project.printProfile);

    expect(policy?.pinDiameterMm).toBe(4);
    expect(policy?.clearancePerSideMm).toBe(0.4);
    expect(policy?.pocketDiameterMm).toBe(4.8);
    expect(policy?.desiredEngagementMm).toBe(8);
    expect(policy?.source).toBe('uncalibrated-default');
  });

  it('uses persisted project calibration without changing the pin diameter heuristic', () => {
    const project = createDefaultProject();
    project.printProfile.nozzleMm = 0.4;
    project.printProfile.fitCalibration.registrationClearancePerSideMm = 0.3;

    const policy = deriveRegistrationFitPolicy(project.printProfile);

    expect(policy?.source).toBe('project-calibrated');
    expect(policy?.pinDiameterMm).toBe(2);
    expect(policy?.clearancePerSideMm).toBe(0.3);
    expect(policy?.pocketDiameterMm).toBe(2.6);
  });

  it('fails closed for invalid nozzle data', () => {
    const project = createDefaultProject();
    project.printProfile.nozzleMm = 0;

    expect(deriveRegistrationFitPolicy(project.printProfile)).toBeNull();
  });
});
