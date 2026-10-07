import type { SketchEntity } from './sketch';

export type FeatureKind = 'sketch' | 'datum-axis' | 'extrude' | 'pad' | 'pocket' | 'revolve' | 'cut' | 'hole' | 'fillet' | 'chamfer' | 'shell' | 'linear-pattern' | 'mirror';

export type Dimensions = {
  width: number;
  depth: number;
  height: number;
};

export type Vec3Tuple = [number, number, number];

/** Persisted application-level reference to an exact B-Rep edge. */
export type EdgeTopologyRef = {
  kind: 'edge';
  adjacentFaceLineageIds: string[];
  capturedAfterFeatureId: string | null;
  signature: {
    curveKind: string;
    lengthMm: number;
    midpoint: Vec3Tuple;
    start: Vec3Tuple;
    end: Vec3Tuple;
  };
};

/** Persisted application-level reference to an exact B-Rep face. */
export type FaceTopologyRef = {
  kind: 'face';
  lineageIds: string[];
  capturedAfterFeatureId: string | null;
  signature: {
    centroid: Vec3Tuple;
    normal: Vec3Tuple;
    areaMm2: number;
  };
};

/**
 * Durable sketch-plane attachment. Entity x/z coordinates remain the persisted
 * local 2D sketch coordinates; on a face-attached sketch they mean U/V offsets
 * relative to the captured sketch origin.
 */
export type SketchPlaneRef =
  | { kind: 'base-xz' }
  | {
      kind: 'face';
      ref: FaceTopologyRef;
      originUMm: number;
      originVMm: number;
    };

export type EdgeTreatmentSelection =
  | { mode: 'preset'; preset: 'outer-vertical-edges' }
  | { mode: 'topology'; ref: EdgeTopologyRef };

export type FilletSelection = EdgeTreatmentSelection;
export type ChamferSelection = EdgeTreatmentSelection;

export type FeaturePlacement =
  | { mode: 'global-xz' }
  | { mode: 'face'; ref: FaceTopologyRef; uMm: number; vMm: number };

export type SketchPointRef = {
  entityId: string;
  point: 'start' | 'end' | 'center';
};

export type SketchConstraint =
  | { id: string; kind: 'centered' }
  | { id: string; kind: 'width'; parameter: 'width' }
  | { id: string; kind: 'depth'; parameter: 'depth' }
  | { id: string; kind: 'horizontal' | 'vertical'; entityId: string }
  | { id: string; kind: 'coincident'; first: SketchPointRef; second: SketchPointRef }
  | { id: string; kind: 'distance' | 'radius'; entityId: string; valueMm: number };

type FeatureBase<K extends FeatureKind, P> = {
  id: string;
  kind: K;
  name: string;
  enabled: boolean;
  params: P;
};

export type SketchFeature = FeatureBase<'sketch', {
  plane: SketchPlaneRef;
  profile: 'rectangle';
  /**
   * General sketch entities currently act as persisted construction geometry
   * around the legacy parametric rectangle profile. They are intentionally in
   * CadProject now so the interactive sketcher can evolve without creating a
   * second, disposable geometry model.
   */
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}>;

export type ExtrudeFeature = FeatureBase<'extrude', {
  distanceParameter: 'height';
  direction: 'positive';
}>;

export type PadFeature = FeatureBase<'pad', {
  sketchId: string;
  distanceMm: number;
  direction: 'normal';
}>;

export type PocketFeature = FeatureBase<'pocket', {
  sketchId: string;
  extent: 'distance' | 'through-all';
  distanceMm: number;
  direction: 'inward';
}>;

export type CutFeature = FeatureBase<'cut', {
  shape: 'rectangle';
  width: number;
  depth: number;
  x: number;
  z: number;
  through: true;
  placement: FeaturePlacement;
}>;

export type HoleFeature = FeatureBase<'hole', {
  diameter: number;
  x: number;
  z: number;
  through: true;
  placement: FeaturePlacement;
}>;

export type FilletFeature = FeatureBase<'fillet', {
  radius: number;
  selection: FilletSelection;
}>;

export type ChamferFeature = FeatureBase<'chamfer', {
  distance: number;
  selection: ChamferSelection;
}>;

export type ShellFeature = FeatureBase<'shell', {
  thicknessMm: number;
  openings: FaceTopologyRef[];
  join: 'arc';
}>;

export type DatumAxisFeature = FeatureBase<'datum-axis', {
  source:
    | { kind: 'base-xz'; sketchId: string; axis: 'x' | 'z'; offsetMm: number }
    | { kind: 'sketch-local'; sketchId: string; axis: 'u' | 'v'; offsetMm: number };
}>;

export type RevolveFeature = FeatureBase<'revolve', {
  sketchId: string;
  axisId: string;
  angleDeg: number;
  operation: 'add';
}>;

export type LinearPatternFeature = FeatureBase<'linear-pattern', {
  sourceFeatureId: string;
  count: number;
  spacingMm: number;
  axis: 'x' | 'z' | 'u' | 'v';
}>;

export type MirrorFeature = FeatureBase<'mirror', {
  sourceFeatureId: string;
  plane:
    | { kind: 'global'; axis: 'x' | 'z'; offsetMm: number }
    | { kind: 'face-local'; axis: 'u' | 'v'; offsetMm: number };
}>;

export type CadFeature = SketchFeature | DatumAxisFeature | ExtrudeFeature | PadFeature | PocketFeature | RevolveFeature | CutFeature | HoleFeature | FilletFeature | ChamferFeature | ShellFeature | LinearPatternFeature | MirrorFeature;

export type PrintProfile = {
  name: string;
  buildVolume: Dimensions;
  nozzleMm: number;
  material: 'PLA' | 'PETG' | 'ABS' | 'ASA' | 'PA-CF' | 'Other';
};

