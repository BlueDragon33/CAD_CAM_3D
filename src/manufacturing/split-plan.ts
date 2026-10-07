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

export type ManufacturingSplitPlan = {
  strategy: 'single-axis' | 'grid';
  pieceCount: number;
  orientation: {
    printerWidthFrom: SourceAxis;
    printerDepthFrom: SourceAxis;
    printerHeightFrom: SourceAxis;
  };
  splitAxes: SplitAxisPlan[];
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
  return {
    strategy: splitAxes.length === 1 ? 'single-axis' : 'grid',
    pieceCount,
    orientation,
    splitAxes,
    seamStrategy: 'flat-seam',
    geometryGenerationReady: false,
    note: 'Envelope split plan only. Exact cutting, alignment joints and multi-part export are not generated yet.',
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
