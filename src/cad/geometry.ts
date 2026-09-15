import * as THREE from 'three';
import type { CadProject } from './model';
import { rebuildProject, type RebuiltPart } from './rebuild';

export type PartGeometryBuild = {
  rebuilt: RebuiltPart;
  geometry: THREE.BufferGeometry | null;
};

function buildOuterProfile(rebuilt: RebuiltPart) {
  const profile = rebuilt.manufacturingProfile;
  if (!profile) return null;
  const shape = new THREE.Shape();

  if (profile.kind === 'rectangle') {
    const halfWidth = profile.width / 2;
    const halfDepth = profile.depth / 2;
    shape.moveTo(-halfWidth, -halfDepth);
    shape.lineTo(halfWidth, -halfDepth);
    shape.lineTo(halfWidth, halfDepth);
    shape.lineTo(-halfWidth, halfDepth);
    shape.closePath();
    return shape;
  }

  if (profile.kind === 'circle') {
    shape.absarc(profile.center.x, profile.center.z, profile.radiusMm, 0, Math.PI * 2, false);
    shape.closePath();
    return shape;
  }

  const [first, ...rest] = profile.points;
  shape.moveTo(first.x, first.z);
  for (const point of rest) shape.lineTo(point.x, point.z);
  shape.closePath();
  return shape;
}

function buildProfile(rebuilt: RebuiltPart) {
  const shape = buildOuterProfile(rebuilt);
  if (!shape) return null;

  for (const feature of rebuilt.holes) {
    const hole = new THREE.Path();
    hole.absarc(
      feature.params.x,
      feature.params.z,
      feature.params.diameter / 2,
      0,
      Math.PI * 2,
      true,
    );
    shape.holes.push(hole);
  }

  for (const feature of rebuilt.cuts) {
    const cut = new THREE.Path();
    const halfCutWidth = feature.params.width / 2;
    const halfCutDepth = feature.params.depth / 2;

    cut.moveTo(feature.params.x - halfCutWidth, feature.params.z - halfCutDepth);
    cut.lineTo(feature.params.x - halfCutWidth, feature.params.z + halfCutDepth);
    cut.lineTo(feature.params.x + halfCutWidth, feature.params.z + halfCutDepth);
    cut.lineTo(feature.params.x + halfCutWidth, feature.params.z - halfCutDepth);
    cut.closePath();
    shape.holes.push(cut);
  }

  return shape;
}

/**
 * Build the current printable mesh from the semantic feature-history result.
 * This module is shared by interactive preview and the lightweight STL path.
 * Promoted simple Line-loop/Circle profiles therefore use the same persisted
 * manufacturing profile as the exact B-Rep path instead of a parallel model.
 */
export function buildPartGeometry(project: CadProject): PartGeometryBuild {
  const rebuilt = rebuildProject(project);
  if (!rebuilt.hasSolid) return { rebuilt, geometry: null };
  const profile = buildProfile(rebuilt);
  if (!profile) return { rebuilt, geometry: null };

  const geometry = new THREE.ExtrudeGeometry(profile, {
    depth: rebuilt.height,
    bevelEnabled: false,
    curveSegments: 64,
    steps: 1,
  });

  // ExtrudeGeometry creates the profile in XY and extrudes along +Z. Rotate it
  // into this application's X/Z footprint with +Y as the physical height axis.
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { rebuilt, geometry };
}
