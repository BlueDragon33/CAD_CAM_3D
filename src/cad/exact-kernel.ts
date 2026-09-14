import * as THREE from 'three';
import type { Mesh, OcctKernel, ShapeHandle } from 'occt-wasm';
import type { CadProject } from './model';
import { rebuildProject, type RebuiltPart } from './rebuild';

const HASH_UPPER_BOUND = 2_000_000_000;
const CUT_OVERRUN_MM = 1;

export type ExactTopologySnapshot = {
  /** Runtime-local OCCT hashes. Stable selection remapping is not implemented yet. */
  faceIds: string[];
  edgeIds: string[];
  faceGroups: Int32Array | null;
};

export type ExactKernelReport = {
  kernelId: 'occt-wasm-v5';
  exactBrep: true;
  valid: boolean;
  triangleCount: number;
  faceCount: number;
  edgeCount: number;
  volumeMm3: number;
  surfaceAreaMm2: number;
  dimensionsMm: { width: number; depth: number; height: number };
  filletApplied: boolean;
  warnings: string[];
};

export type ExactKernelSnapshot = {
  rebuilt: RebuiltPart;
  geometry: THREE.BufferGeometry;
  stepText: string;
  topology: ExactTopologySnapshot;
  report: ExactKernelReport;
};

type OcctModule = typeof import('occt-wasm');

let modulePromise: Promise<OcctModule> | null = null;
let kernelPromise: Promise<OcctKernel> | null = null;
let operationTail: Promise<void> = Promise.resolve();

async function getKernel() {
  modulePromise ??= import('occt-wasm');
  const module = await modulePromise;
  kernelPromise ??= module.OcctKernel.init();
  return kernelPromise;
}

function mapOcctMeshToThree(mesh: Mesh) {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);

  // OCCT model convention in this adapter: X=width, Y=depth, Z=height.
  // Application convention: X=width, Y=height, Z=depth.
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions[i] = mesh.positions[i];
    positions[i + 1] = mesh.positions[i + 2];
    positions[i + 2] = mesh.positions[i + 1];
  }

  for (let i = 0; i < mesh.normals.length; i += 3) {
    normals[i] = mesh.normals[i];
    normals[i + 1] = mesh.normals[i + 2];
    normals[i + 2] = mesh.normals[i + 1];
  }

  // Swapping Y/Z changes handedness, so reverse triangle winding.
  const indices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    indices[i] = mesh.indices[i];
    indices[i + 1] = mesh.indices[i + 2];
    indices[i + 2] = mesh.indices[i + 1];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function singleSolid(kernel: OcctKernel, shape: ShapeHandle) {
  if (kernel.isSolid(shape)) return shape;
  const solids = kernel.getSubShapes(shape, 'solid');
  if (solids.length !== 1) {
    for (const solid of solids) kernel.release(solid);
    throw new Error(`Exact B-Rep rebuild expected one solid but produced ${solids.length}.`);
  }
  return solids[0];
}

function findOuterVerticalEdges(kernel: OcctKernel, shape: ShapeHandle, width: number, depth: number) {
  const candidates = kernel.getSubShapes(shape, 'edge');
  const selected: ShapeHandle[] = [];
  const positionTolerance = Math.max(1e-5, Math.min(width, depth) * 1e-6);

  for (const edge of candidates) {
    try {
      if (kernel.curveType(edge) !== 'line') {
        kernel.release(edge);
        continue;
      }
      const { first, last } = kernel.curveParameters(edge);
      const a = kernel.curvePointAtParam(edge, first);
      const b = kernel.curvePointAtParam(edge, last);
      const vertical = Math.abs(a.x - b.x) <= positionTolerance && Math.abs(a.y - b.y) <= positionTolerance && Math.abs(a.z - b.z) > positionTolerance;
      const outerX = Math.abs(Math.abs(a.x) - width / 2) <= positionTolerance;
      const outerY = Math.abs(Math.abs(a.y) - depth / 2) <= positionTolerance;
      if (vertical && outerX && outerY) selected.push(edge);
      else kernel.release(edge);
    } catch {
      kernel.release(edge);
    }
  }

  return selected;
}

