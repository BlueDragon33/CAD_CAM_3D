import type { CadProject } from '../cad/model';
import {
  buildExactClippedPieces,
  type ExactClipPieceRequest,
  type ExactClippedPieceSnapshot,
} from '../cad/exact-kernel';
import type { ManufacturingSplitPlan, SplitPiecePlan } from './split-plan';

export type ExactManufacturingSplitResult = {
  kernelId: 'occt-wasm-v5';
  plannedPieceCount: number;
  generatedPieceCount: number;
  geometryGenerationReady: boolean;
  volumeConserved: boolean;
  sourceVolumeMm3: number;
  generatedVolumeMm3: number;
  volumeDeltaMm3: number;
  pieces: ExactClippedPieceSnapshot[];
  warnings: string[];
};

function clipRequest(piece: SplitPiecePlan): ExactClipPieceRequest {
  return {
    id: piece.id,
    ordinal: piece.ordinal,
    rangesFromEnvelopeMinMm: piece.rangesFromEnvelopeMinMm,
  };
}

/**
 * Generate exact runtime-only B-Rep split pieces from a deterministic
 * manufacturing split plan. The split remains a manufacturing projection:
 * it never mutates CadProject and never persists OCCT runtime handles.
 */
export async function generateExactManufacturingSplit(
  project: CadProject,
  plan: ManufacturingSplitPlan,
): Promise<ExactManufacturingSplitResult> {
  if (plan.pieces.length !== plan.pieceCount) {
    throw new Error(
      `Split plan is inconsistent: expected ${plan.pieceCount} piece envelope(s), got ${plan.pieces.length}.`,
    );
  }

  const snapshot = await buildExactClippedPieces(project, plan.pieces.map(clipRequest));
  const generatedPieces = snapshot.pieces.filter((piece) => !piece.empty);
  const geometryGenerationReady = snapshot.valid
    && snapshot.volumeConserved
    && generatedPieces.length > 1
    && generatedPieces.every((piece) => piece.manufacturingReady);

  const warnings = [...snapshot.warnings];
  if (generatedPieces.length <= 1) {
    warnings.push('Exact clipping did not produce multiple non-empty manufacturing pieces.');
  }
  if (!generatedPieces.every((piece) => piece.manufacturingReady)) {
    warnings.push('At least one non-empty split cell is invalid, disconnected, or lacks exact tessellation.');
  }

  return {
    kernelId: snapshot.kernelId,
    plannedPieceCount: plan.pieceCount,
    generatedPieceCount: generatedPieces.length,
    geometryGenerationReady,
    volumeConserved: snapshot.volumeConserved,
    sourceVolumeMm3: snapshot.sourceVolumeMm3,
    generatedVolumeMm3: snapshot.generatedVolumeMm3,
    volumeDeltaMm3: snapshot.volumeDeltaMm3,
    pieces: snapshot.pieces,
    warnings,
  };
}

export function disposeExactManufacturingSplit(result: ExactManufacturingSplitResult) {
  for (const piece of result.pieces) piece.geometry?.dispose();
}
