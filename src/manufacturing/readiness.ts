import type { CadProject } from '../cad/model';
import { rebuildProject, type RebuiltPart } from '../cad/rebuild';
import { activeCadKernel } from '../cad/kernel';
import { buildExactKernelSnapshot } from '../cad/exact-kernel';
import { projectRequiresExactGeometry } from '../cad/project-analysis';
import { analyzeDownwardOverhang } from './geometry-analysis';
import { planBuildVolumeSplit, type ManufacturingSplitPlan } from './split-plan';

export type ManufacturingFindingLevel = 'ok' | 'warning' | 'blocker';
export type ManufacturingFindingCategory = 'geometry' | 'build-volume' | 'orientation' | 'split' | 'overhang' | 'feature-size' | 'wall' | 'design-intent' | 'kernel';

export type ManufacturingFinding = {
  id: string;
  level: ManufacturingFindingLevel;
  category: ManufacturingFindingCategory;
  message: string;
  remedy?: string;
  featureId?: string;
  blocksExport: boolean;
};

export type AxisAlignedOrientation = {
  width: number;
  depth: number;
  height: number;
  sourceAxes: [string, string, string];
};

export type ManufacturingReadinessReport = {
  kernelId: string;
  exact: boolean;
  dimensionsMm: { width: number; depth: number; height: number };
  recommendedOrientation: AxisAlignedOrientation | null;
  splitPlan: ManufacturingSplitPlan | null;
  findings: ManufacturingFinding[];
  exportBlocked: boolean;
  selectedPrinterReady: boolean;
};

function finding(
  id: string,
  level: ManufacturingFindingLevel,
  category: ManufacturingFindingCategory,
  message: string,
  options: Pick<ManufacturingFinding, 'remedy' | 'featureId' | 'blocksExport'>,
): ManufacturingFinding {
  return { id, level, category, message, ...options };
}

function fitsBuildVolume(
  dimensions: { width: number; depth: number; height: number },
  project: CadProject,
) {
  const volume = project.printProfile.buildVolume;
  return dimensions.width <= volume.width
    && dimensions.depth <= volume.depth
    && dimensions.height <= volume.height;
}

export function findAxisAlignedPrinterOrientation(
  dimensions: ManufacturingReadinessReport['dimensionsMm'],
  project: CadProject,
): AxisAlignedOrientation | null {
  const axes = [
    { label: 'X', value: dimensions.width },
    { label: 'Y', value: dimensions.height },
    { label: 'Z', value: dimensions.depth },
  ] as const;
  const permutations = [
    [0, 2, 1],
    [2, 0, 1],
    [0, 1, 2],
    [1, 0, 2],
    [2, 1, 0],
    [1, 2, 0],
  ] as const;

  for (const [widthAxis, depthAxis, heightAxis] of permutations) {
    const candidate: AxisAlignedOrientation = {
      width: axes[widthAxis].value,
      depth: axes[depthAxis].value,
      height: axes[heightAxis].value,
      sourceAxes: [axes[widthAxis].label, axes[depthAxis].label, axes[heightAxis].label],
    };
    if (fitsBuildVolume(candidate, project)) return candidate;
  }
  return null;
}

