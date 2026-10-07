import type { CadProject } from '../cad/model';

export type SourceAxis = 'X' | 'Y' | 'Z';
export type PrinterAxis = 'width' | 'depth' | 'height';

export type SplitAxisPlan = {
  sourceAxis: SourceAxis;
  printerAxis: PrinterAxis;
  sourceLengthMm: number;
  printerCapacityMm: number;
  segmentCount: number;
  nominalSegmentLengthMm: number;
  cutPositionsFromEnvelopeMinMm: number[];
};

export type SplitPieceRange = {
  startFromEnvelopeMinMm: number;
  endFromEnvelopeMinMm: number;
  lengthMm: number;
};

export type SplitPiecePlan = {
  id: string;
  ordinal: number;
  gridIndex: Record<SourceAxis, number>;
  rangesFromEnvelopeMinMm: Record<SourceAxis, SplitPieceRange>;
};

export type SplitSeamPlan = {
  id: string;
  normalAxis: SourceAxis;
  positionFromEnvelopeMinMm: number;
  negativePieceId: string;
  positivePieceId: string;
  envelopeContactAreaMm2: number;
  alignmentStrategy: 'none';
  structuralAssessment: 'unassessed';
};

export type ManufacturingSplitPlan = {
  strategy: 'single-axis' | 'grid';
  pieceCount: number;
  orientation: {
    printerWidthFrom: SourceAxis;
    printerDepthFrom: SourceAxis;
    printerHeightFrom: SourceAxis;
  };
  splitAxes: SplitAxisPlan[];
  pieces: SplitPiecePlan[];
  seams: SplitSeamPlan[];
  seamStrategy: 'flat-seam';
  geometryGenerationReady: false;
  note: string;
};

type Dimensions = { width: number; depth: number; height: number };

const sourceLengths = (dimensions: Dimensions): Record<SourceAxis, number> => ({
  X: dimensions.width,
  Y: dimensions.height,
  Z: dimensions.depth,
});

const printerCapacities = (project: CadProject): Record<PrinterAxis, number> => ({
  width: project.printProfile.buildVolume.width,
  depth: project.printProfile.buildVolume.depth,
  height: project.printProfile.buildVolume.height,
});

const orientations: readonly ManufacturingSplitPlan['orientation'][] = [
  { printerWidthFrom: 'X', printerDepthFrom: 'Z', printerHeightFrom: 'Y' },
  { printerWidthFrom: 'Z', printerDepthFrom: 'X', printerHeightFrom: 'Y' },
  { printerWidthFrom: 'X', printerDepthFrom: 'Y', printerHeightFrom: 'Z' },
  { printerWidthFrom: 'Y', printerDepthFrom: 'X', printerHeightFrom: 'Z' },
  { printerWidthFrom: 'Z', printerDepthFrom: 'Y', printerHeightFrom: 'X' },
  { printerWidthFrom: 'Y', printerDepthFrom: 'Z', printerHeightFrom: 'X' },
];

function axisPlan(
  sourceAxis: SourceAxis,
  printerAxis: PrinterAxis,
  sourceLengthMm: number,
  printerCapacityMm: number,
): SplitAxisPlan {
  const safeCapacity = Number.isFinite(printerCapacityMm) && printerCapacityMm > 0
    ? printerCapacityMm
    : Number.NaN;
  const segmentCount = Number.isFinite(safeCapacity)
    ? Math.max(1, Math.ceil(sourceLengthMm / safeCapacity))
    : Number.POSITIVE_INFINITY;
  const nominalSegmentLengthMm = Number.isFinite(segmentCount)
    ? sourceLengthMm / segmentCount
    : Number.POSITIVE_INFINITY;
  const cutPositionsFromEnvelopeMinMm = Number.isFinite(segmentCount)
    ? Array.from({ length: Math.max(0, segmentCount - 1) }, (_, index) =>
      nominalSegmentLengthMm * (index + 1))
    : [];

  return {
    sourceAxis,
    printerAxis,
    sourceLengthMm,
    printerCapacityMm,
    segmentCount,
    nominalSegmentLengthMm,
    cutPositionsFromEnvelopeMinMm,
  };
}

function pieceRange(axis: SplitAxisPlan, index: number): SplitPieceRange {
  const startFromEnvelopeMinMm = index * axis.nominalSegmentLengthMm;
  const endFromEnvelopeMinMm = index === axis.segmentCount - 1
    ? axis.sourceLengthMm
    : (index + 1) * axis.nominalSegmentLengthMm;

  return {
    startFromEnvelopeMinMm,
    endFromEnvelopeMinMm,
    lengthMm: endFromEnvelopeMinMm - startFromEnvelopeMinMm,
  };
}

