import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { analyzeDownwardOverhang } from './geometry-analysis';

describe('downward overhang heuristic', () => {
  it('ignores the bottom face that lies on the build plane', () => {
    const geometry = new THREE.BoxGeometry(20, 10, 20);
    geometry.translate(0, 5, 0);
    const report = analyzeDownwardOverhang(geometry, 45);
    expect(report.downwardOverhangAreaMm2).toBeCloseTo(0, 6);
    geometry.dispose();
  });

  it('detects an elevated downward-facing plate as an overhang candidate', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -5, 10, -5,
       5, 10,  5,
       5, 10, -5,
      -5, 10, -5,
      -5, 10,  5,
       5, 10,  5,
      -1, 0, -1,
       1, 0,  1,
       1, 0, -1,
    ], 3));
    const report = analyzeDownwardOverhang(geometry, 45);
    expect(report.downwardTriangleCount).toBe(2);
    expect(report.downwardOverhangAreaMm2).toBeCloseTo(100, 6);
    geometry.dispose();
  });
});
