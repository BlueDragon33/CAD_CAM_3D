import type { CadProject } from '../cad/model';
import { buildExactKernelSnapshot, type ExactKernelReport } from '../cad/exact-kernel';

export type StepExportReport = ExactKernelReport & {
  fileName: string;
  byteLength: number;
};

function safeFileName(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'cad-cam-3d-part';
}

export async function createStepExport(project: CadProject) {
  const snapshot = await buildExactKernelSnapshot(project, { includeStep: true });
  try {
    if (!snapshot.report.valid) {
      throw new Error(`Exact B-Rep validation failed. ${snapshot.report.warnings.join(' ')}`.trim());
    }
    if (!snapshot.stepText) {
      throw new Error('Exact B-Rep rebuild completed without a STEP payload.');
    }

    const blob = new Blob([snapshot.stepText], { type: 'model/step' });
    const fileName = `${safeFileName(project.name)}.step`;
    const report: StepExportReport = {
      ...snapshot.report,
      fileName,
      byteLength: blob.size,
    };
    return { blob, report };
  } finally {
    snapshot.geometry.dispose();
  }
}

export async function downloadProjectStep(project: CadProject): Promise<StepExportReport> {
  const { blob, report } = await createStepExport(project);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = report.fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return report;
}
