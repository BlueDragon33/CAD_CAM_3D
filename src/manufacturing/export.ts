import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { CadProject } from '../cad/model';
import { activeCadKernel } from '../cad/kernel';

export type StlInspection = {
  triangleCount: number;
  degenerateTriangles: number;
  nonManifoldEdges: number;
  finiteCoordinates: boolean;
  dimensionsMm: { width: number; depth: number; height: number };
  valid: boolean;
  messages: string[];
};

export type StlExportReport = StlInspection & {
  fileName: string;
  byteLength: number;
  kernelId: string;
};

const EDGE_TOLERANCE_MM = 1e-6;
const DEGENERATE_AREA_EPSILON = 1e-14;

function vertexKey(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number) {
  const q = (value: number) => Math.round(value / EDGE_TOLERANCE_MM);
  return `${q(position.getX(index))},${q(position.getY(index))},${q(position.getZ(index))}`;
}

function inspectGeometry(geometry: THREE.BufferGeometry): StlInspection {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  let degenerateTriangles = 0;
  let finiteCoordinates = true;
  const edgeUse = new Map<string, number>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 1) {
    if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) {
      finiteCoordinates = false;
      break;
    }
  }

  const vertexIndex = (offset: number) => index ? index.getX(offset) : offset;
  const addEdge = (first: number, second: number) => {
    const left = vertexKey(position, first);
    const right = vertexKey(position, second);
    const key = left < right ? `${left}|${right}` : `${right}|${left}`;
    edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
  };

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    const ia = vertexIndex(offset);
    const ib = vertexIndex(offset + 1);
    const ic = vertexIndex(offset + 2);

    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    cross.crossVectors(ab, ac);
    if (cross.lengthSq() <= DEGENERATE_AREA_EPSILON) degenerateTriangles += 1;

    addEdge(ia, ib);
    addEdge(ib, ic);
    addEdge(ic, ia);
  }

  let nonManifoldEdges = 0;
  for (const count of edgeUse.values()) {
    if (count !== 2) nonManifoldEdges += 1;
  }

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = new THREE.Vector3();
  if (box) box.getSize(size);

  const dimensionsMm = {
    width: size.x,
    depth: size.z,
    height: size.y,
  };

  const messages: string[] = [];
  if (!finiteCoordinates) messages.push('Mesh contains non-finite vertex coordinates.');
  if (triangleCount === 0) messages.push('Mesh contains no triangles.');
  if (degenerateTriangles > 0) messages.push(`${degenerateTriangles} degenerate triangle(s) detected.`);
  if (nonManifoldEdges > 0) messages.push(`${nonManifoldEdges} edge(s) are not used by exactly two triangles.`);
  if (messages.length === 0) messages.push('Closed triangle mesh passed the STL preflight checks.');

  return {
    triangleCount,
    degenerateTriangles,
    nonManifoldEdges,
    finiteCoordinates,
    dimensionsMm,
    valid: finiteCoordinates && triangleCount > 0 && degenerateTriangles === 0 && nonManifoldEdges === 0,
    messages,
  };
}

function safeFileName(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'cad-cam-3d-part';
}

function binaryOutputToBlob(output: string | DataView) {
  if (typeof output === 'string') return new Blob([output], { type: 'model/stl' });
  const bytes = new Uint8Array(output.byteLength);
  bytes.set(new Uint8Array(output.buffer, output.byteOffset, output.byteLength));
  return new Blob([bytes.buffer], { type: 'model/stl' });
}

export function createStlExport(project: CadProject) {
  if (!activeCadKernel.capabilities.stlExport) throw new Error(`${activeCadKernel.label} does not support STL export.`);
  const { rebuilt, geometry } = activeCadKernel.buildMesh(project);
  if (!geometry || !rebuilt.hasSolid) throw new Error('A valid rebuilt solid is required before STL export.');

  const inspection = inspectGeometry(geometry);
  if (!inspection.finiteCoordinates || inspection.triangleCount === 0) {
    geometry.dispose();
    throw new Error(inspection.messages.join(' '));
  }

  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld(true);
  const exporter = new STLExporter();
  const output = exporter.parse(mesh, { binary: true });
  const blob = binaryOutputToBlob(output);
  const fileName = `${safeFileName(project.name)}.stl`;
  const report: StlExportReport = {
    ...inspection,
    fileName,
    byteLength: blob.size,
    kernelId: activeCadKernel.id,
  };

  geometry.dispose();
  return { blob, report };
}

export function downloadProjectStl(project: CadProject): StlExportReport {
  const { blob, report } = createStlExport(project);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = report.fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return report;
}
