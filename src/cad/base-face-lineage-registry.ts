import type { BaseFaceSeed } from './topology-evolution';

let activeRoles = new Map<number, string>();

/**
 * Transient hand-off between exact base-solid construction and the lineage
 * tracker created immediately afterwards. Exact-kernel builds are serialized,
 * so this registry is replaced atomically for each base solid. No runtime hash
 * or semantic role from this map is persisted into CadProject JSON.
 */
export function installBaseFaceLineageSeeds(seeds: BaseFaceSeed[]) {
  activeRoles = new Map(seeds.map((seed) => [seed.hash, seed.role] as const));
}

export function registeredBaseFaceRole(hash: number) {
  return activeRoles.get(hash) ?? null;
}

export function clearBaseFaceLineageSeeds() {
  activeRoles.clear();
}
