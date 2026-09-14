import type {
  CadFeature,
  CadProject,
  Dimensions,
  PrintProfile,
  SketchConstraint,
} from './model';

const PROJECT_FORMAT = 'cad-cam-3d-project';
const PROJECT_SCHEMA_VERSION = 1;
const materials = new Set<PrintProfile['material']>(['PLA', 'PETG', 'ABS', 'ASA', 'PA-CF', 'Other']);

export type ProjectDocumentV1 = {
  format: typeof PROJECT_FORMAT;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  savedAt: string;
  project: CadProject;
};

export type ProjectSaveReport = {
  fileName: string;
  byteLength: number;
  schemaVersion: number;
};

export type ProjectLoadReport = {
  fileName: string;
  schemaVersion: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function readBoolean(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`);
  return value;
}

function readNumber(record: Record<string, unknown>, key: string, label: string, minimum?: number) {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  if (minimum !== undefined && value < minimum) throw new Error(`${label} must be >= ${minimum}.`);
  return value;
}

function readDimensions(value: unknown, label: string): Dimensions {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return {
    width: readNumber(value, 'width', `${label}.width`, 0.1),
    depth: readNumber(value, 'depth', `${label}.depth`, 0.1),
    height: readNumber(value, 'height', `${label}.height`, 0.1),
  };
}

function readConstraints(value: unknown, label: string): SketchConstraint[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`${label}[${index}] must be an object.`);
    const id = readString(entry, 'id', `${label}[${index}].id`);
    const kind = readString(entry, 'kind', `${label}[${index}].kind`);
    if (kind === 'centered') return { id, kind };
    if (kind === 'width') {
      if (entry.parameter !== 'width') throw new Error(`${label}[${index}].parameter must be width.`);
      return { id, kind, parameter: 'width' };
    }
    if (kind === 'depth') {
      if (entry.parameter !== 'depth') throw new Error(`${label}[${index}].parameter must be depth.`);
      return { id, kind, parameter: 'depth' };
    }
    throw new Error(`${label}[${index}] has unsupported constraint kind ${kind}.`);
  });
}

function readFeature(value: unknown, index: number): CadFeature {
  const label = `project.features[${index}]`;
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const id = readString(value, 'id', `${label}.id`);
  const kind = readString(value, 'kind', `${label}.kind`);
  const name = readString(value, 'name', `${label}.name`);
  const enabled = readBoolean(value, 'enabled', `${label}.enabled`);
  const params = value.params;
  if (!isRecord(params)) throw new Error(`${label}.params must be an object.`);

  if (kind === 'sketch') {
    if (params.plane !== 'XZ' || params.profile !== 'rectangle') throw new Error(`${label} contains an unsupported sketch definition.`);
    return {
      id,
      kind,
      name,
      enabled,
      params: {
        plane: 'XZ',
        profile: 'rectangle',
        constraints: readConstraints(params.constraints, `${label}.params.constraints`),
      },
    };
  }

  if (kind === 'extrude') {
    if (params.distanceParameter !== 'height' || params.direction !== 'positive') throw new Error(`${label} contains an unsupported extrude definition.`);
    return { id, kind, name, enabled, params: { distanceParameter: 'height', direction: 'positive' } };
  }

  if (kind === 'hole') {
    if (params.through !== true) throw new Error(`${label}.params.through must be true.`);
    return {
      id,
      kind,
      name,
      enabled,
      params: {
        diameter: readNumber(params, 'diameter', `${label}.params.diameter`, 0.1),
        x: readNumber(params, 'x', `${label}.params.x`),
        z: readNumber(params, 'z', `${label}.params.z`),
        through: true,
      },
    };
  }

  if (kind === 'cut') {
    if (params.shape !== 'rectangle' || params.through !== true) throw new Error(`${label} contains an unsupported cut definition.`);
    return {
      id,
      kind,
      name,
      enabled,
      params: {
        shape: 'rectangle',
        width: readNumber(params, 'width', `${label}.params.width`, 0.1),
        depth: readNumber(params, 'depth', `${label}.params.depth`, 0.1),
        x: readNumber(params, 'x', `${label}.params.x`),
        z: readNumber(params, 'z', `${label}.params.z`),
        through: true,
      },
    };
  }

  if (kind === 'fillet') {
    if (params.selection !== 'outer-vertical-edges') throw new Error(`${label} contains an unsupported fillet selection.`);
    return {
      id,
      kind,
      name,
      enabled,
      params: {
        radius: readNumber(params, 'radius', `${label}.params.radius`, 0),
        selection: 'outer-vertical-edges',
      },
    };
  }

  throw new Error(`${label} has unsupported feature kind ${kind}.`);
}

function readPrintProfile(value: unknown): PrintProfile {
  if (!isRecord(value)) throw new Error('project.printProfile must be an object.');
  const material = readString(value, 'material', 'project.printProfile.material');
  if (!materials.has(material as PrintProfile['material'])) throw new Error(`Unsupported print material ${material}.`);
  return {
    name: readString(value, 'name', 'project.printProfile.name'),
    buildVolume: readDimensions(value.buildVolume, 'project.printProfile.buildVolume'),
    nozzleMm: readNumber(value, 'nozzleMm', 'project.printProfile.nozzleMm', 0.1),
    material: material as PrintProfile['material'],
  };
}

function readProject(value: unknown): CadProject {
  if (!isRecord(value)) throw new Error('project must be an object.');
  if (!Array.isArray(value.features)) throw new Error('project.features must be an array.');
  return {
    id: readString(value, 'id', 'project.id'),
    name: readString(value, 'name', 'project.name'),
    dimensions: readDimensions(value.dimensions, 'project.dimensions'),
    features: value.features.map(readFeature),
    printProfile: readPrintProfile(value.printProfile),
  };
}

function safeFileName(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'cad-cam-3d-project';
}

export function serializeProject(project: CadProject): string {
  const document: ProjectDocumentV1 = {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    project,
  };
  return JSON.stringify(document, null, 2);
}

export function parseProjectDocument(text: string): { project: CadProject; schemaVersion: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Project file is not valid JSON.');
  }

  if (!isRecord(raw)) throw new Error('Project document must be an object.');
  if (raw.format !== PROJECT_FORMAT) throw new Error('This file is not a CAD_CAM_3D project document.');
  if (raw.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Unsupported project schema version ${String(raw.schemaVersion)}. Expected ${PROJECT_SCHEMA_VERSION}.`);
  }

  return {
    project: readProject(raw.project),
    schemaVersion: PROJECT_SCHEMA_VERSION,
  };
}

export function downloadProjectFile(project: CadProject): ProjectSaveReport {
  const text = serializeProject(project);
  const blob = new Blob([text], { type: 'application/json' });
  const fileName = `${safeFileName(project.name)}.cad3d.json`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { fileName, byteLength: blob.size, schemaVersion: PROJECT_SCHEMA_VERSION };
}

export async function loadProjectFile(file: File): Promise<{ project: CadProject; report: ProjectLoadReport }> {
  const text = await file.text();
  const parsed = parseProjectDocument(text);
  return {
    project: parsed.project,
    report: {
      fileName: file.name,
      schemaVersion: parsed.schemaVersion,
    },
  };
}
