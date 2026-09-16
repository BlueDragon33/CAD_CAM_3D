import { rebuildProject } from '../cad/rebuild';
import type { CadProject } from '../cad/model';

export type PrintCheck = {
  level: 'ok' | 'warning';
  message: string;
};

export function validateForPrint(project: CadProject): PrintCheck[] {
  const part = rebuildProject(project);
  const v = project.printProfile.buildVolume;
  const checks: PrintCheck[] = [];

  if (!part.hasSolid) {
    return [{ level: 'warning', message: 'No valid solid is available for print validation.' }];
  }

  if (part.width > v.width || part.depth > v.depth || part.height > v.height) {
    checks.push({ level: 'warning', message: 'Part exceeds the selected printer build volume.' });
  } else {
    checks.push({ level: 'ok', message: 'Part fits inside the selected printer build volume.' });
  }

  if (Math.min(part.width, part.depth, part.height) < project.printProfile.nozzleMm * 2) {
    checks.push({ level: 'warning', message: 'One envelope dimension is very small relative to nozzle size.' });
  }

  const tinyHoles = part.holes.filter((hole) => hole.params.diameter < project.printProfile.nozzleMm * 2);
  if (tinyHoles.length > 0) {
    checks.push({ level: 'warning', message: `${tinyHoles.length} hole(s) are smaller than 2× nozzle diameter and may print inaccurately.` });
  } else if (part.holes.length > 0) {
    checks.push({ level: 'ok', message: 'Through-hole diameters are reasonable for the selected nozzle.' });
  }

  const promoted = part.manufacturingProfile?.source === 'sketch';
  if (!part.fullyConstrainedSketch) {
    checks.push({
      level: 'warning',
      message: promoted
        ? 'Promoted sketch profile is not fully constrained; its manufacturing shape can drift during edits.'
        : 'Base sketch is not fully constrained; design intent can drift during edits.',
    });
  } else {
    checks.push({
      level: 'ok',
      message: promoted
        ? 'Promoted manufacturing sketch is fully constrained by the current application-level constraint model.'
        : 'Base sketch is fully constrained by named parameters.',
    });
  }

  return checks;
}
