export type FeatureKind = 'sketch' | 'extrude' | 'cut' | 'hole' | 'fillet';

export type Dimensions = {
  width: number;
  depth: number;
  height: number;
};

export type SketchConstraint =
  | { id: string; kind: 'centered' }
  | { id: string; kind: 'width'; parameter: 'width' }
  | { id: string; kind: 'depth'; parameter: 'depth' };

type FeatureBase<K extends FeatureKind, P> = {
  id: string;
  kind: K;
  name: string;
  enabled: boolean;
  params: P;
};

export type SketchFeature = FeatureBase<'sketch', {
  plane: 'XZ';
  profile: 'rectangle';
  constraints: SketchConstraint[];
}>;

export type ExtrudeFeature = FeatureBase<'extrude', {
  distanceParameter: 'height';
  direction: 'positive';
}>;

export type CutFeature = FeatureBase<'cut', {
  shape: 'rectangle';
  width: number;
  depth: number;
  x: number;
  z: number;
  through: true;
}>;

export type HoleFeature = FeatureBase<'hole', {
  diameter: number;
  x: number;
  z: number;
  through: true;
}>;

export type FilletFeature = FeatureBase<'fillet', {
  radius: number;
  selection: 'outer-vertical-edges';
}>;

export type CadFeature = SketchFeature | ExtrudeFeature | CutFeature | HoleFeature | FilletFeature;

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
    extrude: 'Extrude',
    cut: 'Cut',
    hole: 'Hole',
    fillet: 'Fillet',
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
        plane: 'XZ',
        profile: 'rectangle',
        constraints: [
          { id: crypto.randomUUID(), kind: 'centered' },
          { id: crypto.randomUUID(), kind: 'width', parameter: 'width' },
          { id: crypto.randomUUID(), kind: 'depth', parameter: 'depth' },
        ],
      },
    };
  }

  if (kind === 'extrude') {
    return { ...base, kind, params: { distanceParameter: 'height', direction: 'positive' } };
  }

  if (kind === 'hole') {
    return { ...base, kind, params: { diameter: 4, x: 0, z: 0, through: true } };
  }

  if (kind === 'cut') {
    return { ...base, kind, params: { shape: 'rectangle', width: 12, depth: 8, x: 0, z: 0, through: true } };
  }

  return { ...base, kind: 'fillet', params: { radius: 2, selection: 'outer-vertical-edges' } };
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
