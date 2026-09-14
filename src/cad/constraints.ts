import type { CadProject, SketchFeature } from './model';

export type SolvedSketch = {
  width: number;
  depth: number;
  centered: boolean;
  fullyConstrained: boolean;
  messages: string[];
};

/**
 * First deterministic sketch solver. It intentionally supports one centered
 * rectangular profile driven by the project's named width/depth parameters.
 * The API is separated now so a real geometric constraint solver can replace
 * this implementation without changing the feature history or UI contract.
 */
export function solveSketch(project: CadProject, feature: SketchFeature): SolvedSketch {
  const constraints = feature.params.constraints;
  const hasCentered = constraints.some((constraint) => constraint.kind === 'centered');
  const hasWidth = constraints.some((constraint) => constraint.kind === 'width');
  const hasDepth = constraints.some((constraint) => constraint.kind === 'depth');
  const messages: string[] = [];

  if (!hasCentered) messages.push('Sketch is missing the centered constraint.');
  if (!hasWidth) messages.push('Sketch width is not tied to a named parameter.');
  if (!hasDepth) messages.push('Sketch depth is not tied to a named parameter.');

  return {
    width: Math.max(0.1, project.dimensions.width),
    depth: Math.max(0.1, project.dimensions.depth),
    centered: hasCentered,
    fullyConstrained: hasCentered && hasWidth && hasDepth,
    messages,
  };
}
