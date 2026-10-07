import * as THREE from 'three';
import type { CadProject } from '../cad/model';
import { activeCadKernel } from '../cad/kernel';
import { buildExactKernelSnapshot } from '../cad/exact-kernel';
import { projectRequiresExactGeometry } from '../cad/project-analysis';
import { inspectGeometry, type StlInspection } from './export';
import { createStoredZip, utf8 } from './zip-store';

export type ThreeMfExportReport = StlInspection & {
  fileName: string;
  byteLength: number;
  kernelId: string;
  warnings: string[];
  objectCount: 1;
  unit: 'millimeter';
};

function safeFileName(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'cad-cam-3d-part';
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function manufacturingCoordinates(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
) {
  // Workspace is Y-up. A +90 degree rotation around X yields slicer Z-up:
  // (x, y, z) -> (x, -z, y), preserving handedness and triangle winding.
  return {
    x: position.getX(index),
    y: -position.getZ(index),
    z: position.getY(index),
  };
}

function numberText(value: number) {
  if (!Number.isFinite(value)) throw new Error('3MF export encountered a non-finite coordinate.');
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  return Number(normalized.toFixed(9)).toString();
}

export function createThreeMfModelXml(projectName: string, geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  if (!position) throw new Error('3MF export requires a position attribute.');
  const index = geometry.getIndex();
  const triangleVertexCount = index?.count ?? position.count;
  if (triangleVertexCount === 0 || triangleVertexCount % 3 !== 0) {
    throw new Error('3MF export requires a non-empty triangle mesh.');
  }

  const vertices: string[] = [];
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const point = manufacturingCoordinates(position, vertex);
    vertices.push(
      '<vertex x="' + numberText(point.x) + '" y="' + numberText(point.y) + '" z="' + numberText(point.z) + '"/>',
    );
  }

  const triangles: string[] = [];
  const vertexIndex = (offset: number) => index ? index.getX(offset) : offset;
  for (let offset = 0; offset < triangleVertexCount; offset += 3) {
    triangles.push(
      '<triangle v1="' + vertexIndex(offset)
      + '" v2="' + vertexIndex(offset + 1)
      + '" v3="' + vertexIndex(offset + 2) + '"/>',
    );
  }

  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
    + '<metadata name="Title">' + escapeXml(projectName) + '</metadata>'
    + '<metadata name="Application">CAD_CAM_3D</metadata>'
    + '<resources><object id="1" type="model"><mesh><vertices>'
    + vertices.join('')
    + '</vertices><triangles>'
    + triangles.join('')
    + '</triangles></mesh></object></resources>'
    + '<build><item objectid="1"/></build></model>';
}

export function createThreeMfPackageFromGeometry(
  projectName: string,
  geometry: THREE.BufferGeometry,
  kernelId: string,
  warnings: string[] = [],
) {
  const inspection = inspectGeometry(geometry);
  if (!inspection.finiteCoordinates || inspection.triangleCount === 0) {
    throw new Error(inspection.messages.join(' '));
  }

  const contentTypes = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
    + '</Types>';

  const relationships = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
    + '</Relationships>';

  const model = createThreeMfModelXml(projectName, geometry);
  const zip = createStoredZip([
    { name: '[Content_Types].xml', data: utf8(contentTypes) },
    { name: '_rels/.rels', data: utf8(relationships) },
    { name: '3D/3dmodel.model', data: utf8(model) },
  ]);

  const buffer = new ArrayBuffer(zip.byteLength);
  new Uint8Array(buffer).set(zip);
  const blob = new Blob([buffer], { type: 'model/3mf' });
  const fileName = safeFileName(projectName) + '.3mf';
  const report: ThreeMfExportReport = {
    ...inspection,
    fileName,
    byteLength: blob.size,
    kernelId,
    warnings: [...inspection.messages.filter((message) => !message.startsWith('Closed triangle mesh passed')), ...warnings],
    objectCount: 1,
    unit: 'millimeter',
  };
  return { blob, report };
}

async function adaptiveGeometry(project: CadProject) {
  if (projectRequiresExactGeometry(project)) {
    const snapshot = await buildExactKernelSnapshot(project, { includeStep: false });
    if (!snapshot.report.valid) {
      snapshot.geometry.dispose();
      throw new Error('Exact B-Rep is invalid; 3MF export was blocked.');
    }
    return {
      geometry: snapshot.geometry,
      kernelId: snapshot.report.kernelId,
      warnings: snapshot.report.warnings,
    };
  }

  const build = activeCadKernel.buildMesh(project);
  if (!build.geometry || !build.rebuilt.hasSolid) {
    build.geometry?.dispose();
    throw new Error('A valid rebuilt solid is required before 3MF export.');
  }
  return { geometry: build.geometry, kernelId: activeCadKernel.id, warnings: [] as string[] };
}

export async function createProjectThreeMf(project: CadProject) {
  const built = await adaptiveGeometry(project);
  try {
    return createThreeMfPackageFromGeometry(project.name, built.geometry, built.kernelId, built.warnings);
  } finally {
    built.geometry.dispose();
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadProjectThreeMf(project: CadProject): Promise<ThreeMfExportReport> {
  const { blob, report } = await createProjectThreeMf(project);
  downloadBlob(blob, report.fileName);
  return report;
}
