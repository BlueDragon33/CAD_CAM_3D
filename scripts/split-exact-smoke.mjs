import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();

function close(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

try {
  const width = 300;
  const depth = 40;
  const height = 12;

  let base = kernel.makeBox(width, depth, height);
  base = kernel.translate(base, -width / 2, -depth / 2, 0);
  if (!kernel.isValid(base)) throw new Error('Exact split smoke base is invalid.');

  const bbox = kernel.getBoundingBox(base, false);
  const ranges = [
    { xmin: bbox.xmin, xmax: bbox.xmin + width / 2 },
    { xmin: bbox.xmin + width / 2, xmax: bbox.xmax },
  ];

  const pieces = ranges.map((range, index) => {
    const clip = kernel.makeBoxFromCorners(
      { x: range.xmin, y: bbox.ymin, z: bbox.zmin },
      { x: range.xmax, y: bbox.ymax, z: bbox.zmax },
    );
    const piece = kernel.common(base, clip);
    if (!kernel.isValid(piece)) throw new Error(`Exact split piece ${index + 1} is invalid.`);
    const solids = kernel.getSubShapes(piece, 'solid');
    try {
      if (solids.length !== 1) {
        throw new Error(`Exact split piece ${index + 1} expected one solid, got ${solids.length}.`);
      }
    } finally {
      for (const solid of solids) kernel.release(solid);
    }
    return piece;
  });

  const expectedPieceVolume = (width / 2) * depth * height;
  let totalVolume = 0;
  for (const [index, piece] of pieces.entries()) {
    const pieceBox = kernel.getBoundingBox(piece, false);
    const pieceVolume = kernel.getVolume(piece);
    close(pieceBox.xmax - pieceBox.xmin, width / 2, 1e-6, `piece ${index + 1} width`);
    close(pieceBox.ymax - pieceBox.ymin, depth, 1e-6, `piece ${index + 1} depth`);
    close(pieceBox.zmax - pieceBox.zmin, height, 1e-6, `piece ${index + 1} height`);
    close(pieceVolume, expectedPieceVolume, 1e-4, `piece ${index + 1} volume`);
    totalVolume += pieceVolume;
  }

  close(totalVolume, kernel.getVolume(base), 1e-4, 'split volume conservation');

  console.log(`Exact split smoke PASS | ${pieces.length} B-Rep pieces | total volume ${totalVolume.toFixed(3)} mm^3`);

} finally {
  kernel.releaseAll();
}
