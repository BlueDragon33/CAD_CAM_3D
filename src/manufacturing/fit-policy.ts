import type { PrintProfile } from '../cad/model';

export type RegistrationFitPolicy = {
  id: 'fdm-registration-uncalibrated-v1';
  fitClass: 'registration-clearance';
  source: 'uncalibrated-default' | 'project-calibrated';
  nozzleMm: number;
  pinDiameterMm: number;
  clearancePerSideMm: number;
  pocketDiameterMm: number;
  desiredEngagementMm: number;
  calibrationRequiredForPrecisionFit: true;
  note: string;
};

export function deriveRegistrationFitPolicy(
  profile: PrintProfile,
): RegistrationFitPolicy | null {
  const nozzleMm = profile.nozzleMm;
  if (!Number.isFinite(nozzleMm) || nozzleMm <= 0) return null;

  const pinDiameterMm = Math.max(2, nozzleMm * 5);
  const calibratedClearance = profile.fitCalibration.registrationClearancePerSideMm;
  const clearancePerSideMm = calibratedClearance ?? Math.max(0.15, nozzleMm * 0.5);
  const pocketDiameterMm = pinDiameterMm + clearancePerSideMm * 2;
  const desiredEngagementMm = Math.max(4, nozzleMm * 10);
  const calibrated = calibratedClearance !== null;

  return {
    id: 'fdm-registration-uncalibrated-v1',
    fitClass: 'registration-clearance',
    source: calibrated ? 'project-calibrated' : 'uncalibrated-default',
    nozzleMm,
    pinDiameterMm,
    clearancePerSideMm,
    pocketDiameterMm,
    desiredEngagementMm,
    calibrationRequiredForPrecisionFit: true,
    note: calibrated
      ? 'Project-specific registration clearance is being used. This records dimensional calibration intent but does not certify fit or structural performance.'
      : 'Conservative nozzle-relative registration clearance only. Printer/material calibration is required before treating this as a precision fit.',
  };
}
