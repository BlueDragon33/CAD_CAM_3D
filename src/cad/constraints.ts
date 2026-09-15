import type { CadProject, SketchFeature } from './model';
import { analyzeSketchEntities } from './sketch';

export type SolvedSketch = {
  width: number;
  depth: number;
  centered: boolean;
  fullyConstrained: boolean;
  entityCount: number;
  estimatedDegreesOfFreedom: number;
  messages: string[];
};

function constrainedEntityDof(feature: SketchFeature) {
  const analysis = analyzeSketchEntities(feature.params.entities);
  let reduction = 0;

  for (const constraint of feature.params.constraints) {
    if (constraint.kind === 'horizontal' || constraint.kind === 'vertical') reduction += 1;
    else if (constraint.kind === 'coincident') reduction += 2;
    else if (constraint.kind === 'distance' || constraint.kind === 'radius') reduction += 1;
  }

  return {
    ...analysis,
    estimatedDegreesOfFreedom: Math.max(0, analysis.estimatedDegreesOfFreedom - reduction),
  };
}

/**
 * Deterministic sketch-state analyzer.
 *
 * The manufacturing profile is still the original centered rectangle linked to
 * the project's named width/depth parameters. Schema-v5 sketch primitives are
 * persisted construction geometry for the interactive sketcher and already
 * participate in constraint/DOF diagnostics. They intentionally do not alter
 * the solid profile until arbitrary closed-loop profile generation is wired to
 * both geometry kernels.
 */
export function solveSketch(project: CadProject, feature: SketchFeature): SolvedSketch {
  const constraints = feature.params.constraints;
  const hasCentered = constraints.some((constraint) => constraint.kind === 'centered');
  const hasWidth = constraints.some((constraint) => constraint.kind === 'width');
  const hasDepth = constraints.some((constraint) => constraint.kind === 'depth');
  const entityAnalysis = constrainedEntityDof(feature);
  const messages = [...entityAnalysis.issues];

  if (!hasCentered) messages.push('Sketch is missing the centered profile constraint.');
  if (!hasWidth) messages.push('Sketch width is not tied to the named width parameter.');
  if (!hasDepth) messages.push('Sketch depth is not tied to the named depth parameter.');
  if (entityAnalysis.entityCount > 0 && entityAnalysis.estimatedDegreesOfFreedom > 0) {
    messages.push(`${entityAnalysis.estimatedDegreesOfFreedom} estimated construction-geometry degree(s) of freedom remain.`);
  }

  return {
    width: Math.max(0.1, project.dimensions.width),
    depth: Math.max(0.1, project.dimensions.depth),
    centered: hasCentered,
    fullyConstrained: hasCentered && hasWidth && hasDepth && entityAnalysis.estimatedDegreesOfFreedom === 0,
    entityCount: entityAnalysis.entityCount,
    estimatedDegreesOfFreedom: entityAnalysis.estimatedDegreesOfFreedom,
    messages,
  };
}