export function evaluateManufacturingReadiness(
  project: CadProject,
  rebuilt: RebuiltPart,
  dimensionsMm: ManufacturingReadinessReport['dimensionsMm'],
  kernelId: string,
  exact: boolean,
  kernelWarnings: string[] = [],
): ManufacturingReadinessReport {
  const findings: ManufacturingFinding[] = [];

  if (!rebuilt.hasSolid) {
    findings.push(finding(
      'geometry:no-solid',
      'blocker',
      'geometry',
      'No valid solid is available for manufacturing analysis.',
      { remedy: 'Repair the feature-history errors before exporting manufacturing geometry.', blocksExport: true },
    ));
  }

  for (const diagnostic of rebuilt.diagnostics.filter((entry) => entry.level === 'error')) {
    findings.push(finding(
      'geometry:diagnostic:' + (diagnostic.featureId ?? diagnostic.message),
      'blocker',
      'geometry',
      diagnostic.message,
      {
        remedy: 'Repair the referenced feature or dependency, then rebuild the project.',
        featureId: diagnostic.featureId,
        blocksExport: true,
      },
    ));
  }

  const recommendedOrientation = rebuilt.hasSolid
    ? findAxisAlignedPrinterOrientation(dimensionsMm, project)
    : null;
  const splitPlan = rebuilt.hasSolid && !recommendedOrientation && !fitsBuildVolume(dimensionsMm, project)
    ? planBuildVolumeSplit(dimensionsMm, project)
    : null;

  if (rebuilt.hasSolid) {
    if (fitsBuildVolume(dimensionsMm, project)) {
      findings.push(finding(
        'build-volume:fit',
        'ok',
        'build-volume',
        'Final ' + (exact ? 'exact ' : '') + 'part envelope fits the selected printer build volume in its current orientation.',
        { blocksExport: false },
      ));
    } else if (recommendedOrientation) {
      const v = project.printProfile.buildVolume;
      findings.push(finding(
        'orientation:axis-aligned-fit',
        'warning',
        'orientation',
        'Current envelope ' + dimensionsMm.width.toFixed(2) + ' × ' + dimensionsMm.depth.toFixed(2) + ' × ' + dimensionsMm.height.toFixed(2)
          + ' mm exceeds selected printer volume ' + v.width + ' × ' + v.depth + ' × ' + v.height
          + ' mm, but an axis-aligned orientation fits as ' + recommendedOrientation.width.toFixed(2) + ' × '
          + recommendedOrientation.depth.toFixed(2) + ' × ' + recommendedOrientation.height.toFixed(2) + ' mm.',
        {
          remedy: 'Rotate the part in the slicer so source axes ' + recommendedOrientation.sourceAxes.join('/') + ' map to printer width/depth/height, then re-check supports and surface quality.',
          blocksExport: false,
        },
      ));
    } else {
      const v = project.printProfile.buildVolume;
      findings.push(finding(
        'build-volume:no-axis-aligned-fit',
        'blocker',
        'build-volume',
        'Final part envelope ' + dimensionsMm.width.toFixed(2) + ' × ' + dimensionsMm.depth.toFixed(2) + ' × ' + dimensionsMm.height.toFixed(2)
          + ' mm does not fit selected printer volume ' + v.width + ' × ' + v.depth + ' × ' + v.height + ' mm in any 90° axis-aligned orientation.',
        {
          remedy: 'Choose a larger printer, reduce the part, or use an explicit split-and-join workflow when split planning is enabled.',
          blocksExport: false,
        },
      ));
      if (splitPlan) {
        const splitSummary = splitPlan.splitAxes
          .map((axis) => axis.sourceAxis + '→' + axis.printerAxis + ': ' + axis.segmentCount + ' segment(s)')
          .join(' · ');
        findings.push(finding(
          'split:envelope-plan-available',
          'warning',
          'split',
          'A deterministic envelope split plan is available: ' + splitPlan.pieceCount + ' piece(s) · ' + splitSummary + '.',
          {
            remedy: 'Review seam locations and engineering loads before accepting a split. Exact cutting and alignment joints are not generated yet.',
            blocksExport: false,
          },
        ));
      }
    }
  }

  const nozzle = project.printProfile.nozzleMm;
  if (rebuilt.hasSolid && Math.min(dimensionsMm.width, dimensionsMm.depth, dimensionsMm.height) < nozzle * 2) {
    findings.push(finding(
      'feature-size:envelope',
      'warning',
      'feature-size',
      'One final envelope dimension is below 2× nozzle diameter and may be difficult to reproduce reliably.',
      { remedy: 'Review the thin dimension or choose a smaller nozzle/process.', blocksExport: false },
    ));
  }

  for (const feature of project.features) {
    if (!feature.enabled) continue;
    if (feature.kind === 'hole' && feature.params.diameter < nozzle * 2) {
      findings.push(finding(
        'feature-size:hole:' + feature.id,
        'warning',
        'feature-size',
        feature.name + ' diameter ' + feature.params.diameter.toFixed(2) + ' mm is below 2× the selected ' + nozzle.toFixed(2) + ' mm nozzle diameter.',
        {
          remedy: 'Increase the hole allowance/diameter, use a smaller nozzle, or plan post-processing if dimensional accuracy matters.',
          featureId: feature.id,
          blocksExport: false,
        },
      ));
    }
    if (feature.kind === 'shell' && feature.params.thicknessMm < nozzle * 2) {
      findings.push(finding(
        'wall:shell:' + feature.id,
        'warning',
        'wall',
        feature.name + ' thickness ' + feature.params.thicknessMm.toFixed(2) + ' mm is below 2× nozzle diameter.',
        {
          remedy: 'Review wall-line count and material/process behavior in the slicer; consider increasing wall thickness.',
          featureId: feature.id,
          blocksExport: false,
        },
      ));
    }
  }

  if (!rebuilt.fullyConstrainedSketch) {
    findings.push(finding(
      'design-intent:underconstrained',
      'warning',
      'design-intent',
      'The base manufacturing sketch is not fully constrained by the current constraint model; dimensions may drift during later edits.',
      { remedy: 'Add the missing dimensions/geometric constraints before treating the design as production-stable.', blocksExport: false },
    ));
  } else {
    findings.push(finding(
      'design-intent:constrained',
      'ok',
      'design-intent',
      'Base manufacturing sketch is fully constrained by the current application-level constraint model.',
      { blocksExport: false },
    ));
  }

  for (const [index, warning] of kernelWarnings.entries()) {
    findings.push(finding(
      'kernel:' + index,
      'warning',
      'kernel',
      warning,
      { remedy: 'Inspect the exact geometry/topology state before relying on the affected downstream operation.', blocksExport: false },
    ));
  }

  const exportBlocked = findings.some((entry) => entry.level === 'blocker' && entry.blocksExport);
  const selectedPrinterReady = !findings.some((entry) => entry.level === 'blocker');

  return { kernelId, exact, dimensionsMm, recommendedOrientation, splitPlan, findings, exportBlocked, selectedPrinterReady };
}

