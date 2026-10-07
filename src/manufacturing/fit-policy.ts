import type { PrintProfile } from '../cad/model';

export type RegistrationFitPolicy = {
  id: 'fdm-registration-uncalibrated-v1';
  fitClass: 'registration-clearance';
  source: 'uncalibrated-default';
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
  const clearancePerSideMm = Math.max(0.15, nozzleMm * 0.5);
  const pocketDiameterMm = pinDiameterMm + clearancePerSideMm * 2;
  const desiredEngagementMm = Math.max(4, nozzleMm * 10);

  return {
    id: 'fdm-registration-uncalibrated-v1',
    fitClass: 'registration-clearance',
    source: 'uncalibrated-default',
    nozzleMm,
    pinDiameterMm,
    clearancePerSideMm,
    pocketDiameterMm,
    desiredEngagementMm,
    calibrationRequiredForPrecisionFit: true,
    note: 'Conservative nozzle-relative registration clearance only. Printer/material calibration is required before treating this as a precision fit.',
  };
}
