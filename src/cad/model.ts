export type FeatureKind = 'sketch' | 'extrude' | 'hole' | 'fillet';

export type CadFeature = {
  id: string;
  kind: FeatureKind;
  name: string;
  enabled: boolean;
};

export type Dimensions = {
  width: number;
  depth: number;
  height: number;
};

export type PrintProfile = {
  name: string;
  buildVolume: Dimensions;
  nozzleMm: number;
  material: 'PLA' | 'PETG' | 'ABS' | 'ASA' | 'PA-CF' | 'Other';
};

export type CadProject = {
  id: string;
  name: string;
  dimensions: Dimensions;
  features: CadFeature[];
  printProfile: PrintProfile;
};

export function createDefaultProject(): CadProject {
  return {
    id: crypto.randomUUID(),
    name: 'Small printed part',
    dimensions: { width: 60, depth: 40, height: 12 },
    features: [
      { id: crypto.randomUUID(), kind: 'sketch', name: 'Sketch 1', enabled: true },
      { id: crypto.randomUUID(), kind: 'extrude', name: 'Extrude 1', enabled: true },
    ],
    printProfile: {
      name: 'Desktop FDM 256',
      buildVolume: { width: 256, depth: 256, height: 256 },
      nozzleMm: 0.4,
      material: 'PETG',
    },
  };
}
