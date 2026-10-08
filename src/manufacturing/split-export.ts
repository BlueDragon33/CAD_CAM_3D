import type { CadProject } from '../cad/model';
import type { ManufacturingSplitPlan } from './split-plan';
import { assertExportDownloadAllowed } from './export-guard';
import {
  disposeExactManufacturingSplit,
  generateExactManufacturingSplit,
} from './exact-split';
import {
  createThreeMfPackageFromGeometries,
  type ThreeMfExportReport,
  type ThreeMfMeshObject,
} from './three-mf';

export type SplitThreeMfExportReport = ThreeMfExportReport & {
  plannedPieceCount: number;
  generatedPieceCount: number;
  sourceVolumeMm3: number;
  generatedVolumeMm3: number;
  volumeDeltaMm3: number;
  volumeConserved: boolean;
};

export async function createProjectSplitThreeMf(
  project: CadProject,
  plan: ManufacturingSplitPlan,
) {
  const split = await generateExactManufacturingSplit(project, plan);
  try {
    if (!split.geometryGenerationReady) {
      throw new Error(
        'Exact split geometry is not safe for automatic multi-object export. Review split diagnostics and seam strategy.',
      );
    }

    const objects: ThreeMfMeshObject[] = split.pieces
      .filter((piece) => !piece.empty && piece.geometry)
      .map((piece) => ({
        name: piece.id,
        geometry: piece.geometry!,
      }));

    const { blob, report } = createThreeMfPackageFromGeometries(
      project.name + '-split',
      objects,
      split.kernelId,
      split.warnings,
    );

    const splitReport: SplitThreeMfExportReport = {
      ...report,
      plannedPieceCount: split.plannedPieceCount,
      generatedPieceCount: split.generatedPieceCount,
      sourceVolumeMm3: split.sourceVolumeMm3,
      generatedVolumeMm3: split.generatedVolumeMm3,
      volumeDeltaMm3: split.volumeDeltaMm3,
      volumeConserved: split.volumeConserved,
    };

    return { blob, report: splitReport };
  } finally {
    disposeExactManufacturingSplit(split);
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

export async function downloadProjectSplitThreeMf(
  project: CadProject,
  plan: ManufacturingSplitPlan,
  mayDownload?: () => boolean,
): Promise<SplitThreeMfExportReport> {
  const { blob, report } = await createProjectSplitThreeMf(project, plan);
  assertExportDownloadAllowed(mayDownload);
  downloadBlob(blob, report.fileName);
  return report;
}