function buildExactShape(kernel: OcctKernel, rebuilt: RebuiltPart) {
  const warnings: string[] = [];
  let filletApplied = false;

  let shape = kernel.makeBox(rebuilt.width, rebuilt.depth, rebuilt.height);
  shape = kernel.translate(shape, -rebuilt.width / 2, -rebuilt.depth / 2, 0);

  for (const hole of rebuilt.holes) {
    let tool = kernel.makeCylinder(hole.params.diameter / 2, rebuilt.height + CUT_OVERRUN_MM * 2);
    tool = kernel.translate(tool, hole.params.x, hole.params.z, -CUT_OVERRUN_MM);
    shape = kernel.cut(shape, tool);
  }

  for (const cut of rebuilt.cuts) {
    let tool = kernel.makeBox(cut.params.width, cut.params.depth, rebuilt.height + CUT_OVERRUN_MM * 2);
    tool = kernel.translate(
      tool,
      cut.params.x - cut.params.width / 2,
      cut.params.z - cut.params.depth / 2,
      -CUT_OVERRUN_MM,
    );
    shape = kernel.cut(shape, tool);
  }

  if (rebuilt.filletRadius > 0) {
    try {
      const solid = singleSolid(kernel, shape);
      const edges = findOuterVerticalEdges(kernel, solid, rebuilt.width, rebuilt.depth);
      if (edges.length === 4) {
        shape = kernel.fillet(solid, edges, rebuilt.filletRadius);
        filletApplied = true;
      } else {
        warnings.push(`Exact fillet skipped: expected 4 outer vertical edges but found ${edges.length}.`);
      }
      for (const edge of edges) kernel.release(edge);
    } catch (error) {
      warnings.push(error instanceof Error ? `Exact fillet skipped: ${error.message}` : 'Exact fillet skipped because OCCT rejected the selected edges.');
    }
  }

  if (!kernel.isValid(shape)) {
    warnings.push('OCCT reports that the rebuilt B-Rep is not fully valid.');
  }

  return { shape, warnings, filletApplied };
}

async function buildSnapshotUnsafe(project: CadProject): Promise<ExactKernelSnapshot> {
  const rebuilt = rebuildProject(project);
  if (!rebuilt.hasSolid) throw new Error('A valid rebuilt solid is required before exact-kernel export.');

  const kernel = await getKernel();
  kernel.releaseAll();

  try {
    const { shape, warnings, filletApplied } = buildExactShape(kernel, rebuilt);
    const mesh = kernel.meshShape(shape, { linearDeflection: 0.08, angularDeflection: 0.35 });
    const geometry = mapOcctMeshToThree(mesh);
    const stepText = kernel.exportStep(shape);
    const bbox = kernel.getBoundingBox(shape, false);
    const faceHashes = kernel.subShapeHashes(shape, 'face', HASH_UPPER_BOUND);
    const edgeHashes = kernel.subShapeHashes(shape, 'edge', HASH_UPPER_BOUND);
    const valid = kernel.isValid(shape);

    return {
      rebuilt,
      geometry,
      stepText,
      topology: {
        faceIds: faceHashes.map((hash) => `face:${hash}`),
        edgeIds: edgeHashes.map((hash) => `edge:${hash}`),
        faceGroups: mesh.faceGroups ? new Int32Array(mesh.faceGroups) : null,
      },
      report: {
        kernelId: 'occt-wasm-v5',
        exactBrep: true,
        valid,
        triangleCount: mesh.triangleCount,
        faceCount: faceHashes.length,
        edgeCount: edgeHashes.length,
        volumeMm3: kernel.getVolume(shape),
        surfaceAreaMm2: kernel.getSurfaceArea(shape),
        dimensionsMm: {
          width: bbox.xmax - bbox.xmin,
          depth: bbox.ymax - bbox.ymin,
          height: bbox.zmax - bbox.zmin,
        },
        filletApplied,
        warnings,
      },
    };
  } finally {
    kernel.releaseAll();
  }
}

/**
 * OCCT is arena-based and one kernel instance is single-threaded. Serialize
 * exact operations so two UI actions cannot release each other's shape handles.
 */
export async function buildExactKernelSnapshot(project: CadProject) {
  let resolveGate!: () => void;
  const gate = new Promise<void>((resolve) => { resolveGate = resolve; });
  const previous = operationTail;
  operationTail = previous.then(() => gate, () => gate);
  await previous;
  try {
    return await buildSnapshotUnsafe(project);
  } finally {
    resolveGate();
  }
}

/**
 * Capability flags below describe what CAD_CAM_3D exposes through this adapter,
 * not every operation that the upstream OCCT wrapper happens to contain.
 */
export const exactKernelDescriptor = {
  id: 'occt-wasm-v5',
  label: 'OpenCascade exact B-Rep',
  kind: 'exact-brep' as const,
  lazy: true,
  capabilities: {
    exactBrep: true,
    editableTopology: false,
    meshPreview: true,
    stlExport: false,
    stepExport: true,
    exactFillet: true,
    exactChamfer: false,
    shell: false,
  },
};
