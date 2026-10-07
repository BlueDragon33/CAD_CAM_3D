import type { CadProject } from '../cad/model';
import type {
  ManufacturingSplitPlan,
  SourceAxis,
  SplitPiecePlan,
  SplitSeamPlan,
} from './split-plan';

export type AlignmentPinPlan = {
  id: string;
  seamId: string;
  malePieceId: string;
  femalePieceId: string;
  normalAxis: SourceAxis;
  centerFromEnvelopeMinMm: Record<SourceAxis, number>;
  pinDiameterMm: number;
  pocketDiameterMm: number;
  clearancePerSideMm: number;
  engagementMm: number;
  purpose: 'registration-only';
  structuralAssessment: 'unassessed';
  exactCorridorVerification: 'required';
};

export type SplitAlignmentPlan = {
  strategy: 'dual-cylindrical-registration';
  ready: boolean;
  pins: AlignmentPinPlan[];
  unsupportedSeamIds: string[];
  warnings: string[];
  note: string;
};

const axes: readonly SourceAxis[] = ['X', 'Y', 'Z'];

function pieceById(plan: ManufacturingSplitPlan, id: string) {
  return plan.pieces.find((piece) => piece.id === id) ?? null;
}

function seamPinGeometry(project: CadProject) {
  const nozzle = project.printProfile.nozzleMm;
  if (!Number.isFinite(nozzle) || nozzle <= 0) return null;

  const pinDiameterMm = Math.max(2, nozzle * 5);
  const clearancePerSideMm = Math.max(0.15, nozzle * 0.5);
  const pocketDiameterMm = pinDiameterMm + clearancePerSideMm * 2;
  const desiredEngagementMm = Math.max(4, nozzle * 10);

  return { pinDiameterMm, clearancePerSideMm, pocketDiameterMm, desiredEngagementMm };
}

function candidatePinsForSeam(
  project: CadProject,
  seam: SplitSeamPlan,
  negative: SplitPiecePlan,
  positive: SplitPiecePlan,
) {
  const geometry = seamPinGeometry(project);
  if (!geometry) return null;

  const tangentAxes = axes.filter((axis) => axis !== seam.normalAxis);
  const first = tangentAxes[0];
  const second = tangentAxes[1];
  const firstRange = negative.rangesFromEnvelopeMinMm[first];
  const secondRange = negative.rangesFromEnvelopeMinMm[second];
  const longAxis = firstRange.lengthMm >= secondRange.lengthMm ? first : second;
  const shortAxis = longAxis === first ? second : first;
  const longRange = negative.rangesFromEnvelopeMinMm[longAxis];
  const shortRange = negative.rangesFromEnvelopeMinMm[shortAxis];

  const minimumLongSpan = geometry.pocketDiameterMm * 6;
  const minimumShortSpan = geometry.pocketDiameterMm * 3;
  if (longRange.lengthMm < minimumLongSpan || shortRange.lengthMm < minimumShortSpan) return null;

  const negativeNormalLength = negative.rangesFromEnvelopeMinMm[seam.normalAxis].lengthMm;
  const positiveNormalLength = positive.rangesFromEnvelopeMinMm[seam.normalAxis].lengthMm;
  const engagementMm = Math.min(
    geometry.desiredEngagementMm,
    negativeNormalLength / 4,
    positiveNormalLength / 4,
  );
  if (engagementMm < project.printProfile.nozzleMm * 4) return null;

  const shortCenter = shortRange.startFromEnvelopeMinMm + shortRange.lengthMm / 2;
  const longCenters = [
    longRange.startFromEnvelopeMinMm + longRange.lengthMm / 3,
    longRange.startFromEnvelopeMinMm + longRange.lengthMm * 2 / 3,
  ];

  return longCenters.map((longCenter, index): AlignmentPinPlan => {
    const center: Record<SourceAxis, number> = {
      X: negative.rangesFromEnvelopeMinMm.X.startFromEnvelopeMinMm
        + negative.rangesFromEnvelopeMinMm.X.lengthMm / 2,
      Y: negative.rangesFromEnvelopeMinMm.Y.startFromEnvelopeMinMm
        + negative.rangesFromEnvelopeMinMm.Y.lengthMm / 2,
      Z: negative.rangesFromEnvelopeMinMm.Z.startFromEnvelopeMinMm
        + negative.rangesFromEnvelopeMinMm.Z.lengthMm / 2,
    };
    center[seam.normalAxis] = seam.positionFromEnvelopeMinMm;
    center[longAxis] = longCenter;
    center[shortAxis] = shortCenter;

    return {
      id: `${seam.id}:pin:${index + 1}`,
      seamId: seam.id,
      malePieceId: seam.negativePieceId,
      femalePieceId: seam.positivePieceId,
      normalAxis: seam.normalAxis,
      centerFromEnvelopeMinMm: center,
      pinDiameterMm: geometry.pinDiameterMm,
      pocketDiameterMm: geometry.pocketDiameterMm,
      clearancePerSideMm: geometry.clearancePerSideMm,
      engagementMm,
      purpose: 'registration-only',
      structuralAssessment: 'unassessed',
      exactCorridorVerification: 'required',
    };
  });
}

export function planSplitAlignment(
  project: CadProject,
  splitPlan: ManufacturingSplitPlan,
): SplitAlignmentPlan {
  const pins: AlignmentPinPlan[] = [];
  const unsupportedSeamIds: string[] = [];
  const warnings: string[] = [];

  if (splitPlan.strategy !== 'single-axis') {
    return {
      strategy: 'dual-cylindrical-registration',
      ready: false,
      pins,
      unsupportedSeamIds: splitPlan.seams.map((seam) => seam.id),
      warnings: ['Automatic registration pins are intentionally limited to single-axis split plans until multi-axis joint collision rules are proven.'],
      note: 'Registration-only proposal. Multi-axis grid alignment is fail-closed; no structural strength is assessed.',
    };
  }

  for (const seam of splitPlan.seams) {
    const negative = pieceById(splitPlan, seam.negativePieceId);
    const positive = pieceById(splitPlan, seam.positivePieceId);
    if (!negative || !positive) {
      unsupportedSeamIds.push(seam.id);
      warnings.push(`${seam.id}: adjacent split piece metadata is missing.`);
      continue;
    }

    const candidates = candidatePinsForSeam(project, seam, negative, positive);
    if (!candidates) {
      unsupportedSeamIds.push(seam.id);
      warnings.push(
        `${seam.id}: envelope is too small for the conservative dual-pin registration heuristic at the selected nozzle size.`,
      );
      continue;
    }
    pins.push(...candidates);
  }

  return {
    strategy: 'dual-cylindrical-registration',
    ready: splitPlan.seams.length > 0
      && unsupportedSeamIds.length === 0
      && pins.length === splitPlan.seams.length * 2,
    pins,
    unsupportedSeamIds,
    warnings,
    note: 'Registration-only proposal. Every pin requires exact positive-volume corridor verification before geometry generation; no structural strength is assessed.',
  };
}
