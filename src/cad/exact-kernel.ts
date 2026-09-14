import * as THREE from 'three';
import type { Mesh, OcctKernel, ShapeHandle } from 'occt-wasm';
import type { CadProject } from './model';
import { rebuildProject, type RebuiltPart } from './rebuild';
import {
  deriveFaceTopology,
  type ExactEdgeTopology,
  type ExactFaceTopology,
  type Vec3Tuple,
} from './topology-selection';
import {
  FaceLineageTracker,
  type BaseFaceSeed,
  type TopologyEvolutionTrace,
} from './topology-evolution';
import { resolveEdgeTopologyRef } from './topology-ref';

// OCCT mesh face groups use TopTools_ShapeMapHasher % 2147483647. Keep every
// topology query/history call in the same hash domain so groups, evolution and
// edge adjacency can be compared directly.
const HASH_UPPER_BOUND = 2_147_483_647;
const CUT_OVERRUN_MM = 1;

export type ExactTopologySnapshot = {
  /** Runtime-local OCCT topology enriched with semantic face ancestry. */
  faceIds: string[];
  edgeIds: string[];
  faceGroups: Int32Array | null;
  faces: ExactFaceTopology[];
  edges: ExactEdgeTopology[];
  evolution: TopologyEvolutionTrace;
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
  evolutionStepCount: number;
  warnings: string[];
};

export type ExactKernelSnapshot = {
  rebuilt: RebuiltPart;
  geometry: THREE.BufferGeometry;
  stepText: string | null;
  topology: ExactTopologySnapshot;
  report: ExactKernelReport;
};

