import type { CadProject } from '../cad/model';
import {
  buildExactClippedPieces,
  probeExactMaterialCorridors,
  type ExactClipPieceRequest,
  type ExactMaterialCorridorProbeRequest,
  type ExactSplitCylinderOperation,
  type ExactClippedPieceSnapshot,
} from '../cad/exact-kernel';
import type { ManufacturingSplitPlan, SplitPiecePlan } from './split-plan';
import type { AlignmentPinPlan, SplitAlignmentPlan } from './alignment-plan';
import {
  disposeExactManufacturingSplit,
  generateExactManufacturingSplit,
} from './exact-split';

export type ExactAlignedManufacturingSplitResult = {
  kernelId: 'occt-wasm-v5';
  geometryGenerationReady: boolean;
  plannedPinCount: number;
  verifiedPinCount: number;
  sourceVolumeMm3: number;
  generatedVolumeMm3: number;
  expectedGeneratedVolumeMm3: number;
  expectedVolumeDeltaMm3: number;
  pieces: ExactClippedPieceSnapshot[];
  warnings: string[];
};

function seamPosition(plan: ManufacturingSplitPlan, pin: AlignmentPinPlan) {
  const seam = plan.seams.find((candidate) => candidate.id === pin.seamId);
  if (!seam) throw new Error(`Alignment pin "${pin.id}" references missing seam "${pin.seamId}".`);
  if (seam.normalAxis !== pin.normalAxis) {
    throw new Error(`Alignment pin "${pin.id}" axis does not match its seam.`);
  }
  return seam.positionFromEnvelopeMinMm;
}

function corridorProbe(
  splitPlan: ManufacturingSplitPlan,
  pin: AlignmentPinPlan,
): ExactMaterialCorridorProbeRequest {
  const position = seamPosition(splitPlan, pin);
  return {
    id: pin.id,
    axis: pin.normalAxis,
    centerFromEnvelopeMinMm: pin.centerFromEnvelopeMinMm,
    startFromEnvelopeMinMm: position - pin.engagementMm,
    lengthMm: pin.engagementMm * 2,
    radiusMm: pin.pocketDiameterMm / 2,
  };
}

function postOperationsForPiece(
  project: CadProject,
  splitPlan: ManufacturingSplitPlan,
  alignmentPlan: SplitAlignmentPlan,
  piece: SplitPiecePlan,
): ExactSplitCylinderOperation[] {
  const overlapMm = Math.max(0.05, project.printProfile.nozzleMm * 0.25);
  const operations: ExactSplitCylinderOperation[] = [];

  for (const pin of alignmentPlan.pins) {
    const position = seamPosition(splitPlan, pin);
    if (piece.id === pin.malePieceId) {
      operations.push({
        id: `${pin.id}:male`,
        mode: 'add',
        axis: pin.normalAxis,
        centerFromEnvelopeMinMm: pin.centerFromEnvelopeMinMm,
        startFromEnvelopeMinMm: position - overlapMm,
        lengthMm: pin.engagementMm + overlapMm,
        radiusMm: pin.pinDiameterMm / 2,
      });
    }
    if (piece.id === pin.femalePieceId) {
      operations.push({
        id: `${pin.id}:female`,
        mode: 'cut',
        axis: pin.normalAxis,
        centerFromEnvelopeMinMm: pin.centerFromEnvelopeMinMm,
        startFromEnvelopeMinMm: position - overlapMm,
        lengthMm: pin.engagementMm + overlapMm,
        radiusMm: pin.pocketDiameterMm / 2,
      });
    }
  }

  return operations;
}

function clipRequest(
  project: CadProject,
  splitPlan: ManufacturingSplitPlan,
  alignmentPlan: SplitAlignmentPlan,
  piece: SplitPiecePlan,
): ExactClipPieceRequest {
  return {
    id: piece.id,
    ordinal: piece.ordinal,
    rangesFromEnvelopeMinMm: piece.rangesFromEnvelopeMinMm,
    postOperations: postOperationsForPiece(project, splitPlan, alignmentPlan, piece),
  };
}

