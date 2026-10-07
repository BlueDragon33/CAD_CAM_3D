import type {
  CadFeature,
  CadProject,
  ChamferSelection,
  Dimensions,
  EdgeTopologyRef,
  FaceTopologyRef,
  FeaturePlacement,
  FilletSelection,
  PrintProfile,
  SketchConstraint,
  SketchPlaneRef,
  SketchPointRef,
  Vec3Tuple,
} from './model';
import type { SketchEntity, SketchPoint2D } from './sketch';

const PROJECT_FORMAT = 'cad-cam-3d-project';
const PROJECT_SCHEMA_VERSION = 10;
const materials = new Set<PrintProfile['material']>(['PLA', 'PETG', 'ABS', 'ASA', 'PA-CF', 'Other']);

export type ProjectDocumentV10 = {
  format: typeof PROJECT_FORMAT;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  savedAt: string;
  project: CadProject;
};

export type ProjectSaveReport = { fileName: string; byteLength: number; schemaVersion: number };
export type ProjectLoadReport = { fileName: string; schemaVersion: number; sourceSchemaVersion: number; migrated: boolean };

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

function readCapturedFeatureId(value: unknown, label: string) {
  if (value !== null && (typeof value !== 'string' || value.trim().length === 0)) throw new Error(`${label} must be null or a non-empty string.`);
  return value as string | null;
}

function readSketchPoint(value: unknown, label: string): SketchPoint2D {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return { x: readNumber(value, 'x', `${label}.x`), z: readNumber(value, 'z', `${label}.z`) };
}

function readSketchPointRef(value: unknown, label: string): SketchPointRef {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const point = readString(value, 'point', `${label}.point`);
  if (point !== 'start' && point !== 'end' && point !== 'center') throw new Error(`${label}.point must be start, end or center.`);
  return { entityId: readString(value, 'entityId', `${label}.entityId`), point };
}

function readSketchEntities(value: unknown, label: string, sourceSchemaVersion: number): SketchEntity[] {
  if (sourceSchemaVersion <= 4) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((entry, index) => {
    const entityLabel = `${label}[${index}]`;
    if (!isRecord(entry)) throw new Error(`${entityLabel} must be an object.`);
    const id = readString(entry, 'id', `${entityLabel}.id`);
    const kind = readString(entry, 'kind', `${entityLabel}.kind`);
    const construction = readBoolean(entry, 'construction', `${entityLabel}.construction`);
    if (kind === 'line') {
      return { id, kind, construction, start: readSketchPoint(entry.start, `${entityLabel}.start`), end: readSketchPoint(entry.end, `${entityLabel}.end`) };
    }
    if (kind === 'circle') {
      return { id, kind, construction, center: readSketchPoint(entry.center, `${entityLabel}.center`), radiusMm: readNumber(entry, 'radiusMm', `${entityLabel}.radiusMm`, 0.1) };
    }
    if (kind === 'arc') {
      return {
        id, kind, construction,
        center: readSketchPoint(entry.center, `${entityLabel}.center`),
        radiusMm: readNumber(entry, 'radiusMm', `${entityLabel}.radiusMm`, 0.1),
        startAngleDeg: readNumber(entry, 'startAngleDeg', `${entityLabel}.startAngleDeg`),
        endAngleDeg: readNumber(entry, 'endAngleDeg', `${entityLabel}.endAngleDeg`),
      };
    }
    throw new Error(`${entityLabel}.kind must be line, circle or arc.`);
  });
}

function readConstraints(value: unknown, label: string): SketchConstraint[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((entry, index) => {
    const constraintLabel = `${label}[${index}]`;
    if (!isRecord(entry)) throw new Error(`${constraintLabel} must be an object.`);
    const id = readString(entry, 'id', `${constraintLabel}.id`);
    const kind = readString(entry, 'kind', `${constraintLabel}.kind`);
    if (kind === 'centered') return { id, kind };
    if (kind === 'width') {
      if (entry.parameter !== 'width') throw new Error(`${constraintLabel}.parameter must be width.`);
      return { id, kind, parameter: 'width' };
    }
    if (kind === 'depth') {
      if (entry.parameter !== 'depth') throw new Error(`${constraintLabel}.parameter must be depth.`);
      return { id, kind, parameter: 'depth' };
    }
    if (kind === 'horizontal' || kind === 'vertical') {
      return { id, kind, entityId: readString(entry, 'entityId', `${constraintLabel}.entityId`) };
    }
    if (kind === 'coincident') {
      return { id, kind, first: readSketchPointRef(entry.first, `${constraintLabel}.first`), second: readSketchPointRef(entry.second, `${constraintLabel}.second`) };
    }
    if (kind === 'distance' || kind === 'radius') {
      return {
        id,
        kind,
        entityId: readString(entry, 'entityId', `${constraintLabel}.entityId`),
        valueMm: readNumber(entry, 'valueMm', `${constraintLabel}.valueMm`, 0),
      };
    }
    throw new Error(`${constraintLabel} has unsupported constraint kind ${kind}.`);
  });
}

