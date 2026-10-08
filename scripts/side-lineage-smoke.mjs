import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();

function line(a, b) {
  return kernel.makeLineEdge({ x: a.x, y: a.y, z: 0 }, { x: b.x, y: b.y, z: 0 });
}

function arc(a, mid, b) {
  return kernel.makeArcEdge(
    { x: a.x, y: a.y, z: 0 },
    { x: mid.x, y: mid.y, z: 0 },
    { x: b.x, y: b.y, z: 0 },
  );
}

function capsuleFace() {
  const topLeft = { x: -15, y: 6 };
  const topRight = { x: 15, y: 6 };
  const bottomRight = { x: 15, y: -6 };
  const bottomLeft = { x: -15, y: -6 };
  const edges = [
    line(topLeft, topRight),
    arc(topRight, { x: 21, y: 0 }, bottomRight),
    line(bottomRight, bottomLeft),
    arc(bottomLeft, { x: -21, y: 0 }, topLeft),
  ];
  return kernel.makeFace(kernel.makeWire(edges));
}

function squareFace(half = 3) {
  const points = [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ];
  return kernel.makeFace(kernel.makeWire(points.map((point, index) => line(point, points[(index + 1) % points.length]))));
}

function close(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

try {
  const height = 8;
  let shape = kernel.extrude(capsuleFace(), 0, 0, height);
  let holeTool = kernel.extrude(squareFace(), 0, 0, height + 2);
  holeTool = kernel.translate(holeTool, 0, 0, -1);
  shape = kernel.cut(shape, holeTool);
  if (!kernel.isValid(shape)) throw new Error('Promoted-profile side-lineage fixture is invalid.');

  const faces = kernel.getSubShapes(shape, 'face');
  let capCount = 0;
  let planarSideCount = 0;
  let cylindricalSideCount = 0;
  let topLineMatched = false;
  let bottomLineMatched = false;
  const tolerance = 1e-5;

  try {
    for (const face of faces) {
      const box = kernel.getBoundingBox(face, false);
      const extentZ = box.zmax - box.zmin;
      if (extentZ <= tolerance) {
        capCount += 1;
        continue;
      }

      const surface = kernel.surfaceType(face);
      if (surface === 'plane') planarSideCount += 1;
      if (surface === 'cylinder') cylindricalSideCount += 1;

      if (surface === 'plane') {
        const spansOuterLine = Math.abs(box.xmin + 15) <= tolerance && Math.abs(box.xmax - 15) <= tolerance;
        if (spansOuterLine && Math.abs(box.ymin - 6) <= tolerance && Math.abs(box.ymax - 6) <= tolerance) topLineMatched = true;
        if (spansOuterLine && Math.abs(box.ymin + 6) <= tolerance && Math.abs(box.ymax + 6) <= tolerance) bottomLineMatched = true;
      }
    }
  } finally {
    for (const face of faces) kernel.release(face);
  }

  close(capCount, 2, 0, 'planar cap count');
  close(planarSideCount, 6, 0, 'planar side count');
  close(cylindricalSideCount, 2, 0, 'cylindrical side count');
  if (!topLineMatched || !bottomLineMatched) throw new Error('Outer Line-derived side faces were not recoverable from their exact bounds.');

  console.log(`Side-lineage topology PASS | caps ${capCount} | planar sides ${planarSideCount} | curved sides ${cylindricalSideCount}`);
} finally {
  kernel.releaseAll();
}
