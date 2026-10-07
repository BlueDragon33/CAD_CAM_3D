import { solveSketch } from './constraints';
import type {
  CadProject,
  ChamferFeature,
  CutFeature,
  FilletFeature,
  HoleFeature,
  LinearPatternFeature,
  PadFeature,
  PocketFeature,
  ShellFeature,
  SketchFeature,
} from './model';
import {
  resolveManufacturingProfileWithRegions,
  type ResolvedManufacturingProfile,
} from './profile-region';
import { isSupportedPlanarFace } from './topology-ref';

export type RebuildDiagnostic = {
  level: 'info' | 'warning' | 'error';
  featureId?: string;
  message: string;
};

export type SolidOperationFeature = PadFeature | PocketFeature | HoleFeature | CutFeature | FilletFeature | ChamferFeature | ShellFeature | LinearPatternFeature;

export type RebuiltPart = {
  width: number;
  depth: number;
  height: number;
  manufacturingProfile: ResolvedManufacturingProfile | null;
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
  let lastSketch: SketchFeature | null = null;
  let fullyConstrainedSketch = false;
  let manufacturingProfile: ResolvedManufacturingProfile | null = null;
  let filletRadius = 0;
  let chamferDistance = 0;
  const holes: HoleFeature[] = [];
  const cuts: CutFeature[] = [];
  const operationSequence: SolidOperationFeature[] = [];
  const diagnostics: RebuildDiagnostic[] = [];
  const sketchesById = new Map<string, SketchFeature>();
  const repeatableFeaturesById = new Map<string, HoleFeature | CutFeature>();

  for (const feature of project.features) {
    if (!feature.enabled) continue;

    if (feature.kind === 'sketch') {
      const solved = solveSketch(project, feature);
      lastSketch = feature;
      sketchesById.set(feature.id, feature);
      for (const message of solved.messages) diagnostics.push({
        level: message.startsWith('Constraint conflict:') ? 'error' : 'warning',
        featureId: feature.id,
        message,
      });

      if (feature.params.plane.kind === 'face') {
        if (solved.constraintState === 'inconsistent') {
          diagnostics.push({
            level: 'error',
            featureId: feature.id,
            message: 'Attached sketch has inconsistent constraints. Downstream material features must not consume it until the conflict is repaired.',
          });
        } else if (!isSupportedPlanarFace(feature.params.plane.ref)) {
          diagnostics.push({
            level: 'error',
            featureId: feature.id,
            message: 'Attached sketch references a surface that is not in the currently supported planar lineage set.',
          });
        } else {
          diagnostics.push({
            level: 'info',
            featureId: feature.id,
            message: 'Attached planar sketch is persisted as local U/V intent. It does not replace the base manufacturing profile.',
          });
        }
        continue;
      }

      hasSketch = true;
      fullyConstrainedSketch = solved.fullyConstrained;
      if (solved.constraintState === 'inconsistent') {
        manufacturingProfile = null;
        diagnostics.push({
          level: 'error',
          featureId: feature.id,
          message: 'Base manufacturing sketch has inconsistent constraints; solid creation is blocked instead of choosing a constraint by execution order.',
        });
        continue;
      }
      const resolvedProfile = resolveManufacturingProfileWithRegions(solved.entities, solved.width, solved.depth);
      manufacturingProfile = resolvedProfile.profile;
      if (!manufacturingProfile) {
        for (const issue of resolvedProfile.issues) diagnostics.push({ level: 'error', featureId: feature.id, message: `Manufacturing profile: ${issue}` });
      } else {
        width = manufacturingProfile.bounds.width;
        depth = manufacturingProfile.bounds.depth;
        if (resolvedProfile.promoted) {
          const holeSuffix = manufacturingProfile.kind === 'region'
            ? ` · ${manufacturingProfile.holes.length} inner hole(s)`
            : '';
          diagnostics.push({
            level: 'info',
            featureId: feature.id,
            message: `Promoted ${manufacturingProfile.kind} sketch profile is driving the manufacturing solid (${manufacturingProfile.areaMm2.toFixed(2)} mm²${holeSuffix}).`,
          });
        }
      }
      continue;
    }

    if (feature.kind === 'extrude') {
      if (lastSketch?.params.plane.kind === 'face') {
        diagnostics.push({
          level: 'error',
          featureId: feature.id,
          message: 'Base Extrude does not consume an attached Sketch. Use Pad or Pocket for face-attached material operations.',
        });
        continue;
      }
      if (!hasSketch || !manufacturingProfile) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Extrude requires an enabled base sketch with a valid manufacturing profile before it.' });
        continue;
      }
      height = Math.max(0.1, project.dimensions.height);
      hasSolid = true;
      continue;
    }

    if (feature.kind === 'pad' || feature.kind === 'pocket') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: `${feature.name} requires an existing solid.` });
        continue;
      }
      const sourceSketch = sketchesById.get(feature.params.sketchId);
      if (!sourceSketch || sourceSketch.params.plane.kind !== 'face') {
        diagnostics.push({ level: 'error', featureId: feature.id, message: `${feature.name} requires an enabled earlier face-attached Sketch.` });
        continue;
      }
      const promotedEntities = sourceSketch.params.entities.filter((entity) => !entity.construction);
      if (promotedEntities.length === 0) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: `${feature.name} requires a promoted profile in its attached Sketch.` });
        continue;
      }
      const sourceSolved = solveSketch(project, sourceSketch);
      if (sourceSolved.constraintState === 'inconsistent') {
        diagnostics.push({
          level: 'error',
          featureId: feature.id,
          message: `${feature.name} source Sketch has inconsistent constraints and cannot be consumed safely.`,
        });
        continue;
      }
      const sourceProfile = resolveManufacturingProfileWithRegions(
        sourceSolved.entities,
        sourceSolved.width,
        sourceSolved.depth,
      );
      if (!sourceProfile.promoted || !sourceProfile.profile) {
        diagnostics.push({
          level: 'error',
          featureId: feature.id,
          message: `${feature.name} source Sketch does not contain one valid supported profile region.`,
        });
        continue;
      }
      operationSequence.push(feature);
      diagnostics.push({
        level: 'info',
        featureId: feature.id,
        message: feature.kind === 'pad'
          ? `Pad will add material ${feature.params.distanceMm.toFixed(2)} mm along the resolved sketch-plane normal using the exact kernel.`
          : feature.params.extent === 'through-all'
            ? 'Pocket will remove material through-all opposite the resolved sketch-plane normal using the exact kernel.'
            : `Pocket will remove material ${feature.params.distanceMm.toFixed(2)} mm inward using the exact kernel.`,
      });
      continue;
    }

    if (feature.kind === 'hole') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Hole requires an existing solid.' });
        continue;
      }
      // The rectangle path can reject obvious out-of-profile tools cheaply. For
      // promoted profiles the geometry kernels own the final Boolean validity so
      // we do not apply a rectangular-envelope test to arbitrary loops.
      if (feature.params.placement.mode === 'global-xz' && manufacturingProfile?.kind === 'rectangle') {
        const radius = Math.max(0.1, feature.params.diameter / 2);
        if (!insideRectangle(feature.params.x, feature.params.z, width / 2, depth / 2, radius)) {
          diagnostics.push({ level: 'warning', featureId: feature.id, message: `${feature.name} intersects or escapes the outer profile.` });
          continue;
        }
      }
      holes.push(feature);
      operationSequence.push(feature);
      repeatableFeaturesById.set(feature.id, feature);
      continue;
    }

    if (feature.kind === 'cut') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Cut requires an existing solid.' });
        continue;
      }
      if (feature.params.placement.mode === 'global-xz' && manufacturingProfile?.kind === 'rectangle') {
        const halfCutWidth = Math.max(0.1, feature.params.width) / 2;
        const halfCutDepth = Math.max(0.1, feature.params.depth) / 2;
        if (!insideRectangle(feature.params.x, feature.params.z, width / 2, depth / 2, halfCutWidth, halfCutDepth)) {
          diagnostics.push({ level: 'warning', featureId: feature.id, message: `${feature.name} intersects or escapes the outer profile.` });
          continue;
        }
      }
      cuts.push(feature);
      operationSequence.push(feature);
      repeatableFeaturesById.set(feature.id, feature);
      continue;
    }

    if (feature.kind === 'linear-pattern') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Linear Pattern requires an existing solid.' });
        continue;
      }
      const source = repeatableFeaturesById.get(feature.params.sourceFeatureId);
      if (!source) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Linear Pattern requires an enabled earlier Hole or Cut source feature.' });
        continue;
      }
      const faceBound = source.params.placement.mode === 'face';
      const validAxis = faceBound
        ? feature.params.axis === 'u' || feature.params.axis === 'v'
        : feature.params.axis === 'x' || feature.params.axis === 'z';
      if (!validAxis) {
        diagnostics.push({
          level: 'error',
          featureId: feature.id,
          message: faceBound
            ? 'Face-bound Linear Pattern must use local U or V.'
            : 'Global Linear Pattern must use global X or Z.',
        });
        continue;
      }
      if (!Number.isInteger(feature.params.count) || feature.params.count < 2 || feature.params.count > 64) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Linear Pattern count must be an integer from 2 through 64.' });
        continue;
      }
      if (!Number.isFinite(feature.params.spacingMm) || feature.params.spacingMm < 0.1) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Linear Pattern spacing must be at least 0.1 mm.' });
        continue;
      }
      operationSequence.push(feature);
      diagnostics.push({
        level: 'info',
        featureId: feature.id,
        message: `Linear Pattern will derive ${feature.params.count - 1} additional ${source.kind} instance(s) from ${source.name} at ${feature.params.spacingMm.toFixed(2)} mm spacing on ${feature.params.axis.toUpperCase()}.`,
      });
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

    if (feature.kind === 'chamfer') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Chamfer requires an existing solid.' });
        continue;
      }
      chamferDistance = Math.max(0, Math.min(feature.params.distance, width / 2, depth / 2, height / 2));
      if (chamferDistance > 0) operationSequence.push(feature);
      diagnostics.push({ level: 'info', featureId: feature.id, message: 'Chamfer is recorded parametrically; exact B-Rep chamfering is delegated to the CAD kernel.' });
      continue;
    }

    if (feature.kind === 'shell') {
      if (!hasSolid) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Shell requires an existing solid.' });
        continue;
      }
      if (feature.params.openings.length === 0) {
        diagnostics.push({ level: 'error', featureId: feature.id, message: 'Shell requires at least one durable opening-face reference.' });
        continue;
      }
      const maximumThickness = Math.max(0.1, Math.min(width, depth, height) / 2);
      if (feature.params.thicknessMm >= maximumThickness) {
        diagnostics.push({
          level: 'warning',
          featureId: feature.id,
          message: `Shell thickness ${feature.params.thicknessMm.toFixed(2)} mm approaches or exceeds half the smallest rebuilt span; OpenCascade may reject the offset.`,
        });
      }
      operationSequence.push(feature);
      diagnostics.push({
        level: 'info',
        featureId: feature.id,
        message: `Shell will hollow the exact body inward by ${feature.params.thicknessMm.toFixed(2)} mm and remove ${feature.params.openings.length} persisted opening face(s).`,
      });
      continue;
    }
  }

  if (!hasSketch) diagnostics.push({ level: 'error', message: 'No enabled sketch exists in the feature history.' });
  if (!hasSolid) diagnostics.push({ level: 'error', message: 'No solid body could be rebuilt.' });

  return {
    width,
    depth,
    height: hasSolid ? height : 0,
    manufacturingProfile,
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
