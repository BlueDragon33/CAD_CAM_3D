import type { CadProject } from '../cad/model';

/**
 * Deterministic identity for the exact project inputs that can affect
 * manufacturing analysis and split/alignment export. This is derived evidence,
 * never canonical project data.
 */
export function manufacturingEvidenceKey(project: CadProject) {
  return JSON.stringify({
    dimensions: project.dimensions,
    features: project.features,
    printProfile: project.printProfile,
  });
}

export function isManufacturingEvidenceCurrent(
  project: CadProject,
  inputKey: string,
) {
  return inputKey === manufacturingEvidenceKey(project);
}