export type CadProject = {
  id: string;
  name: string;
  /** Named master parameters used by parametric features. */
  dimensions: Dimensions;
  features: CadFeature[];
  printProfile: PrintProfile;
};

function featureName(kind: FeatureKind, project: CadProject) {
  const count = project.features.filter((feature) => feature.kind === kind).length + 1;
  const label: Record<FeatureKind, string> = {
    sketch: 'Sketch',
    'datum-axis': 'Datum Axis',
    extrude: 'Extrude',
    pad: 'Pad',
    pocket: 'Pocket',
    revolve: 'Revolve',
    cut: 'Cut',
    hole: 'Hole',
    fillet: 'Fillet',
    chamfer: 'Chamfer',
    shell: 'Shell',
    'linear-pattern': 'Linear Pattern',
    mirror: 'Mirror',
  };
  return `${label[kind]} ${count}`;
}

export function createFeature(kind: FeatureKind, project: CadProject): CadFeature {
  const base = {
    id: crypto.randomUUID(),
    name: featureName(kind, project),
    enabled: true,
  };

  if (kind === 'sketch') {
    return {
      ...base,
      kind,
      params: {
        plane: { kind: 'base-xz' },
        profile: 'rectangle',
        entities: [],
        constraints: [
          { id: crypto.randomUUID(), kind: 'centered' },
          { id: crypto.randomUUID(), kind: 'width', parameter: 'width' },
          { id: crypto.randomUUID(), kind: 'depth', parameter: 'depth' },
        ],
      },
    };
  }

  if (kind === 'datum-axis') {
    const sourceSketch = [...project.features].reverse().find((feature) => feature.kind === 'sketch');
    const source = sourceSketch?.params.plane.kind === 'face'
      ? { kind: 'sketch-local' as const, sketchId: sourceSketch.id, axis: 'u' as const, offsetMm: 0 }
      : { kind: 'base-xz' as const, sketchId: sourceSketch?.id ?? '', axis: 'x' as const, offsetMm: 0 };
    return { ...base, kind, params: { source } };
  }

  if (kind === 'extrude') {
    return { ...base, kind, params: { distanceParameter: 'height', direction: 'positive' } };
  }

  if (kind === 'pad') {
    const sourceSketch = [...project.features].reverse().find((feature) => feature.kind === 'sketch');
    return { ...base, kind, params: { sketchId: sourceSketch?.id ?? '', distanceMm: 5, direction: 'normal' } };
  }

  if (kind === 'pocket') {
    const sourceSketch = [...project.features].reverse().find((feature) => feature.kind === 'sketch');
    return { ...base, kind, params: { sketchId: sourceSketch?.id ?? '', extent: 'distance', distanceMm: 5, direction: 'inward' } };
  }

  if (kind === 'revolve') {
    const sourceSketch = [...project.features].reverse().find((feature) => feature.kind === 'sketch' && feature.params.plane.kind === 'face');
    const sourceAxis = [...project.features].reverse().find((feature) => (
      feature.kind === 'datum-axis'
      && feature.params.source.kind === 'sketch-local'
      && feature.params.source.sketchId === sourceSketch?.id
    ));
    return { ...base, kind, params: { sketchId: sourceSketch?.id ?? '', axisId: sourceAxis?.id ?? '', angleDeg: 360, operation: 'add' } };
  }

  if (kind === 'hole') {
    return { ...base, kind, params: { diameter: 4, x: 0, z: 0, through: true, placement: { mode: 'global-xz' } } };
  }

  if (kind === 'cut') {
    return { ...base, kind, params: { shape: 'rectangle', width: 12, depth: 8, x: 0, z: 0, through: true, placement: { mode: 'global-xz' } } };
  }

  if (kind === 'fillet') {
    return {
      ...base,
      kind,
      params: {
        radius: 2,
        selection: { mode: 'preset', preset: 'outer-vertical-edges' },
      },
    };
  }

  if (kind === 'chamfer') {
    return {
      ...base,
      kind,
      params: {
        distance: 1.5,
        selection: { mode: 'preset', preset: 'outer-vertical-edges' },
      },
    };
  }

  if (kind === 'shell') {
    return {
      ...base,
      kind,
      params: {
        thicknessMm: 2,
        openings: [],
        join: 'arc',
      },
    };
  }

  const source = [...project.features].reverse().find((feature) => feature.kind === 'hole' || feature.kind === 'cut');
  const faceBound = source && (source.kind === 'hole' || source.kind === 'cut') && source.params.placement.mode === 'face';
  if (kind === 'linear-pattern') {
    return {
      ...base,
      kind,
      params: {
        sourceFeatureId: source?.id ?? '',
        count: 3,
        spacingMm: 10,
        axis: faceBound ? 'u' : 'x',
      },
    };
  }

  return {
    ...base,
    kind: 'mirror',
    params: {
      sourceFeatureId: source?.id ?? '',
      plane: faceBound
        ? { kind: 'face-local', axis: 'u', offsetMm: 0 }
        : { kind: 'global', axis: 'x', offsetMm: 0 },
    },
  };
}

export function createDefaultProject(): CadProject {
  const project: CadProject = {
    id: crypto.randomUUID(),
    name: 'Small printed part',
    dimensions: { width: 60, depth: 40, height: 12 },
    features: [],
    printProfile: {
      name: 'Desktop FDM 256',
      buildVolume: { width: 256, depth: 256, height: 256 },
      nozzleMm: 0.4,
      material: 'PETG',
    },
  };

  project.features.push(createFeature('sketch', project));
  project.features.push(createFeature('extrude', project));
  return project;
}
