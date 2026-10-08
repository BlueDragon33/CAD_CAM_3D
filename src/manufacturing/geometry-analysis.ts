import * as THREE from 'three';

export type OverhangAnalysis = {
  totalSurfaceAreaMm2: number;
  downwardOverhangAreaMm2: number;
  downwardTriangleCount: number;
  thresholdDegFromVertical: number;
  buildPlaneY: number;
};

export function analyzeDownwardOverhang(
  geometry: THREE.BufferGeometry,
  thresholdDegFromVertical = 45,
): OverhangAnalysis {
  const position = geometry.getAttribute('position');
  if (!position) {
    return {
      totalSurfaceAreaMm2: 0,
      downwardOverhangAreaMm2: 0,
      downwardTriangleCount: 0,
      thresholdDegFromVertical,
      buildPlaneY: 0,
    };
  }

  const index = geometry.getIndex();
  const count = index?.count ?? position.count;
  const vertexIndex = (offset: number) => index ? index.getX(offset) : offset;

  geometry.computeBoundingBox();
  const buildPlaneY = geometry.boundingBox?.min.y ?? 0;
  const spanY = geometry.boundingBox ? geometry.boundingBox.max.y - geometry.boundingBox.min.y : 0;
  const planeTolerance = Math.max(1e-5, spanY * 1e-6);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  let totalSurfaceAreaMm2 = 0;
  let downwardOverhangAreaMm2 = 0;
  let downwardTriangleCount = 0;

  // For a 45° rule, a face normal more downward than -sin(45°) is treated as
  // a strong overhang candidate. This is deliberately a simple geometric
  // heuristic, not a slicer/support-engine replacement.
  const downwardNormalThreshold = -Math.sin(THREE.MathUtils.degToRad(thresholdDegFromVertical));

  for (let offset = 0; offset + 2 < count; offset += 3) {
    const ia = vertexIndex(offset);
    const ib = vertexIndex(offset + 1);
    const ic = vertexIndex(offset + 2);
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    cross.crossVectors(ab, ac);
    const twiceArea = cross.length();
    if (!Number.isFinite(twiceArea) || twiceArea <= 1e-12) continue;
    const area = twiceArea / 2;
    totalSurfaceAreaMm2 += area;

    const normalY = cross.y / twiceArea;
    if (normalY >= downwardNormalThreshold) continue;

    const centroidY = (a.y + b.y + c.y) / 3;
    const onBuildPlane = Math.abs(centroidY - buildPlaneY) <= planeTolerance
      && Math.abs(a.y - buildPlaneY) <= planeTolerance
      && Math.abs(b.y - buildPlaneY) <= planeTolerance
      && Math.abs(c.y - buildPlaneY) <= planeTolerance;
    if (onBuildPlane) continue;

    downwardOverhangAreaMm2 += area;
    downwardTriangleCount += 1;
  }

  return {
    totalSurfaceAreaMm2,
    downwardOverhangAreaMm2,
    downwardTriangleCount,
    thresholdDegFromVertical,
    buildPlaneY,
  };
}
