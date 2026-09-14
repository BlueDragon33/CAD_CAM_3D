import type { CadProject } from './model';

/**
 * The lightweight mesh kernel is intentionally optimized for a vertical
 * Sketch/Extrude/Hole/Cut workflow. Features that need arbitrary tool axes or
 * exact edge treatment automatically promote preview/STL to the exact kernel.
 */
export function projectRequiresExactGeometry(project: CadProject) {
  return project.features.some((feature) => {
    if (!feature.enabled) return false;
    if (feature.kind === 'fillet') return feature.params.radius > 0;
    if (feature.kind === 'chamfer') return feature.params.distance > 0;
    if (feature.kind !== 'hole' && feature.kind !== 'cut') return false;
    if (feature.params.placement.mode !== 'face') return false;
    return Math.abs(feature.params.placement.ref.signature.normal[1]) < 0.985;
  });
}
