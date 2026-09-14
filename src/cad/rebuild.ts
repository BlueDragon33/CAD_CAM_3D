import { solveSketch } from './constraints';
import type { CadProject, ChamferFeature, CutFeature, FilletFeature, HoleFeature } from './model';

export type RebuildDiagnostic = {
  level: 'info' | 'warning' | 'error';
  featureId?: string;
  message: string;
};

export type SolidOperationFeature = HoleFeature | CutFeature | FilletFeature | ChamferFeature;

export type RebuiltPart = {
  width: number;
  depth: number;
  height: number;
  holes: HoleFeature[];
  cuts: CutFeature[];
  /** Ordered solid operations used by the exact kernel. Never regroup subtractive/edge features here. */
  operationSequence: SolidOperationFeature[];
  filletRadius: number;
  chamferDistance: number;
  hasSolid: boolean;
  fullyConstrainedSketch: boolean;
  diagnostics: RebuildDiagnostic[];
};

function insideRectangle(x: number, z: number, halfWidth: number, halfDepth: number, marginX: number, marginZ = marginX) {
  return Math.abs(x) + marginX < halfWidth && Math.abs(z) + marginZ < halfDepth;
}

export function rebuildProject(project: CadProject): RebuiltPart {
  let width = Math.max(0.1, project.dimensions.width);
  let depth = Math.max(0.1, project.dimensions.depth);
  let height = 0;
  let hasSketch = false;
  let hasSolid = false;
  let fullyConstrainedSketch = false;
  let filletRadius = 0;
  let chamferDistance = 0;
  const holes: HoleFeature[] = [];
  const cuts: CutFeature[] = [];
  const operationSequence: SolidOperationFeature[] = [];
  const diagnostics: RebuildDiagnostic[] = [];

  for (const feature of project.features) {
    if (!feature.enabled) continue;

    if (feature.kind === 'sketch') {
      const solved = solveSketch(project, feature);
      width = solved.width;
      depth = solved.depth;
      hasSketch = true;
      fullyConstrainedSketch = solved.fullyConstrained;
      for (const message of solved.messages) diagnostics.push({ level: 'warning', featureId: feature.id, message });
      continue;
    }

    if (feature.kind === 'extrude') {
      if (!hasSketch) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Extrude requires an enabled sketch before it.' });
        continue;
      }
      height = Math.max(0.1, project.dimensions.height);
      hasSolid = true;
      continue;
    }

    if (feature.kind === 'hole') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Hole requires an existing solid.' });
        continue;
      }
      // Global-X/Z validation remains useful for the lightweight path. Face-bound
      // features are validated against exact topology at their execution point.
      if (feature.params.placement.mode === 'global-xz') {
        const radius = Math.max(0.1, feature.params.diameter / 2);
        if (!insideRectangle(feature.params.x, feature.params.z, width / 2, depth / 2, radius)) {
          diagnostics.push({ level: 'warning', featureId: feature.id, message: `${feature.name} intersects or escapes the outer profile.` });
          continue;
        }
      }
      holes.push(feature);
      operationSequence.push(feature);
      continue;
    }

    if (feature.kind === 'cut') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Cut requires an existing solid.' });
        continue;
      }
      if (feature.params.placement.mode === 'global-xz') {
        const halfCutWidth = Math.max(0.1, feature.params.width) / 2;
        const halfCutDepth = Math.max(0.1, feature.params.depth) / 2;
        if (!insideRectangle(feature.params.x, feature.params.z, width / 2, depth / 2, halfCutWidth, halfCutDepth)) {
          diagnostics.push({ level: 'warning', featureId: feature.id, message: `${feature.name} intersects or escapes the outer profile.` });
          continue;
        }
      }
      cuts.push(feature);
      operationSequence.push(feature);
      continue;
    }

    if (feature.kind === 'fillet') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Fillet requires an existing solid.' });
        continue;
      }
      filletRadius = Math.max(0, Math.min(feature.params.radius, width / 2, depth / 2, height / 2));
      if (filletRadius > 0) operationSequence.push(feature);
      diagnostics.push({ level: 'info', featureId: feature.id, message: 'Fillet is recorded parametrically; exact B-Rep filleting is delegated to the CAD kernel.' });
      continue;
    }

    if (!hasSolid) {
      diagnostics.push({ level: 'error', featureId: feature.id, message: 'Chamfer requires an existing solid.' });
      continue;
    }
    chamferDistance = Math.max(0, Math.min(feature.params.distance, width / 2, depth / 2, height / 2));
    if (chamferDistance > 0) operationSequence.push(feature);
    diagnostics.push({ level: 'info', featureId: feature.id, message: 'Chamfer is recorded parametrically; exact B-Rep chamfering is delegated to the CAD kernel.' });
  }

  if (!hasSketch) diagnostics.push({ level: 'error', message: 'No enabled sketch exists in the feature history.' });
  if (!hasSolid) diagnostics.push({ level: 'error', message: 'No solid body could be rebuilt.' });

  return {
    width,
    depth,
    height: hasSolid ? height : 0,
    holes,
    cuts,
    operationSequence,
    filletRadius,
    chamferDistance,
    hasSolid,
    fullyConstrainedSketch,
    diagnostics,
  };
}
