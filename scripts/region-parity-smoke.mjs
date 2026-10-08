import * as THREE from 'three';
import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();

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

function close(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function polylineFace(points) {
  const edges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return kernel.makeLineEdge(
      { x: point.x, y: point.z, z: 0 },
      { x: next.x, y: next.z, z: 0 },
    );
  });
  return kernel.makeFace(kernel.makeWire(edges));
}

function circleFace(center, radius) {
  const edge = kernel.makeCircleEdge(
    { x: center.x, y: center.z, z: 0 },
    { x: 0, y: 0, z: 1 },
    radius,
  );
  return kernel.makeFace(kernel.makeWire([edge]));
}

try {
  const width = 50;
  const depth = 36;
  const height = 8;
  const outer = [
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    { x: width / 2, z: depth / 2 },
    { x: -width / 2, z: depth / 2 },
  ];
  const circleCenter = { x: -10, z: 0 };
  const circleRadius = 5;
  const squareHalf = 4;
  const square = [
    { x: 10 - squareHalf, z: -squareHalf },
    { x: 10 + squareHalf, z: -squareHalf },
    { x: 10 + squareHalf, z: squareHalf },
    { x: 10 - squareHalf, z: squareHalf },
  ];

  const shape = new THREE.Shape();
  shape.moveTo(outer[0].x, outer[0].z);
  for (const point of outer.slice(1)) shape.lineTo(point.x, point.z);
  shape.closePath();
  const circleHole = new THREE.Path();
  circleHole.absarc(circleCenter.x, circleCenter.z, circleRadius, 0, Math.PI * 2, false);
  circleHole.closePath();
  shape.holes.push(circleHole);
  const squareHole = new THREE.Path();
  squareHole.moveTo(square[0].x, square[0].z);
  for (const point of square.slice(1)) squareHole.lineTo(point.x, point.z);
  squareHole.closePath();
  shape.holes.push(squareHole);

  const mesh = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 128, steps: 1 });
  mesh.rotateX(-Math.PI / 2);
  mesh.computeBoundingBox();

  let exact = kernel.extrude(polylineFace(outer), 0, 0, height);
  const overrun = 1;
  let circleTool = kernel.extrude(circleFace(circleCenter, circleRadius), 0, 0, height + overrun * 2);
  circleTool = kernel.translate(circleTool, 0, 0, -overrun);
  exact = kernel.cut(exact, circleTool);
  let squareTool = kernel.extrude(polylineFace(square), 0, 0, height + overrun * 2);
  squareTool = kernel.translate(squareTool, 0, 0, -overrun);
  exact = kernel.cut(exact, squareTool);

  if (!kernel.isValid(exact)) throw new Error('Multi-loop exact region is invalid.');
  const expectedArea = width * depth - Math.PI * circleRadius * circleRadius - (squareHalf * 2) ** 2;
  const expectedVolume = expectedArea * height;
  const meshVolume = triangleVolume(mesh);
  const exactVolume = kernel.getVolume(exact);
  const tolerance = Math.max(0.1, expectedVolume * 0.005);
  close(meshVolume, expectedVolume, tolerance, 'region mesh volume');
  close(exactVolume, expectedVolume, Math.max(1e-4, expectedVolume * 1e-6), 'region exact volume');
  close(meshVolume, exactVolume, tolerance, 'region mesh/exact volume parity');

  const meshBox = mesh.boundingBox;
  const exactBox = kernel.getBoundingBox(exact, false);
  if (!meshBox) throw new Error('Multi-loop mesh bounding box missing.');
  close(meshBox.max.x - meshBox.min.x, width, 1e-3, 'region mesh width');
  close(meshBox.max.z - meshBox.min.z, depth, 1e-3, 'region mesh depth');
  close(meshBox.max.y - meshBox.min.y, height, 1e-3, 'region mesh height');
  close(exactBox.xmax - exactBox.xmin, width, 1e-6, 'region exact width');
  close(exactBox.ymax - exactBox.ymin, depth, 1e-6, 'region exact depth');
  close(exactBox.zmax - exactBox.zmin, height, 1e-6, 'region exact height');

  mesh.dispose();
  console.log(`Multi-loop region parity PASS | 2 holes | mesh ${meshVolume.toFixed(3)} mm^3 | exact ${exactVolume.toFixed(3)} mm^3`);
} finally {
  kernel.releaseAll();
}
