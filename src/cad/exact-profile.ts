import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { ProfilePathSegment } from './profile';
import type { RebuiltPart } from './rebuild';

function pathFace(kernel: OcctKernel, segments: ProfilePathSegment[]) {
  const edges: ShapeHandle[] = [];
  for (const segment of segments) {
    if (segment.kind === 'line') {
      edges.push(kernel.makeLineEdge(
        { x: segment.start.x, y: segment.start.z, z: 0 },
        { x: segment.end.x, y: segment.end.z, z: 0 },
      ));
      continue;
    }

    const midAngle = (segment.startAngleDeg + segment.sweepDeg / 2) * Math.PI / 180;
    const mid = {
      x: segment.center.x + Math.cos(midAngle) * segment.radiusMm,
      z: segment.center.z + Math.sin(midAngle) * segment.radiusMm,
    };
    edges.push(kernel.makeArcEdge(
      { x: segment.start.x, y: segment.start.z, z: 0 },
      { x: mid.x, y: mid.z, z: 0 },
      { x: segment.end.x, y: segment.end.z, z: 0 },
    ));
  }
  const wire = kernel.makeWire(edges);
  return kernel.makeFace(wire);
}

function circleFace(kernel: OcctKernel, center: { x: number; z: number }, radiusMm: number) {
  const edge = kernel.makeCircleEdge(
    { x: center.x, y: center.z, z: 0 },
    { x: 0, y: 0, z: 1 },
    radiusMm,
  );
  const wire = kernel.makeWire([edge]);
  return kernel.makeFace(wire);
}

/**
 * Build the first exact solid from the same resolved manufacturing profile used
 * by the lightweight mesh kernel. OCCT uses X/Y for the sketch plane and +Z as
 * physical extrusion height; viewport conversion remains in exact-kernel.ts.
 */
export function makeExactBaseSolid(kernel: OcctKernel, rebuilt: RebuiltPart) {
  const profile = rebuilt.manufacturingProfile;
  if (!profile) throw new Error('Exact base solid requires a valid manufacturing profile.');

  if (profile.kind === 'rectangle') {
    let shape = kernel.makeBox(profile.width, profile.depth, rebuilt.height);
    shape = kernel.translate(shape, -profile.width / 2, -profile.depth / 2, 0);
    return shape;
  }

  const face = profile.kind === 'circle'
    ? circleFace(kernel, profile.center, profile.radiusMm)
    : pathFace(kernel, profile.segments);
  return kernel.extrude(face, 0, 0, rebuilt.height);
}