function appendOverhangFinding(
  report: ManufacturingReadinessReport,
  geometry: import('three').BufferGeometry,
) {
  const overhang = analyzeDownwardOverhang(geometry, 45);
  const meaningfulArea = Math.max(5, overhang.totalSurfaceAreaMm2 * 0.01);
  if (overhang.downwardOverhangAreaMm2 >= meaningfulArea) {
    report.findings.push(finding(
      'overhang:downward-area',
      'warning',
      'overhang',
      'Current orientation has approximately ' + overhang.downwardOverhangAreaMm2.toFixed(1)
        + ' mm² of strongly downward-facing surface away from the build plane (45° heuristic).',
      {
        remedy: 'Review orientation and support strategy in the slicer. This CAD heuristic does not replace slicer-specific support analysis.',
        blocksExport: false,
      },
    ));
  }
}

export async function analyzeManufacturingReadiness(project: CadProject): Promise<ManufacturingReadinessReport> {
  const rebuilt = rebuildProject(project);
  if (!rebuilt.hasSolid) {
    return evaluateManufacturingReadiness(
      project,
      rebuilt,
      { width: rebuilt.width, depth: rebuilt.depth, height: rebuilt.height },
      activeCadKernel.id,
      false,
    );
  }

  if (projectRequiresExactGeometry(project)) {
    const snapshot = await buildExactKernelSnapshot(project, { includeStep: false });
    try {
      const report = evaluateManufacturingReadiness(
        project,
        snapshot.rebuilt,
        snapshot.report.dimensionsMm,
        snapshot.report.kernelId,
        true,
        snapshot.report.warnings,
      );
      appendOverhangFinding(report, snapshot.geometry);
      if (!snapshot.report.valid) {
        report.findings.unshift(finding(
          'geometry:invalid-exact-brep',
          'blocker',
          'geometry',
          'OpenCascade reports the final B-Rep as invalid.',
          { remedy: 'Repair the failing feature before manufacturing export.', blocksExport: true },
        ));
        report.exportBlocked = true;
        report.selectedPrinterReady = false;
      }
      return report;
    } finally {
      snapshot.geometry.dispose();
    }
  }

  const build = activeCadKernel.buildMesh(project);
  try {
    if (!build.geometry) {
      return evaluateManufacturingReadiness(
        project,
        build.rebuilt,
        { width: build.rebuilt.width, depth: build.rebuilt.depth, height: build.rebuilt.height },
        activeCadKernel.id,
        false,
      );
    }
    build.geometry.computeBoundingBox();
    const box = build.geometry.boundingBox;
    const dimensionsMm = box
      ? { width: box.max.x - box.min.x, depth: box.max.z - box.min.z, height: box.max.y - box.min.y }
      : { width: build.rebuilt.width, depth: build.rebuilt.depth, height: build.rebuilt.height };
    const report = evaluateManufacturingReadiness(
      project,
      build.rebuilt,
      dimensionsMm,
      activeCadKernel.id,
      false,
    );
    appendOverhangFinding(report, build.geometry);
    return report;
  } finally {
    build.geometry?.dispose();
  }
}
