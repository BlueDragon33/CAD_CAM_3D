import type { CadProject } from './model';
import { buildPartGeometry, type PartGeometryBuild } from './geometry';

export type CadKernelCapabilities = {
  exactBrep: boolean;
  editableTopology: boolean;
  meshPreview: boolean;
  stlExport: boolean;
  stepExport: boolean;
  exactFillet: boolean;
  exactChamfer: boolean;
  shell: boolean;
};

export type CadKernel = {
  id: string;
  label: string;
  kind: 'mesh-mvp' | 'exact-brep';
  capabilities: CadKernelCapabilities;
  buildMesh(project: CadProject): PartGeometryBuild;
};

/**
 * Current deterministic kernel adapter.
 *
 * It deliberately exposes only the capabilities that are actually implemented.
 * The rest of the application consumes this contract instead of importing the
 * Three.js geometry builder directly, so an OpenCascade/WASM B-Rep adapter can
 * replace it without rewriting the viewport, export pipeline or AI planner.
 */
export const meshMvpKernel: CadKernel = {
  id: 'mesh-mvp-v1',
  label: 'Mesh MVP kernel',
  kind: 'mesh-mvp',
  capabilities: {
    exactBrep: false,
    editableTopology: false,
    meshPreview: true,
    stlExport: true,
    stepExport: false,
    exactFillet: false,
    exactChamfer: false,
    shell: false,
  },
  buildMesh(project) {
    return buildPartGeometry(project);
  },
};

/**
 * Single application-level kernel binding. Future kernel selection can become a
 * managed feature flag without leaking kernel-specific code into UI modules.
 */
export const activeCadKernel = meshMvpKernel;
