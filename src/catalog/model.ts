export type ComponentCategory =
  | 'electronics-board'
  | 'motor'
  | 'servo'
  | 'bearing'
  | 'battery'
  | 'fastener'
  | 'tube'
  | 'sensor'
  | 'camera'
  | 'lidar'
  | 'antenna'
  | 'connector'
  | 'other';

export type ComponentEnvelope = {
  widthMm: number;
  depthMm: number;
  heightMm: number;
};

export type ComponentPoint3 = {
  xMm: number;
  yMm: number;
  zMm: number;
};

export type MountingHole = {
  id: string;
  center: ComponentPoint3;
  diameterMm: number;
  axis: 'x' | 'y' | 'z';
  through: boolean;
  fastener?: string;
};

export type ClearanceVolume = {
  id: string;
  kind: 'keep-out' | 'connector' | 'cable';
  center: ComponentPoint3;
  size: ComponentEnvelope;
  note?: string;
};

export type ComponentProvenance = {
  sourceType: 'manufacturer-datasheet' | 'manufacturer-cad' | 'user-measured' | 'organization-verified' | 'synthetic-test';
  sourceName: string;
  sourceRevision?: string;
  sourceUrl?: string;
  checkedAt?: string;
};

export type ComponentDefinition = {
  schemaVersion: 1;
  id: string;
  revision: string;
  name: string;
  manufacturer?: string;
  partNumber?: string;
  category: ComponentCategory;
  envelope: ComponentEnvelope;
  mountingHoles: MountingHole[];
  clearances: ClearanceVolume[];
  massG?: number;
  compatibleFasteners?: string[];
  tags?: string[];
  provenance: ComponentProvenance;
};

export type ComponentReference = {
  componentId: string;
  componentRevision: string;
  providerId: string;
};

export type ComponentCatalogQuery = {
  text?: string;
  category?: ComponentCategory;
  manufacturer?: string;
  tags?: string[];
};

export interface ComponentCatalogProvider {
  readonly id: string;
  readonly label: string;
  readonly kind: 'local' | 'organization' | 'remote';
  readonly offlineAvailable: boolean;
  search(query?: ComponentCatalogQuery): Promise<ComponentDefinition[]>;
  get(componentId: string, revision?: string): Promise<ComponentDefinition | null>;
}

const categories = new Set<ComponentCategory>([
  'electronics-board', 'motor', 'servo', 'bearing', 'battery', 'fastener',
  'tube', 'sensor', 'camera', 'lidar', 'antenna', 'connector', 'other',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string, path: string) {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(path + '.' + key + ' must be a non-empty string.');
  return value;
}

function positiveNumber(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(path + ' must be a finite positive number.');
  return value;
}

function finiteNumber(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(path + ' must be a finite number.');
  return value;
}

function readPoint(value: unknown, path: string): ComponentPoint3 {
  if (!isRecord(value)) throw new Error(path + ' must be an object.');
  return {
    xMm: finiteNumber(value.xMm, path + '.xMm'),
    yMm: finiteNumber(value.yMm, path + '.yMm'),
    zMm: finiteNumber(value.zMm, path + '.zMm'),
  };
}

function readEnvelope(value: unknown, path: string): ComponentEnvelope {
  if (!isRecord(value)) throw new Error(path + ' must be an object.');
  return {
    widthMm: positiveNumber(value.widthMm, path + '.widthMm'),
    depthMm: positiveNumber(value.depthMm, path + '.depthMm'),
    heightMm: positiveNumber(value.heightMm, path + '.heightMm'),
  };
}

function optionalStringArray(value: unknown, path: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim() !== '')) {
    throw new Error(path + ' must be an array of non-empty strings.');
  }
  return [...new Set(value as string[])];
}

