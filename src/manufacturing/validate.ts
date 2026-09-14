import type { CadProject } from '../cad/model';

export type PrintCheck = {
  level: 'ok' | 'warning';
  message: string;
};

export function validateForPrint(project: CadProject): PrintCheck[] {
  const p = project.dimensions;
  const v = project.printProfile.buildVolume;
  const checks: PrintCheck[] = [];

  if (p.width > v.width || p.depth > v.depth || p.height > v.height) {
    checks.push({ level: 'warning', message: 'Part exceeds the selected printer build volume.' });
  } else {
    checks.push({ level: 'ok', message: 'Part fits inside the selected printer build volume.' });
  }

  if (Math.min(p.width, p.depth, p.height) < project.printProfile.nozzleMm * 2) {
    checks.push({ level: 'warning', message: 'One envelope dimension is very small relative to nozzle size.' });
  }

  return checks;
}
