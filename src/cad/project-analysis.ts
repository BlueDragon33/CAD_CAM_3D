import type { CadProject } from './model';

/**
 * The lightweight mesh kernel is intentionally optimized for direct profile
 * extrusion and the legacy rectangular through-feature workflow. Exact edge
 * treatment, arbitrary tool axes, and subtractive features on a promoted sketch
 * profile automatically route preview/STL through OpenCascade so an outside or
 * grazing Boolean cannot be misrepresented by Three.js shape-hole semantics.
 */
export function projectRequiresExactGeometry(project: CadProject) {
  const promotedSketchProfile = project.features.some((feature) => (
    feature.enabled
    && feature.kind === 'sketch'
    && feature.params.entities.some((entity) => !entity.construction)
  ));

  return project.features.some((feature) => {
    if (!feature.enabled) return false;
    if (feature.kind === 'fillet') return feature.params.radius > 0;
    if (feature.kind === 'chamfer') return feature.params.distance > 0;
    if (feature.kind !== 'hole' && feature.kind !== 'cut') return false;
    if (promotedSketchProfile) return true;
    if (feature.params.placement.mode !== 'face') return false;
    return Math.abs(feature.params.placement.ref.signature.normal[1]) < 0.985;
  });
}
