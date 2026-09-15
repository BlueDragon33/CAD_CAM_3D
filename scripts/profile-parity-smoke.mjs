import * as THREE from 'three';
import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();

function appendMixed(shape, segments) {
  shape.moveTo(segments[0].start.x, segments[0].start.z);
  for (const segment of segments) {
    if (segment.kind === 'line') {
      shape.lineTo(segment.end.x, segment.end.z);
      continue;
    }
    const start = segment.startAngleDeg * Math.PI / 180;
    const end = (segment.startAngleDeg + segment.sweepDeg) * Math.PI / 180;
    shape.absarc(segment.center.x, segment.center.z, segment.radius, start, end, segment.sweepDeg < 0);
  }
  shape.closePath();
}

function threeProfileGeometry(kind, data, height) {
  const shape = new THREE.Shape();
  if (kind === 'polyline') {
    shape.moveTo(data.points[0].x, data.points[0].z);
    for (const point of data.points.slice(1)) shape.lineTo(point.x, point.z);
    shape.closePath();
  } else if (kind === 'mixed') {
    appendMixed(shape, data.segments);
  } else {
    shape.absarc(data.center.x, data.center.z, data.radius, 0, Math.PI * 2, false);
    shape.closePath();
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 128,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  return geometry;
}

function triangleVolume(geometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  let signed = 0;
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    const ax = position.getX(ia); const ay = position.getY(ia); const az = position.getZ(ia);
    const bx = position.getX(ib); const by = position.getY(ib); const bz = position.getZ(ib);
    const cx = position.getX(ic); const cy = position.getY(ic); const cz = position.getZ(ic);
    signed += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return Math.abs(signed / 6);
}

function exactPolyline(points, height) {
  const edges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return kernel.makeLineEdge(
      { x: point.x, y: point.z, z: 0 },
      { x: next.x, y: next.z, z: 0 },
    );
  });
  const wire = kernel.makeWire(edges);
  const face = kernel.makeFace(wire);
  return kernel.extrude(face, 0, 0, height);
}

function exactMixed(segments, height) {
  const edges = segments.map((segment) => {
    if (segment.kind === 'line') {
      return kernel.makeLineEdge(
        { x: segment.start.x, y: segment.start.z, z: 0 },
        { x: segment.end.x, y: segment.end.z, z: 0 },
      );
    }
    const midAngle = (segment.startAngleDeg + segment.sweepDeg / 2) * Math.PI / 180;
    const mid = {
      x: segment.center.x + Math.cos(midAngle) * segment.radius,
      z: segment.center.z + Math.sin(midAngle) * segment.radius,
    };
    return kernel.makeArcEdge(
      { x: segment.start.x, y: segment.start.z, z: 0 },
      { x: mid.x, y: mid.z, z: 0 },
      { x: segment.end.x, y: segment.end.z, z: 0 },
    );
  });
  const wire = kernel.makeWire(edges);
  const face = kernel.makeFace(wire);
  return kernel.extrude(face, 0, 0, height);
}

function exactCircle(center, radius, height) {
  const edge = kernel.makeCircleEdge(
    { x: center.x, y: center.z, z: 0 },
    { x: 0, y: 0, z: 1 },
    radius,
  );
  const wire = kernel.makeWire([edge]);
  const face = kernel.makeFace(wire);
  return kernel.extrude(face, 0, 0, height);
}

function close(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function verify(name, meshGeometry, exactShape, expectedVolume, expectedBounds) {
  if (!kernel.isValid(exactShape)) throw new Error(`${name}: OCCT solid is invalid.`);
  const meshVolume = triangleVolume(meshGeometry);
  const exactVolume = kernel.getVolume(exactShape);
  const volumeTolerance = Math.max(0.05, expectedVolume * 0.005);
  close(meshVolume, expectedVolume, volumeTolerance, `${name} mesh volume`);
  close(exactVolume, expectedVolume, Math.max(1e-5, expectedVolume * 1e-6), `${name} exact volume`);
  close(meshVolume, exactVolume, volumeTolerance, `${name} mesh/exact volume parity`);

  const meshBox = meshGeometry.boundingBox;
  const exactBox = kernel.getBoundingBox(exactShape, false);
  if (!meshBox) throw new Error(`${name}: mesh bounding box missing.`);
  close(meshBox.max.x - meshBox.min.x, expectedBounds.width, 1e-3, `${name} mesh width`);
  close(meshBox.max.z - meshBox.min.z, expectedBounds.depth, 1e-3, `${name} mesh depth`);
  close(meshBox.max.y - meshBox.min.y, expectedBounds.height, 1e-3, `${name} mesh height`);
  close(exactBox.xmax - exactBox.xmin, expectedBounds.width, 1e-6, `${name} exact width`);
  close(exactBox.ymax - exactBox.ymin, expectedBounds.depth, 1e-6, `${name} exact depth`);
  close(exactBox.zmax - exactBox.zmin, expectedBounds.height, 1e-6, `${name} exact height`);
  meshGeometry.dispose();
  console.log(`${name} parity PASS | mesh ${meshVolume.toFixed(3)} mm^3 | exact ${exactVolume.toFixed(3)} mm^3`);
}

try {
  const height = 9;
  const polygon = [
    { x: -18, z: -10 },
    { x: 14, z: -10 },
    { x: 20, z: 2 },
    { x: 8, z: 14 },
    { x: -16, z: 10 },
  ];
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]; const b = polygon[(i + 1) % polygon.length];
    twiceArea += a.x * b.z - b.x * a.z;
  }
  const polygonArea = Math.abs(twiceArea) / 2;
  verify(
    'Polyline profile',
    threeProfileGeometry('polyline', { points: polygon }, height),
    exactPolyline(polygon, height),
    polygonArea * height,
    { width: 38, depth: 24, height },
  );

  const radius = 11;
  const center = { x: 4, z: -3 };
  verify(
    'Circle profile',
    threeProfileGeometry('circle', { center, radius }, height),
    exactCircle(center, radius, height),
    Math.PI * radius * radius * height,
    { width: radius * 2, depth: radius * 2, height },
  );

  const capsuleRadius = 6;
  const mixedSegments = [
    { kind: 'line', start: { x: -12, z: -6 }, end: { x: 12, z: -6 } },
    { kind: 'arc', center: { x: 12, z: 0 }, radius: capsuleRadius, startAngleDeg: -90, sweepDeg: 180, start: { x: 12, z: -6 }, end: { x: 12, z: 6 } },
    { kind: 'line', start: { x: 12, z: 6 }, end: { x: -12, z: 6 } },
    { kind: 'arc', center: { x: -12, z: 0 }, radius: capsuleRadius, startAngleDeg: 90, sweepDeg: 180, start: { x: -12, z: 6 }, end: { x: -12, z: -6 } },
  ];
  const capsuleArea = 24 * 12 + Math.PI * capsuleRadius * capsuleRadius;
  verify(
    'Mixed Line+Arc capsule profile',
    threeProfileGeometry('mixed', { segments: mixedSegments }, height),
    exactMixed(mixedSegments, height),
    capsuleArea * height,
    { width: 36, depth: 12, height },
  );
} finally {
  kernel.releaseAll();
}