export type ExactKernelBuildOptions = {
  /** STEP serialization is intentionally optional because topology picking should not pay the I/O cost on every rebuild. */
  includeStep?: boolean;
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

  // OCCT model convention: X=width, Y=depth, Z=height.
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

function currentFaceHashes(kernel: OcctKernel, shape: ShapeHandle) {
  return kernel.subShapeHashes(shape, 'face', HASH_UPPER_BOUND);
}

function classifyBaseFaces(kernel: OcctKernel, shape: ShapeHandle, rebuilt: RebuiltPart): BaseFaceSeed[] {
  const handles = kernel.getSubShapes(shape, 'face');
  const result: BaseFaceSeed[] = [];
  const tolerance = Math.max(rebuilt.width, rebuilt.depth, rebuilt.height, 1) * 1e-6;

  for (const face of handles) {
    try {
      const box = kernel.getBoundingBox(face, false);
      const cx = (box.xmin + box.xmax) / 2;
      const cy = (box.ymin + box.ymax) / 2;
      const cz = (box.zmin + box.zmax) / 2;
      const ex = box.xmax - box.xmin;
      const ey = box.ymax - box.ymin;
      const ez = box.zmax - box.zmin;
      let role = 'base-face';

      if (ez <= tolerance) role = Math.abs(cz - rebuilt.height) <= tolerance ? 'top' : 'bottom';
      else if (ex <= tolerance) role = cx >= 0 ? 'side:+x' : 'side:-x';
      else if (ey <= tolerance) role = cy >= 0 ? 'side:+depth' : 'side:-depth';

      result.push({ hash: kernel.hashCode(face, HASH_UPPER_BOUND), role });
    } finally {
      kernel.release(face);
    }
  }

  return result;
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

function findEdgeHandleByHash(kernel: OcctKernel, shape: ShapeHandle, targetHash: number) {
  const handles = kernel.getSubShapes(shape, 'edge');
  let selected: ShapeHandle | null = null;
  for (const edge of handles) {
    let keep = false;
    try {
      keep = selected === null && kernel.hashCode(edge, HASH_UPPER_BOUND) === targetHash;
      if (keep) selected = edge;
    } finally {
      if (!keep) kernel.release(edge);
    }
  }
  return selected;
}

function buildExactShape(kernel: OcctKernel, project: CadProject, rebuilt: RebuiltPart) {
  const warnings: string[] = [];
  let filletApplied = false;

  let shape = kernel.makeBox(rebuilt.width, rebuilt.depth, rebuilt.height);
  shape = kernel.translate(shape, -rebuilt.width / 2, -rebuilt.depth / 2, 0);

  const baseFeatureId = project.features.find((feature) => feature.enabled && feature.kind === 'extrude')?.id ?? 'base-extrude';
  const tracker = new FaceLineageTracker(
    HASH_UPPER_BOUND,
    baseFeatureId,
    classifyBaseFaces(kernel, shape, rebuilt),
  );

  for (const feature of rebuilt.operationSequence) {
    if (feature.kind === 'hole') {
      let tool = kernel.makeCylinder(feature.params.diameter / 2, rebuilt.height + CUT_OVERRUN_MM * 2);
      tool = kernel.translate(tool, feature.params.x, feature.params.z, -CUT_OVERRUN_MM);
      const before = currentFaceHashes(kernel, shape);
      const evolution = kernel.cutWithHistory(shape, tool, before, HASH_UPPER_BOUND);
      shape = evolution.result;
      const after = currentFaceHashes(kernel, shape);
      tracker.record(feature.id, 'hole', before, after, evolution);
      continue;
    }

    if (feature.kind === 'cut') {
      let tool = kernel.makeBox(feature.params.width, feature.params.depth, rebuilt.height + CUT_OVERRUN_MM * 2);
      tool = kernel.translate(
        tool,
        feature.params.x - feature.params.width / 2,
        feature.params.z - feature.params.depth / 2,
        -CUT_OVERRUN_MM,
      );
      const before = currentFaceHashes(kernel, shape);
      const evolution = kernel.cutWithHistory(shape, tool, before, HASH_UPPER_BOUND);
      shape = evolution.result;
      const after = currentFaceHashes(kernel, shape);
      tracker.record(feature.id, 'cut', before, after, evolution);
      continue;
    }

    const radius = Math.max(0, Math.min(feature.params.radius, rebuilt.width / 2, rebuilt.depth / 2, rebuilt.height / 2));
    if (radius <= 0) continue;

    let edges: ShapeHandle[] = [];
    try {
      const solid = singleSolid(kernel, shape);

      if (feature.params.selection.mode === 'preset') {
        edges = findOuterVerticalEdges(kernel, solid, rebuilt.width, rebuilt.depth);
        if (edges.length !== 4) {
          warnings.push(`${feature.name}: exact fillet skipped; expected 4 outer vertical edges but found ${edges.length}.`);
          continue;
        }
      } else {
        const spanMm = Math.max(rebuilt.width, rebuilt.depth, rebuilt.height, 1);
        const topologyBeforeFillet = tracker.snapshot();
        const candidateEdges = sampleExactEdges(kernel, solid, spanMm, topologyBeforeFillet, warnings);
        const resolution = resolveEdgeTopologyRef(feature.params.selection.ref, candidateEdges, spanMm);
        if (!resolution) {
          warnings.push(`${feature.name}: exact fillet skipped because the persisted edge reference could not be resolved safely.`);
          continue;
        }
        const handle = findEdgeHandleByHash(kernel, solid, resolution.edge.hash);
        if (!handle) {
          warnings.push(`${feature.name}: exact fillet skipped because the resolved edge disappeared before the operation.`);
          continue;
        }
        edges = [handle];
        if (resolution.confidence === 'medium') {
          warnings.push(`${feature.name}: persisted edge resolved with medium confidence after rebuild.`);
        }
      }

      const before = currentFaceHashes(kernel, solid);
      const evolution = kernel.filletWithHistory(solid, edges, radius, before, HASH_UPPER_BOUND);
      shape = evolution.result;
      const after = currentFaceHashes(kernel, shape);
      tracker.record(feature.id, 'fillet', before, after, evolution);
      filletApplied = true;
    } catch (error) {
      warnings.push(error instanceof Error ? `${feature.name}: exact fillet skipped: ${error.message}` : `${feature.name}: exact fillet skipped because OCCT rejected the selected edges.`);
    } finally {
      for (const edge of edges) kernel.release(edge);
    }
  }

  if (!kernel.isValid(shape)) warnings.push('OCCT reports that the rebuilt B-Rep is not fully valid.');

  return { shape, warnings, filletApplied, evolution: tracker.snapshot() };
}

function appPoint(point: { x: number; y: number; z: number }): Vec3Tuple {
  return [point.x, point.z, point.y];
}

function decodeEdgeToFaceMap(flat: number[]) {
  const map = new Map<number, number[]>();
  let cursor = 0;
  while (cursor < flat.length) {
    if (cursor + 1 >= flat.length) throw new Error('edgeToFaceMap ended before adjacent-face count.');
    const edgeHash = flat[cursor++];
    const count = flat[cursor++];
    if (!Number.isInteger(count) || count < 0 || cursor + count > flat.length) {
      throw new Error(`edgeToFaceMap contains invalid adjacent-face count ${String(count)}.`);
    }
    map.set(edgeHash, flat.slice(cursor, cursor + count));
    cursor += count;
  }
  return map;
}

function sampleExactEdges(
  kernel: OcctKernel,
  shape: ShapeHandle,
  spanMm: number,
  evolution: TopologyEvolutionTrace,
  warnings: string[],
) {
  const handles = kernel.getSubShapes(shape, 'edge');
  const edges: ExactEdgeTopology[] = [];
  let adjacency = new Map<number, number[]>();
  try {
    adjacency = decodeEdgeToFaceMap(kernel.edgeToFaceMap(shape, HASH_UPPER_BOUND));
  } catch (error) {
    warnings.push(error instanceof Error ? `Exact edge adjacency unavailable: ${error.message}` : 'Exact edge adjacency unavailable.');
  }

  for (const edge of handles) {
    try {
      const hash = kernel.hashCode(edge, HASH_UPPER_BOUND);
      const curveKind = kernel.curveType(edge);
      const lengthMm = kernel.curveLength(edge);
      const { first, last } = kernel.curveParameters(edge);
      if (!Number.isFinite(first) || !Number.isFinite(last) || !Number.isFinite(lengthMm) || lengthMm <= 1e-9) continue;

      const targetSegmentMm = Math.max(0.6, spanMm / 45);
      const sampleCount = curveKind === 'line'
        ? 2
        : Math.min(96, Math.max(12, Math.ceil(lengthMm / targetSegmentMm) + 1));
      const points = new Float32Array(sampleCount * 3);

      for (let sample = 0; sample < sampleCount; sample += 1) {
        const ratio = sampleCount === 1 ? 0 : sample / (sampleCount - 1);
        const parameter = first + (last - first) * ratio;
        const point = appPoint(kernel.curvePointAtParam(edge, parameter));
        const offset = sample * 3;
        points[offset] = point[0];
        points[offset + 1] = point[1];
        points[offset + 2] = point[2];
      }

      const midpoint = appPoint(kernel.curvePointAtParam(edge, first + (last - first) / 2));
      const adjacentFaceHashes = adjacency.get(hash) ?? [];
      const adjacentFaceLineageIds = [...new Set(
        adjacentFaceHashes.flatMap((faceHash) => evolution.faceLineageByHash[String(faceHash)] ?? []),
      )].sort();

      edges.push({
        kind: 'edge',
        runtimeId: `edge:${hash}`,
        hash,
        curveKind,
        lengthMm,
        midpoint,
        points,
        adjacentFaceHashes: [...adjacentFaceHashes],
        adjacentFaceLineageIds,
      });
    } catch (error) {
      warnings.push(error instanceof Error ? `An exact edge could not be sampled: ${error.message}` : 'An exact edge could not be sampled.');
    } finally {
      kernel.release(edge);
    }
  }

  return edges;
}

async function buildSnapshotUnsafe(project: CadProject, options: ExactKernelBuildOptions): Promise<ExactKernelSnapshot> {
  const rebuilt = rebuildProject(project);
  if (!rebuilt.hasSolid) throw new Error('A valid rebuilt solid is required before exact-kernel processing.');

  const kernel = await getKernel();
  kernel.releaseAll();

  try {
    const { shape, warnings, filletApplied, evolution } = buildExactShape(kernel, project, rebuilt);
    const mesh = kernel.meshShape(shape, { linearDeflection: 0.08, angularDeflection: 0.35 });
    const geometry = mapOcctMeshToThree(mesh);
    const faceGroups = mesh.faceGroups ? new Int32Array(mesh.faceGroups) : null;
    const faces = deriveFaceTopology(geometry, faceGroups);
    for (const face of faces) face.lineageIds = [...(evolution.faceLineageByHash[String(face.hash)] ?? [])];

    const spanMm = Math.max(rebuilt.width, rebuilt.depth, rebuilt.height, 1);
    const edges = sampleExactEdges(kernel, shape, spanMm, evolution, warnings);
    const stepText = options.includeStep === false ? null : kernel.exportStep(shape);
    const bbox = kernel.getBoundingBox(shape, false);
    const faceHashes = currentFaceHashes(kernel, shape);
    const edgeHashes = kernel.subShapeHashes(shape, 'edge', HASH_UPPER_BOUND);
    const valid = kernel.isValid(shape);

    if (faces.length !== faceHashes.length) warnings.push(`Exact picking mapped ${faces.length} of ${faceHashes.length} B-Rep faces from tessellation groups.`);
    if (edges.length !== edgeHashes.length) warnings.push(`Exact picking sampled ${edges.length} of ${edgeHashes.length} B-Rep edges.`);
    const unanchoredFaces = faces.filter((face) => face.lineageIds.length === 0).length;
    if (unanchoredFaces > 0) warnings.push(`${unanchoredFaces} exact face(s) have no semantic lineage anchor.`);

    return {
      rebuilt,
      geometry,
      stepText,
      topology: {
        faceIds: faces.map((face) => face.runtimeId),
        edgeIds: edges.map((edge) => edge.runtimeId),
        faceGroups,
        faces,
        edges,
        evolution,
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
        evolutionStepCount: evolution.steps.length,
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
export async function buildExactKernelSnapshot(project: CadProject, options: ExactKernelBuildOptions = {}) {
  let resolveGate!: () => void;
  const gate = new Promise<void>((resolve) => { resolveGate = resolve; });
  const previous = operationTail;
  operationTail = previous.then(() => gate, () => gate);
  await previous;
  try {
    return await buildSnapshotUnsafe(project, options);
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