function validateSketchConstraintReferences(entities: SketchEntity[], constraints: SketchConstraint[], label: string) {
  const entityIds = new Set(entities.map((entity) => entity.id));
  for (const constraint of constraints) {
    if (constraint.kind === 'centered' || constraint.kind === 'width' || constraint.kind === 'depth') continue;
    if (constraint.kind === 'coincident') {
      if (!entityIds.has(constraint.first.entityId) || !entityIds.has(constraint.second.entityId)) {
        throw new Error(`${label} contains a coincident constraint that references a missing sketch entity.`);
      }
      continue;
    }
    if (!entityIds.has(constraint.entityId)) throw new Error(`${label} contains a ${constraint.kind} constraint that references a missing sketch entity.`);
  }
}

function readEdgeTopologyRef(value: unknown, label: string): EdgeTopologyRef {
  if (!isRecord(value) || value.kind !== 'edge') throw new Error(`${label} must be an edge topology reference.`);
  const signature = value.signature;
  if (!isRecord(signature)) throw new Error(`${label}.signature must be an object.`);
  return {
    kind: 'edge',
    adjacentFaceLineageIds: readStringArray(value.adjacentFaceLineageIds, `${label}.adjacentFaceLineageIds`),
    capturedAfterFeatureId: readCapturedFeatureId(value.capturedAfterFeatureId, `${label}.capturedAfterFeatureId`),
    signature: {
      curveKind: readString(signature, 'curveKind', `${label}.signature.curveKind`),
      lengthMm: readNumber(signature, 'lengthMm', `${label}.signature.lengthMm`, 1e-9),
      midpoint: readTuple(signature.midpoint, `${label}.signature.midpoint`),
      start: readTuple(signature.start, `${label}.signature.start`),
      end: readTuple(signature.end, `${label}.signature.end`),
    },
  };
}

function readFaceTopologyRef(value: unknown, label: string): FaceTopologyRef {
  if (!isRecord(value) || value.kind !== 'face') throw new Error(`${label} must be a face topology reference.`);
  const signature = value.signature;
  if (!isRecord(signature)) throw new Error(`${label}.signature must be an object.`);
  return {
    kind: 'face',
    lineageIds: readStringArray(value.lineageIds, `${label}.lineageIds`),
    capturedAfterFeatureId: readCapturedFeatureId(value.capturedAfterFeatureId, `${label}.capturedAfterFeatureId`),
    signature: {
      centroid: readTuple(signature.centroid, `${label}.signature.centroid`),
      normal: readTuple(signature.normal, `${label}.signature.normal`),
      areaMm2: readNumber(signature, 'areaMm2', `${label}.signature.areaMm2`, 1e-9),
    },
  };
}

