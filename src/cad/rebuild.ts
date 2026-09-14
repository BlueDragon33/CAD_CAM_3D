import { solveSketch } from './constraints';
import type { CadProject, CutFeature, HoleFeature } from './model';

export type RebuildDiagnostic = {
  level: 'info' | 'warning' | 'error';
  featureId?: string;
  message: string;
};

export type RebuiltPart = {
  width: number;
  depth: number;
  height: number;
  holes: HoleFeature[];
  cuts: CutFeature[];
  filletRadius: number;
  hasSolid: boolean;
  fullyConstrainedSketch: boolean;
  diagnostics: RebuildDiagnostic[];
};

function insideRectangle(x: number, z: number, halfWidth: number, halfDepth: number, marginX: number, marginZ = marginX) {
  return Math.abs(x) + marginX < halfWidth && Math.abs(z) + marginZ < halfDepth;
}

/**
 * Deterministic feature-history rebuild. This is deliberately independent from
 * Three.js and from the future OpenCascade adapter. It acts as the semantic
 * source of truth for the current MVP feature chain.
 */
export function rebuildProject(project: CadProject): RebuiltPart {
  let width = Math.max(0.1, project.dimensions.width);
  let depth = Math.max(0.1, project.dimensions.depth);
  let height = 0;
  let hasSketch = false;
  let hasSolid = false;
  let fullyConstrainedSketch = false;
  let filletRadius = 0;
  const holes: HoleFeature[] = [];
  const cuts: CutFeature[] = [];
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
      const radius = Math.max(0.1, feature.params.diameter / 2);
      if (!insideRectangle(feature.params.x, feature.params.z, width / 2, depth / 2, radius)) {
        diagnostics.push({ level: 'warning', featureId: feature.id, message: `${feature.name} intersects or escapes the outer profile.` });
        continue;
      }
      holes.push(feature);
      continue;
    }

    if (feature.kind === 'cut') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Cut requires an existing solid.' });
        continue;
      }
      const halfCutWidth = Math.max(0.1, feature.params.width) / 2;
      const halfCutDepth = Math.max(0.1, feature.params.depth) / 2;
      if (!insideRectangle(feature.params.x, feature.params.z, width / 2, depth / 2, halfCutWidth, halfCutDepth)) {
        diagnostics.push({ level: 'warning', featureId: feature.id, message: `${feature.name} intersects or escapes the outer profile.` });
        continue;
      }
      cuts.push(feature);
      continue;
    }

    if (feature.kind === 'fillet') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Fillet requires an existing solid.' });
        continue;
      }
      filletRadius = Math.max(0, Math.min(feature.params.radius, width / 2, depth / 2, height / 2));
      diagnostics.push({ level: 'info', featureId: feature.id, message: 'Fillet is recorded parametrically; exact B-Rep filleting will be delegated to the CAD kernel.' });
    }
  }

  if (!hasSketch) diagnostics.push({ level: 'error', message: 'No enabled sketch exists in the feature history.' });
  if (!hasSolid) diagnostics.push({ level: 'error', message: 'No solid body could be rebuilt.' });

  return {
    width,
    depth,
    height: hasSolid ? height : 0,
    holes,
    cuts,
    filletRadius,
    hasSolid,
    fullyConstrainedSketch,
    diagnostics,
  };
}