function expectedAlignedVolume(sourceVolumeMm3: number, pins: readonly AlignmentPinPlan[]) {
  return pins.reduce((volume, pin) => {
    const pinRadius = pin.pinDiameterMm / 2;
    const pocketRadius = pin.pocketDiameterMm / 2;
    const added = Math.PI * pinRadius * pinRadius * pin.engagementMm;
    const removed = Math.PI * pocketRadius * pocketRadius * pin.engagementMm;
    return volume + added - removed;
  }, sourceVolumeMm3);
}

/**
 * Creates derived registration geometry only after:
 * 1) the normal flat exact split is valid and volume-conserving;
 * 2) every proposed pocket-size corridor is proven to be full source material;
 * 3) aligned post-booleans remain valid single solids;
 * 4) resulting total volume matches the analytically expected clearance delta.
 *
 * This is registration-only manufacturing geometry. It never mutates CadProject
 * and makes no structural-strength claim.
 */
export async function generateExactAlignedManufacturingSplit(
  project: CadProject,
  splitPlan: ManufacturingSplitPlan,
  alignmentPlan: SplitAlignmentPlan,
): Promise<ExactAlignedManufacturingSplitResult> {
  if (!alignmentPlan.ready || alignmentPlan.pins.length === 0) {
    throw new Error('Automatic split alignment is not ready for this split plan.');
  }
  if (splitPlan.strategy !== 'single-axis') {
    throw new Error('Automatic split alignment is limited to single-axis split plans.');
  }

  const flat = await generateExactManufacturingSplit(project, splitPlan);
  try {
    if (!flat.geometryGenerationReady || !flat.volumeConserved) {
      throw new Error('Flat exact split must pass validity and volume conservation before alignment geometry.');
    }

    const probes = alignmentPlan.pins.map((pin) => corridorProbe(splitPlan, pin));
    const probeResults = await probeExactMaterialCorridors(project, probes);
    const failed = probeResults.filter((probe) => !probe.fullMaterial);
    if (failed.length > 0) {
      throw new Error(
        `Alignment blocked: ${failed.map((probe) => probe.id).join(', ')} do not have a full exact material corridor across the seam.`,
      );
    }

    const requests = splitPlan.pieces.map((piece) =>
      clipRequest(project, splitPlan, alignmentPlan, piece));
    const aligned = await buildExactClippedPieces(
      project,
      requests,
      { requireVolumeConservation: false },
    );

    const nonEmpty = aligned.pieces.filter((piece) => !piece.empty);
    const expectedGeneratedVolumeMm3 = expectedAlignedVolume(
      flat.sourceVolumeMm3,
      alignmentPlan.pins,
    );
    const expectedVolumeDeltaMm3 = Math.abs(
      expectedGeneratedVolumeMm3 - aligned.generatedVolumeMm3,
    );
    const volumeToleranceMm3 = Math.max(1e-4, flat.sourceVolumeMm3 * 1e-6);
    const expectedVolumeMatches = expectedVolumeDeltaMm3 <= volumeToleranceMm3;
    const geometryGenerationReady = aligned.valid
      && expectedVolumeMatches
      && nonEmpty.length === splitPlan.pieceCount
      && nonEmpty.every((piece) => piece.manufacturingReady);

    const warnings = [...flat.warnings, ...aligned.warnings];
    if (!expectedVolumeMatches) {
      warnings.push(
        `Aligned split volume differs from the analytically expected registration-clearance result by ${expectedVolumeDeltaMm3.toFixed(6)} mm³.`,
      );
    }

    return {
      kernelId: aligned.kernelId,
      geometryGenerationReady,
      plannedPinCount: alignmentPlan.pins.length,
      verifiedPinCount: probeResults.filter((probe) => probe.fullMaterial).length,
      sourceVolumeMm3: flat.sourceVolumeMm3,
      generatedVolumeMm3: aligned.generatedVolumeMm3,
      expectedGeneratedVolumeMm3,
      expectedVolumeDeltaMm3,
      pieces: aligned.pieces,
      warnings,
    };
  } finally {
    disposeExactManufacturingSplit(flat);
  }
}

export function disposeExactAlignedManufacturingSplit(
  result: ExactAlignedManufacturingSplitResult,
) {
  for (const piece of result.pieces) piece.geometry?.dispose();
}
