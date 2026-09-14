import * as THREE from 'three';
import type { CadProject } from './model';
import { rebuildProject, type RebuiltPart } from './rebuild';

export type PartGeometryBuild = {
  rebuilt: RebuiltPart;
  geometry: THREE.BufferGeometry | null;
};

function buildProfile(rebuilt: RebuiltPart) {
  const shape = new THREE.Shape();
  const halfWidth = rebuilt.width / 2;
  const halfDepth = rebuilt.depth / 2;

  shape.moveTo(-halfWidth, -halfDepth);
  shape.lineTo(halfWidth, -halfDepth);
  shape.lineTo(halfWidth, halfDepth);
  shape.lineTo(-halfWidth, halfDepth);
  shape.closePath();

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
 * This module is the single geometry adapter used by both the viewport and STL
 * export, so the exported file cannot silently diverge from the preview.
 *
 * Exact filleting intentionally remains outside this adapter until the B-Rep
 * kernel lands. The semantic fillet feature is still preserved by rebuild.ts.
 */
export function buildPartGeometry(project: CadProject): PartGeometryBuild {
  const rebuilt = rebuildProject(project);
  if (!rebuilt.hasSolid) return { rebuilt, geometry: null };

  const geometry = new THREE.ExtrudeGeometry(buildProfile(rebuilt), {
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