export function validateComponentDefinition(value: unknown): ComponentDefinition {
  if (!isRecord(value)) throw new Error('component must be an object.');
  if (value.schemaVersion !== 1) throw new Error('component.schemaVersion must be 1.');

  const category = value.category;
  if (typeof category !== 'string' || !categories.has(category as ComponentCategory)) {
    throw new Error('component.category is unsupported.');
  }

  if (!Array.isArray(value.mountingHoles)) throw new Error('component.mountingHoles must be an array.');
  const mountingHoles = value.mountingHoles.map((hole, index): MountingHole => {
    const path = 'component.mountingHoles[' + index + ']';
    if (!isRecord(hole)) throw new Error(path + ' must be an object.');
    const axis = hole.axis;
    if (axis !== 'x' && axis !== 'y' && axis !== 'z') throw new Error(path + '.axis must be x, y or z.');
    if (typeof hole.through !== 'boolean') throw new Error(path + '.through must be boolean.');
    return {
      id: stringField(hole, 'id', path),
      center: readPoint(hole.center, path + '.center'),
      diameterMm: positiveNumber(hole.diameterMm, path + '.diameterMm'),
      axis,
      through: hole.through,
      fastener: hole.fastener === undefined ? undefined : stringField(hole, 'fastener', path),
    };
  });
  if (new Set(mountingHoles.map((hole) => hole.id)).size !== mountingHoles.length) {
    throw new Error('component.mountingHoles contains duplicate ids.');
  }

  if (!Array.isArray(value.clearances)) throw new Error('component.clearances must be an array.');
  const clearances = value.clearances.map((clearance, index): ClearanceVolume => {
    const path = 'component.clearances[' + index + ']';
    if (!isRecord(clearance)) throw new Error(path + ' must be an object.');
    const kind = clearance.kind;
    if (kind !== 'keep-out' && kind !== 'connector' && kind !== 'cable') throw new Error(path + '.kind is unsupported.');
    return {
      id: stringField(clearance, 'id', path),
      kind,
      center: readPoint(clearance.center, path + '.center'),
      size: readEnvelope(clearance.size, path + '.size'),
      note: clearance.note === undefined ? undefined : stringField(clearance, 'note', path),
    };
  });
  if (new Set(clearances.map((entry) => entry.id)).size !== clearances.length) {
    throw new Error('component.clearances contains duplicate ids.');
  }

  if (!isRecord(value.provenance)) throw new Error('component.provenance must be an object.');
  const sourceType = value.provenance.sourceType;
  const provenanceTypes = new Set(['manufacturer-datasheet', 'manufacturer-cad', 'user-measured', 'organization-verified', 'synthetic-test']);
  if (typeof sourceType !== 'string' || !provenanceTypes.has(sourceType)) throw new Error('component.provenance.sourceType is unsupported.');

  const massG = value.massG === undefined ? undefined : positiveNumber(value.massG, 'component.massG');
  const result: ComponentDefinition = {
    schemaVersion: 1,
    id: stringField(value, 'id', 'component'),
    revision: stringField(value, 'revision', 'component'),
    name: stringField(value, 'name', 'component'),
    manufacturer: value.manufacturer === undefined ? undefined : stringField(value, 'manufacturer', 'component'),
    partNumber: value.partNumber === undefined ? undefined : stringField(value, 'partNumber', 'component'),
    category: category as ComponentCategory,
    envelope: readEnvelope(value.envelope, 'component.envelope'),
    mountingHoles,
    clearances,
    massG,
    compatibleFasteners: optionalStringArray(value.compatibleFasteners, 'component.compatibleFasteners'),
    tags: optionalStringArray(value.tags, 'component.tags'),
    provenance: {
      sourceType: sourceType as ComponentProvenance['sourceType'],
      sourceName: stringField(value.provenance, 'sourceName', 'component.provenance'),
      sourceRevision: value.provenance.sourceRevision === undefined ? undefined : stringField(value.provenance, 'sourceRevision', 'component.provenance'),
      sourceUrl: value.provenance.sourceUrl === undefined ? undefined : stringField(value.provenance, 'sourceUrl', 'component.provenance'),
      checkedAt: value.provenance.checkedAt === undefined ? undefined : stringField(value.provenance, 'checkedAt', 'component.provenance'),
    },
  };
  return result;
}