function readFaceTopologyRefs(value: unknown, label: string): FaceTopologyRef[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must contain at least one face reference.`);
  return value.map((entry, index) => readFaceTopologyRef(entry, `${label}[${index}]`));
}

function readSketchPlaneRef(value: unknown, label: string, sourceSchemaVersion: number): SketchPlaneRef {
  if (sourceSchemaVersion <= 5) return { kind: 'base-xz' };
  if (!isRecord(value)) throw new Error(`${label} must be a sketch plane reference.`);
  if (value.kind === 'base-xz') return { kind: 'base-xz' };
  if (value.kind === 'face') {
    return {
      kind: 'face',
      ref: readFaceTopologyRef(value.ref, `${label}.ref`),
      originUMm: readNumber(value, 'originUMm', `${label}.originUMm`),
      originVMm: readNumber(value, 'originVMm', `${label}.originVMm`),
    };
  }
  throw new Error(`${label}.kind must be base-xz or face.`);
}

function readPlacement(value: unknown, label: string, sourceSchemaVersion: number): FeaturePlacement {
  if (sourceSchemaVersion <= 2) return { mode: 'global-xz' };
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  if (value.mode === 'global-xz') return { mode: 'global-xz' };
  if (value.mode === 'face') {
    return {
      mode: 'face',
      ref: readFaceTopologyRef(value.ref, `${label}.ref`),
      uMm: readNumber(value, 'uMm', `${label}.uMm`),
      vMm: readNumber(value, 'vMm', `${label}.vMm`),
    };
  }
  throw new Error(`${label}.mode must be global-xz or face.`);
}

function readEdgeTreatmentSelection(value: unknown, label: string, sourceSchemaVersion: number): FilletSelection | ChamferSelection {
  if (sourceSchemaVersion === 1 && typeof value === 'string') {
    if (value !== 'outer-vertical-edges') throw new Error(`${label} contains an unsupported legacy edge selection.`);
    return { mode: 'preset', preset: 'outer-vertical-edges' };
  }
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  if (value.mode === 'preset') {
    if (value.preset !== 'outer-vertical-edges') throw new Error(`${label}.preset is unsupported.`);
    return { mode: 'preset', preset: 'outer-vertical-edges' };
  }
  if (value.mode === 'topology') return { mode: 'topology', ref: readEdgeTopologyRef(value.ref, `${label}.ref`) };
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
    if (params.profile !== 'rectangle') throw new Error(`${label} contains an unsupported sketch profile definition.`);
    const plane = readSketchPlaneRef(params.plane, `${label}.params.plane`, sourceSchemaVersion);
    const entities = readSketchEntities(params.entities, `${label}.params.entities`, sourceSchemaVersion);
    const constraints = readConstraints(params.constraints, `${label}.params.constraints`);
    validateSketchConstraintReferences(entities, constraints, `${label}.params.constraints`);
    return { id, kind, name, enabled, params: { plane, profile: 'rectangle', entities, constraints } };
  }
  if (kind === 'extrude') {
    if (params.distanceParameter !== 'height' || params.direction !== 'positive') throw new Error(`${label} contains an unsupported extrude definition.`);
    return { id, kind, name, enabled, params: { distanceParameter: 'height', direction: 'positive' } };
  }
  if (kind === 'pad') {
    if (sourceSchemaVersion < 7) throw new Error(`${label} contains Pad but schema ${sourceSchemaVersion} predates attached material features.`);
    if (params.direction !== 'normal') throw new Error(`${label}.params.direction must be normal.`);
    return { id, kind, name, enabled, params: {
      sketchId: readString(params, 'sketchId', `${label}.params.sketchId`),
      distanceMm: readNumber(params, 'distanceMm', `${label}.params.distanceMm`, 0.1),
      direction: 'normal',
    } };
  }
  if (kind === 'pocket') {
    if (sourceSchemaVersion < 7) throw new Error(`${label} contains Pocket but schema ${sourceSchemaVersion} predates attached material features.`);
    if (params.direction !== 'inward') throw new Error(`${label}.params.direction must be inward.`);
    if (params.extent !== 'distance' && params.extent !== 'through-all') throw new Error(`${label}.params.extent must be distance or through-all.`);
    return { id, kind, name, enabled, params: {
      sketchId: readString(params, 'sketchId', `${label}.params.sketchId`),
      extent: params.extent,
      distanceMm: readNumber(params, 'distanceMm', `${label}.params.distanceMm`, 0.1),
      direction: 'inward',
    } };
  }
  if (kind === 'hole') {
    if (params.through !== true) throw new Error(`${label}.params.through must be true.`);
    return { id, kind, name, enabled, params: {
      diameter: readNumber(params, 'diameter', `${label}.params.diameter`, 0.1),
      x: readNumber(params, 'x', `${label}.params.x`), z: readNumber(params, 'z', `${label}.params.z`), through: true,
      placement: readPlacement(params.placement, `${label}.params.placement`, sourceSchemaVersion),
    } };
  }
  if (kind === 'cut') {
    if (params.shape !== 'rectangle' || params.through !== true) throw new Error(`${label} contains an unsupported cut definition.`);
    return { id, kind, name, enabled, params: {
      shape: 'rectangle', width: readNumber(params, 'width', `${label}.params.width`, 0.1), depth: readNumber(params, 'depth', `${label}.params.depth`, 0.1),
      x: readNumber(params, 'x', `${label}.params.x`), z: readNumber(params, 'z', `${label}.params.z`), through: true,
      placement: readPlacement(params.placement, `${label}.params.placement`, sourceSchemaVersion),
    } };
  }
  if (kind === 'fillet') {
    return { id, kind, name, enabled, params: {
      radius: readNumber(params, 'radius', `${label}.params.radius`, 0),
      selection: readEdgeTreatmentSelection(params.selection, `${label}.params.selection`, sourceSchemaVersion) as FilletSelection,
    } };
  }
  if (kind === 'chamfer') {
    if (sourceSchemaVersion < 4) throw new Error(`${label} contains Chamfer but schema ${sourceSchemaVersion} predates Chamfer support.`);
    return { id, kind, name, enabled, params: {
      distance: readNumber(params, 'distance', `${label}.params.distance`, 0),
      selection: readEdgeTreatmentSelection(params.selection, `${label}.params.selection`, sourceSchemaVersion) as ChamferSelection,
    } };
  }
  if (kind === 'shell') {
    if (sourceSchemaVersion < 8) throw new Error(`${label} contains Shell but schema ${sourceSchemaVersion} predates Shell support.`);
    if (params.join !== 'arc') throw new Error(`${label}.params.join must be arc.`);
    return { id, kind, name, enabled, params: {
      thicknessMm: readNumber(params, 'thicknessMm', `${label}.params.thicknessMm`, 0.1),
      openings: readFaceTopologyRefs(params.openings, `${label}.params.openings`),
      join: 'arc',
    } };
  }
  if (kind === 'linear-pattern') {
    if (sourceSchemaVersion < 9) throw new Error(`${label} contains Linear Pattern but schema ${sourceSchemaVersion} predates Linear Pattern support.`);
    const axis = readString(params, 'axis', `${label}.params.axis`);
    if (axis !== 'x' && axis !== 'z' && axis !== 'u' && axis !== 'v') throw new Error(`${label}.params.axis must be x, z, u or v.`);
    const count = readNumber(params, 'count', `${label}.params.count`, 2);
    if (!Number.isInteger(count) || count > 64) throw new Error(`${label}.params.count must be an integer from 2 through 64.`);
    return { id, kind, name, enabled, params: {
      sourceFeatureId: readString(params, 'sourceFeatureId', `${label}.params.sourceFeatureId`),
      count,
      spacingMm: readNumber(params, 'spacingMm', `${label}.params.spacingMm`, 0.1),
      axis,
    } };
  }
  if (kind === 'mirror') {
    if (sourceSchemaVersion < 10) throw new Error(`${label} contains Mirror but schema ${sourceSchemaVersion} predates Mirror support.`);
    if (!isRecord(params.plane)) throw new Error(`${label}.params.plane must be an object.`);
    const planeKind = readString(params.plane, 'kind', `${label}.params.plane.kind`);
    const axis = readString(params.plane, 'axis', `${label}.params.plane.axis`);
    const offsetMm = readNumber(params.plane, 'offsetMm', `${label}.params.plane.offsetMm`);
    const plane = planeKind === 'global'
      ? (() => {
          if (axis !== 'x' && axis !== 'z') throw new Error(`${label}.params.plane.axis must be x or z for global Mirror.`);
          return { kind: 'global' as const, axis: axis as 'x' | 'z', offsetMm };
        })()
      : planeKind === 'face-local'
        ? (() => {
            if (axis !== 'u' && axis !== 'v') throw new Error(`${label}.params.plane.axis must be u or v for face-local Mirror.`);
            return { kind: 'face-local' as const, axis: axis as 'u' | 'v', offsetMm };
          })()
        : (() => { throw new Error(`${label}.params.plane.kind must be global or face-local.`); })();
    return { id, kind, name, enabled, params: {
      sourceFeatureId: readString(params, 'sourceFeatureId', `${label}.params.sourceFeatureId`),
      plane,
    } };
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

function validateFeatureReferences(features: CadFeature[]) {
  const seen = new Map<string, CadFeature>();
  for (const feature of features) {
    if (seen.has(feature.id)) throw new Error(`project.features contains duplicate feature id ${feature.id}.`);
    if (feature.kind === 'pad' || feature.kind === 'pocket') {
      const source = seen.get(feature.params.sketchId);
      if (!source || source.kind !== 'sketch') {
        throw new Error(`${feature.name} references a missing or later sketch ${feature.params.sketchId}.`);
      }
      if (source.params.plane.kind !== 'face') {
        throw new Error(`${feature.name} must reference a face-attached sketch.`);
      }
    }
    if (feature.kind === 'linear-pattern') {
      const source = seen.get(feature.params.sourceFeatureId);
      if (!source || (source.kind !== 'hole' && source.kind !== 'cut')) {
        throw new Error(`${feature.name} must reference an earlier Hole or Cut feature.`);
      }
      const faceBound = source.params.placement.mode === 'face';
      if (faceBound && feature.params.axis !== 'u' && feature.params.axis !== 'v') {
        throw new Error(`${feature.name} must use local U/V axis for a face-bound source.`);
      }
      if (!faceBound && feature.params.axis !== 'x' && feature.params.axis !== 'z') {
        throw new Error(`${feature.name} must use global X/Z axis for a global source.`);
      }
    }
    if (feature.kind === 'mirror') {
      const source = seen.get(feature.params.sourceFeatureId);
      if (!source || (source.kind !== 'hole' && source.kind !== 'cut')) {
        throw new Error(`${feature.name} must reference an earlier Hole or Cut feature.`);
      }
      const faceBound = source.params.placement.mode === 'face';
      if (faceBound && feature.params.plane.kind !== 'face-local') {
        throw new Error(`${feature.name} must use a face-local mirror plane for a face-bound source.`);
      }
      if (!faceBound && feature.params.plane.kind !== 'global') {
        throw new Error(`${feature.name} must use a global mirror plane for a global source.`);
      }
    }
    seen.set(feature.id, feature);
  }
}

function readProject(value: unknown, sourceSchemaVersion: number): CadProject {
  if (!isRecord(value)) throw new Error('project must be an object.');
  if (!Array.isArray(value.features)) throw new Error('project.features must be an array.');
  const features = value.features.map((feature, index) => readFeature(feature, index, sourceSchemaVersion));
  validateFeatureReferences(features);
  return {
    id: readString(value, 'id', 'project.id'), name: readString(value, 'name', 'project.name'),
    dimensions: readDimensions(value.dimensions, 'project.dimensions'),
    features,
    printProfile: readPrintProfile(value.printProfile),
  };
}

function safeFileName(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'cad-cam-3d-project';
}

export function serializeProject(project: CadProject): string {
  const document: ProjectDocumentV10 = { format: PROJECT_FORMAT, schemaVersion: PROJECT_SCHEMA_VERSION, savedAt: new Date().toISOString(), project };
  return JSON.stringify(document, null, 2);
}

export function parseProjectDocument(text: string): { project: CadProject; schemaVersion: number; sourceSchemaVersion: number; migrated: boolean } {
  let raw: unknown;
  try { raw = JSON.parse(text) as unknown; } catch { throw new Error('Project file is not valid JSON.'); }
  if (!isRecord(raw)) throw new Error('Project document must be an object.');
  if (raw.format !== PROJECT_FORMAT) throw new Error('This file is not a CAD_CAM_3D project document.');
  const sourceSchemaVersion = raw.schemaVersion;
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, PROJECT_SCHEMA_VERSION].includes(sourceSchemaVersion as number)) {
    throw new Error(`Unsupported project schema version ${String(sourceSchemaVersion)}. Supported versions are 1 through ${PROJECT_SCHEMA_VERSION}.`);
  }
  return {
    project: readProject(raw.project, sourceSchemaVersion as number), schemaVersion: PROJECT_SCHEMA_VERSION,
    sourceSchemaVersion: sourceSchemaVersion as number, migrated: sourceSchemaVersion !== PROJECT_SCHEMA_VERSION,
  };
}

export function downloadProjectFile(project: CadProject): ProjectSaveReport {
  const text = serializeProject(project);
  const blob = new Blob([text], { type: 'application/json' });
  const fileName = `${safeFileName(project.name)}.cad3d.json`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.style.display = 'none';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { fileName, byteLength: blob.size, schemaVersion: PROJECT_SCHEMA_VERSION };
}

export async function loadProjectFile(file: File): Promise<{ project: CadProject; report: ProjectLoadReport }> {
  const parsed = parseProjectDocument(await file.text());
  return { project: parsed.project, report: {
    fileName: file.name, schemaVersion: parsed.schemaVersion, sourceSchemaVersion: parsed.sourceSchemaVersion, migrated: parsed.migrated,
  } };
}