function buildPiecePlans(axes: SplitAxisPlan[]): SplitPiecePlan[] {
  const x = axes.find((axis) => axis.sourceAxis === 'X');
  const y = axes.find((axis) => axis.sourceAxis === 'Y');
  const z = axes.find((axis) => axis.sourceAxis === 'Z');
  if (!x || !y || !z) return [];

  const pieces: SplitPiecePlan[] = [];
  let ordinal = 1;

  for (let xIndex = 0; xIndex < x.segmentCount; xIndex += 1) {
    for (let yIndex = 0; yIndex < y.segmentCount; yIndex += 1) {
      for (let zIndex = 0; zIndex < z.segmentCount; zIndex += 1) {
        pieces.push({
          id: `piece-x${xIndex + 1}-y${yIndex + 1}-z${zIndex + 1}`,
          ordinal,
          gridIndex: { X: xIndex, Y: yIndex, Z: zIndex },
          rangesFromEnvelopeMinMm: {
            X: pieceRange(x, xIndex),
            Y: pieceRange(y, yIndex),
            Z: pieceRange(z, zIndex),
          },
        });
        ordinal += 1;
      }
    }
  }

  return pieces;
}

const sourceAxes: readonly SourceAxis[] = ['X', 'Y', 'Z'];

function pieceGridKey(index: Record<SourceAxis, number>) {
  return `${index.X}:${index.Y}:${index.Z}`;
}

function buildSeamPlans(pieces: SplitPiecePlan[]): SplitSeamPlan[] {
  const byGrid = new Map(pieces.map((piece) => [pieceGridKey(piece.gridIndex), piece]));
  const seams: SplitSeamPlan[] = [];

  for (const piece of pieces) {
    for (const normalAxis of sourceAxes) {
      const neighborIndex = { ...piece.gridIndex, [normalAxis]: piece.gridIndex[normalAxis] + 1 };
      const neighbor = byGrid.get(pieceGridKey(neighborIndex));
      if (!neighbor) continue;

      const tangentAxes = sourceAxes.filter((axis) => axis !== normalAxis);
      const envelopeContactAreaMm2 = tangentAxes
        .map((axis) => piece.rangesFromEnvelopeMinMm[axis].lengthMm)
        .reduce((product, length) => product * length, 1);

      seams.push({
        id: `seam-${normalAxis.toLowerCase()}-${piece.id}--${neighbor.id}`,
        normalAxis,
        positionFromEnvelopeMinMm: piece.rangesFromEnvelopeMinMm[normalAxis].endFromEnvelopeMinMm,
        negativePieceId: piece.id,
        positivePieceId: neighbor.id,
        envelopeContactAreaMm2,
        alignmentStrategy: 'none',
        structuralAssessment: 'unassessed',
      });
    }
  }

  return seams;
}

function candidateFor(
  orientation: ManufacturingSplitPlan['orientation'],
  dimensions: Dimensions,
  project: CadProject,
): ManufacturingSplitPlan | null {
  const lengths = sourceLengths(dimensions);
  const capacities = printerCapacities(project);
  const axes = [
    axisPlan(orientation.printerWidthFrom, 'width', lengths[orientation.printerWidthFrom], capacities.width),
    axisPlan(orientation.printerDepthFrom, 'depth', lengths[orientation.printerDepthFrom], capacities.depth),
    axisPlan(orientation.printerHeightFrom, 'height', lengths[orientation.printerHeightFrom], capacities.height),
  ];

  if (axes.some((axis) => !Number.isFinite(axis.segmentCount))) return null;
  const splitAxes = axes.filter((axis) => axis.segmentCount > 1);
  if (splitAxes.length === 0) return null;

  const pieceCount = axes.reduce((product, axis) => product * axis.segmentCount, 1);
  const pieces = buildPiecePlans(axes);
  if (pieces.length !== pieceCount) return null;
  const seams = buildSeamPlans(pieces);

  return {
    strategy: splitAxes.length === 1 ? 'single-axis' : 'grid',
    pieceCount,
    orientation,
    splitAxes,
    pieces,
    seams,
    seamStrategy: 'flat-seam',
    geometryGenerationReady: false,
    note: 'Envelope planning is deterministic. Exact split generation and multi-object 3MF are available downstream; seam areas remain envelope candidates only, with no alignment or structural-strength claim.',
  };
}

export function planBuildVolumeSplit(
  dimensions: Dimensions,
  project: CadProject,
): ManufacturingSplitPlan | null {
  const values = [dimensions.width, dimensions.depth, dimensions.height];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;

  const candidates = orientations
    .map((orientation) => candidateFor(orientation, dimensions, project))
    .filter((candidate): candidate is ManufacturingSplitPlan => Boolean(candidate))
    .sort((a, b) => {
      if (a.pieceCount !== b.pieceCount) return a.pieceCount - b.pieceCount;
      if (a.splitAxes.length !== b.splitAxes.length) return a.splitAxes.length - b.splitAxes.length;
      const aLargest = Math.max(...a.splitAxes.map((axis) => axis.nominalSegmentLengthMm));
      const bLargest = Math.max(...b.splitAxes.map((axis) => axis.nominalSegmentLengthMm));
      return aLargest - bLargest;
    });

  return candidates[0] ?? null;
}
