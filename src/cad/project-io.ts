import type {
  CadFeature,
  CadProject,
  Dimensions,
  EdgeTopologyRef,
  FilletSelection,
  PrintProfile,
  SketchConstraint,
  Vec3Tuple,
} from './model';

const PROJECT_FORMAT = 'cad-cam-3d-project';
const PROJECT_SCHEMA_VERSION = 2;
const materials = new Set<PrintProfile['material']>(['PLA', 'PETG', 'ABS', 'ASA', 'PA-CF', 'Other']);

export type ProjectDocumentV2 = {
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
  sourceSchemaVersion: number;
  migrated: boolean;
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

function readTuple(value: unknown, label: string): Vec3Tuple {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must be a three-number tuple.`);
  const result = value.map((entry) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) throw new Error(`${label} must contain finite numbers.`);
    return entry;
  });
  return [result[0], result[1], result[2]];
}

function readStringArray(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const result = value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) throw new Error(`${label}[${index}] must be a non-empty string.`);
    return entry;
  });
  return [...new Set(result)].sort();
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

function readEdgeTopologyRef(value: unknown, label: string): EdgeTopologyRef {
  if (!isRecord(value) || value.kind !== 'edge') throw new Error(`${label} must be an edge topology reference.`);
  const signature = value.signature;
  if (!isRecord(signature)) throw new Error(`${label}.signature must be an object.`);
  const captured = value.capturedAfterFeatureId;
  if (captured !== null && (typeof captured !== 'string' || captured.trim().length === 0)) {
    throw new Error(`${label}.capturedAfterFeatureId must be null or a non-empty string.`);
  }
  return {
    kind: 'edge',
    adjacentFaceLineageIds: readStringArray(value.adjacentFaceLineageIds, `${label}.adjacentFaceLineageIds`),
    capturedAfterFeatureId: captured as string | null,
    signature: {
      curveKind: readString(signature, 'curveKind', `${label}.signature.curveKind`),
      lengthMm: readNumber(signature, 'lengthMm', `${label}.signature.lengthMm`, 1e-9),
      midpoint: readTuple(signature.midpoint, `${label}.signature.midpoint`),
      start: readTuple(signature.start, `${label}.signature.start`),
      end: readTuple(signature.end, `${label}.signature.end`),
    },
  };
}

function readFilletSelection(value: unknown, label: string, sourceSchemaVersion: number): FilletSelection {
  if (sourceSchemaVersion === 1) {
    if (value !== 'outer-vertical-edges') throw new Error(`${label} contains an unsupported legacy fillet selection.`);
    return { mode: 'preset', preset: 'outer-vertical-edges' };
  }

  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  if (value.mode === 'preset') {
    if (value.preset !== 'outer-vertical-edges') throw new Error(`${label}.preset is unsupported.`);
    return { mode: 'preset', preset: 'outer-vertical-edges' };
  }
  if (value.mode === 'topology') {
    return { mode: 'topology', ref: readEdgeTopologyRef(value.ref, `${label}.ref`) };
  }
  throw new Error(`${label}.mode must be preset or topology.`);
}

function readFeature(value: unknown, index: number, sourceSchemaVersion: number): CadFeature {
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
    return {
      id,
      kind,
      name,
      enabled,
      params: {
        radius: readNumber(params, 'radius', `${label}.params.radius`, 0),
        selection: readFilletSelection(params.selection, `${label}.params.selection`, sourceSchemaVersion),
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

function readProject(value: unknown, sourceSchemaVersion: number): CadProject {
  if (!isRecord(value)) throw new Error('project must be an object.');
  if (!Array.isArray(value.features)) throw new Error('project.features must be an array.');
  return {
    id: readString(value, 'id', 'project.id'),
    name: readString(value, 'name', 'project.name'),
    dimensions: readDimensions(value.dimensions, 'project.dimensions'),
    features: value.features.map((feature, index) => readFeature(feature, index, sourceSchemaVersion)),
    printProfile: readPrintProfile(value.printProfile),
  };
}

function safeFileName(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'cad-cam-3d-project';
}

export function serializeProject(project: CadProject): string {
  const document: ProjectDocumentV2 = {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    project,
  };
  return JSON.stringify(document, null, 2);
}

export function parseProjectDocument(text: string): {
  project: CadProject;
  schemaVersion: number;
  sourceSchemaVersion: number;
  migrated: boolean;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Project file is not valid JSON.');
  }

  if (!isRecord(raw)) throw new Error('Project document must be an object.');
  if (raw.format !== PROJECT_FORMAT) throw new Error('This file is not a CAD_CAM_3D project document.');
  const sourceSchemaVersion = raw.schemaVersion;
  if (sourceSchemaVersion !== 1 && sourceSchemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Unsupported project schema version ${String(sourceSchemaVersion)}. Supported versions are 1 and ${PROJECT_SCHEMA_VERSION}.`);
  }

  return {
    project: readProject(raw.project, sourceSchemaVersion),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    sourceSchemaVersion,
    migrated: sourceSchemaVersion !== PROJECT_SCHEMA_VERSION,
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
      sourceSchemaVersion: parsed.sourceSchemaVersion,
      migrated: parsed.migrated,
    },
  };
}
