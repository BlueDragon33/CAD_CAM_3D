import * as THREE from 'three';
import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { Dimensions, Vec3Tuple } from './model';
import type { FaceLocalFrame } from './topology-ref';

function appVectorToOcct(value: Vec3Tuple) {
  return new THREE.Vector3(value[0], value[2], value[1]);
}

function appPointToOcct(value: Vec3Tuple) {
  return { x: value[0], y: value[2], z: value[1] };
}

function rotationFromFaceFrame(frame: FaceLocalFrame) {
  const u = appVectorToOcct(frame.uAxis).normalize();
  const v = appVectorToOcct(frame.vAxis).normalize();
  const normal = appVectorToOcct(frame.normal).normalize();
  const matrix = new THREE.Matrix4().makeBasis(u, v, normal);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();

  // q and -q encode the same rotation. Force a non-negative scalar term so
  // axis-angle conversion uses the shorter rotation and stays deterministic.
  if (quaternion.w < 0) {
    quaternion.x *= -1;
    quaternion.y *= -1;
    quaternion.z *= -1;
    quaternion.w *= -1;
  }

  const w = THREE.MathUtils.clamp(quaternion.w, -1, 1);
  const angle = 2 * Math.acos(w);
  const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
  const axis = sinHalf <= 1e-10
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(quaternion.x / sinHalf, quaternion.y / sinHalf, quaternion.z / sinHalf).normalize();

  return { axis, angle };
}

function orientCanonicalTool(kernel: OcctKernel, shape: ShapeHandle, frame: FaceLocalFrame) {
  const { axis, angle } = rotationFromFaceFrame(frame);
  if (angle <= 1e-10) return shape;
  return kernel.rotate(
    shape,
    {
      point: { x: 0, y: 0, z: 0 },
      direction: { x: axis.x, y: axis.y, z: axis.z },
    },
    angle,
  );
}

/**
 * Place canonical sketch geometry (XY plane, +Z normal in OCCT coordinates)
 * onto an application face frame. This is shared by attached Pad/Pocket tools
 * and keeps the orientation convention identical to Hole/Cut.
 */
export function placeCanonicalShapeOnFace(
  kernel: OcctKernel,
  shape: ShapeHandle,
  point: Vec3Tuple,
  frame: FaceLocalFrame,
) {
  const oriented = orientCanonicalTool(kernel, shape, frame);
  const origin = appPointToOcct(point);
  return kernel.translate(oriented, origin.x, origin.y, origin.z);
}

/**
 * A through-feature tool is centered on the selected face point and extends
 * farther than the complete part diagonal in both normal directions. This
 * makes the Boolean independent from whether the resolved face normal points
 * inward or outward.
 */
export function throughToolLength(dimensions: Dimensions) {
  return Math.max(4, Math.hypot(dimensions.width, dimensions.depth, dimensions.height) * 2 + 4);
}

export function makeOrientedCylinderTool(
  kernel: OcctKernel,
  radiusMm: number,
  point: Vec3Tuple,
  frame: FaceLocalFrame,
  dimensions: Dimensions,
) {
  const length = throughToolLength(dimensions);
  let tool = kernel.makeCylinder(radiusMm, length);
  tool = kernel.translate(tool, 0, 0, -length / 2);
  return placeCanonicalShapeOnFace(kernel, tool, point, frame);
}

export function makeOrientedBoxTool(
  kernel: OcctKernel,
  widthMm: number,
  depthMm: number,
  point: Vec3Tuple,
  frame: FaceLocalFrame,
  dimensions: Dimensions,
) {
  const length = throughToolLength(dimensions);
  let tool = kernel.makeBox(widthMm, depthMm, length);
  tool = kernel.translate(tool, -widthMm / 2, -depthMm / 2, -length / 2);
  return placeCanonicalShapeOnFace(kernel, tool, point, frame);
}
