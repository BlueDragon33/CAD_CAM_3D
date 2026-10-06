import { solveSketch } from './constraints';
import type {
  CadProject,
  ChamferFeature,
  CutFeature,
  FilletFeature,
  HoleFeature,
  PadFeature,
  PocketFeature,
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

export type SolidOperationFeature = PadFeature | PocketFeature | HoleFeature | CutFeature | FilletFeature | ChamferFeature;

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

  for (const feature of project.features) {
    if (!feature.enabled) continue;

    if (feature.kind === 'sketch') {
      const solved = solveSketch(project, feature);
      lastSketch = feature;
      sketchesById.set(feature.id, feature);
      for (const message of solved.messages) diagnostics.push({ level: 'warning', featureId: feature.id, message });

      if (feature.params.plane.kind === 'face') {
        if (!isSupportedPlanarFace(feature.params.plane.ref)) {
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
      const resolvedProfile = resolveManufacturingProfileWithRegions(feature.params.entities, solved.width, solved.depth);
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
          message: 'Extrude from an attached planar sketch is not enabled in WP-A; the existing solid is preserved until the attached-feature contract is implemented.',
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
      const sourceProfile = resolveManufacturingProfileWithRegions(
        sourceSketch.params.entities,
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
