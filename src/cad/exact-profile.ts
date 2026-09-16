import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import { classifyBaseFaceLineage } from './base-face-lineage';
import { installBaseFaceLineageSeeds } from './base-face-lineage-registry';
import type { ProfilePathSegment } from './profile';
import type { ManufacturingLoop } from './profile-region';
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

function loopFace(kernel: OcctKernel, loop: ManufacturingLoop) {
  return loop.kind === 'circle'
    ? circleFace(kernel, loop.center, loop.radiusMm)
    : pathFace(kernel, loop.segments);
}

function finalizeBaseSolid(kernel: OcctKernel, shape: ShapeHandle, rebuilt: RebuiltPart) {
  installBaseFaceLineageSeeds(classifyBaseFaceLineage(kernel, shape, rebuilt));
  return shape;
}

/**
 * Build the first exact solid from the same resolved manufacturing profile used
 * by the lightweight mesh kernel. OCCT uses X/Y for the sketch plane and +Z as
 * physical extrusion height; viewport conversion remains in exact-kernel.ts.
 *
 * The finished base solid is also classified against the semantic sketch
 * region. That runtime hash -> role map is transient and only feeds the lineage
 * tracker created immediately after this function returns.
 */
export function makeExactBaseSolid(kernel: OcctKernel, rebuilt: RebuiltPart) {
  const profile = rebuilt.manufacturingProfile;
  if (!profile) throw new Error('Exact base solid requires a valid manufacturing profile.');

  if (profile.kind === 'rectangle') {
    let shape = kernel.makeBox(profile.width, profile.depth, rebuilt.height);
    shape = kernel.translate(shape, -profile.width / 2, -profile.depth / 2, 0);
    return finalizeBaseSolid(kernel, shape, rebuilt);
  }

  if (profile.kind === 'region') {
    let shape = kernel.extrude(loopFace(kernel, profile.outer), 0, 0, rebuilt.height);
    // Extend hole tools beyond both planar caps so Boolean subtraction does not
    // depend on coincident top/bottom faces.
    const overrun = 1;
    for (const hole of profile.holes) {
      let tool = kernel.extrude(loopFace(kernel, hole), 0, 0, rebuilt.height + overrun * 2);
      tool = kernel.translate(tool, 0, 0, -overrun);
      shape = kernel.cut(shape, tool);
    }
    return finalizeBaseSolid(kernel, shape, rebuilt);
  }

  const face = profile.kind === 'circle'
    ? circleFace(kernel, profile.center, profile.radiusMm)
    : pathFace(kernel, profile.segments);
  const shape = kernel.extrude(face, 0, 0, rebuilt.height);
  return finalizeBaseSolid(kernel, shape, rebuilt);
}
