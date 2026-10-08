import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createManufacturingExportMesh } from './export';

describe('manufacturing coordinate transform', () => {
  it('maps workspace Y-up height to slicer Z-up without reflecting handedness', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      1, 2, 3,
      4, 5, 6,
      7, 8, 9,
    ], 3));
    const mesh = createManufacturingExportMesh(geometry);

    const point = new THREE.Vector3(1, 2, 3).applyMatrix4(mesh.matrixWorld);
    expect(point.x).toBeCloseTo(1, 8);
    expect(point.y).toBeCloseTo(-3, 8);
    expect(point.z).toBeCloseTo(2, 8);

    const determinant = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld).determinant();
    expect(determinant).toBeCloseTo(1, 8);
    geometry.dispose();
  });
});
