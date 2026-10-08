import type { CadProject } from '../cad/model';
import type { ManufacturingSplitPlan } from './split-plan';
import type { SplitAlignmentPlan } from './alignment-plan';
import { assertExportDownloadAllowed } from './export-guard';
import {
  disposeExactAlignedManufacturingSplit,
  generateExactAlignedManufacturingSplit,
} from './exact-alignment';
import {
  createThreeMfPackageFromGeometries,
  type ThreeMfExportReport,
  type ThreeMfMeshObject,
} from './three-mf';

export type AlignedSplitThreeMfExportReport = ThreeMfExportReport & {
  plannedPinCount: number;
  verifiedPinCount: number;
  sourceVolumeMm3: number;
  generatedVolumeMm3: number;
  expectedGeneratedVolumeMm3: number;
  expectedVolumeDeltaMm3: number;
  registrationOnly: true;
};

export async function createProjectAlignedSplitThreeMf(
  project: CadProject,
  splitPlan: ManufacturingSplitPlan,
  alignmentPlan: SplitAlignmentPlan,
) {
  const aligned = await generateExactAlignedManufacturingSplit(
    project,
    splitPlan,
    alignmentPlan,
  );
  try {
    if (!aligned.geometryGenerationReady) {
      throw new Error(
        'Verified registration geometry is not safe for automatic 3MF export.',
      );
    }

    const objects: ThreeMfMeshObject[] = aligned.pieces
      .filter((piece) => !piece.empty && piece.geometry)
      .map((piece) => ({
        name: piece.id,
        geometry: piece.geometry!,
      }));

    const { blob, report } = createThreeMfPackageFromGeometries(
      project.name + '-split-aligned',
      objects,
      aligned.kernelId,
      aligned.warnings,
    );

    const alignedReport: AlignedSplitThreeMfExportReport = {
      ...report,
      plannedPinCount: aligned.plannedPinCount,
      verifiedPinCount: aligned.verifiedPinCount,
      sourceVolumeMm3: aligned.sourceVolumeMm3,
      generatedVolumeMm3: aligned.generatedVolumeMm3,
      expectedGeneratedVolumeMm3: aligned.expectedGeneratedVolumeMm3,
      expectedVolumeDeltaMm3: aligned.expectedVolumeDeltaMm3,
      registrationOnly: true,
    };
    return { blob, report: alignedReport };
  } finally {
    disposeExactAlignedManufacturingSplit(aligned);
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadProjectAlignedSplitThreeMf(
  project: CadProject,
  splitPlan: ManufacturingSplitPlan,
  alignmentPlan: SplitAlignmentPlan,
  mayDownload?: () => boolean,
): Promise<AlignedSplitThreeMfExportReport> {
  const { blob, report } = await createProjectAlignedSplitThreeMf(
    project,
    splitPlan,
    alignmentPlan,
  );
  assertExportDownloadAllowed(mayDownload);
  downloadBlob(blob, report.fileName);
  return report;
}
