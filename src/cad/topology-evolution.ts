import type { EvolutionData } from 'occt-wasm';
import type { FeatureKind } from './model';

export type EvolutionRelation = {
  sourceHash: number;
  resultHashes: number[];
};

export type TopologyEvolutionStep = {
  featureId: string;
  featureKind: Extract<FeatureKind, 'hole' | 'cut' | 'fillet' | 'chamfer'>;
  beforeFaceHashes: number[];
  afterFaceHashes: number[];
  modified: EvolutionRelation[];
  generated: EvolutionRelation[];
  deleted: number[];
};

export type FaceLineage = {
  id: string;
  bornAtFeatureId: string;
  role: string;
  currentHashes: number[];
};

export type TopologyEvolutionTrace = {
  hashUpperBound: number;
  baseFeatureId: string;
  lineages: FaceLineage[];
  steps: TopologyEvolutionStep[];
  /** Final runtime face hash -> semantic lineage IDs. */
  faceLineageByHash: Record<string, string[]>;
};

export type BaseFaceSeed = {
  hash: number;
  role: string;
};

export function decodeEvolutionRelations(flat: number[], label: string): EvolutionRelation[] {
  const relations: EvolutionRelation[] = [];
  let cursor = 0;
  while (cursor < flat.length) {
    if (cursor + 1 >= flat.length) throw new Error(`${label} evolution stream ended before resultCount.`);
    const sourceHash = flat[cursor++];
    const resultCount = flat[cursor++];
    if (!Number.isInteger(resultCount) || resultCount < 0 || cursor + resultCount > flat.length) {
      throw new Error(`${label} evolution stream contains invalid resultCount ${String(resultCount)}.`);
    }
    relations.push({ sourceHash, resultHashes: flat.slice(cursor, cursor + resultCount) });
    cursor += resultCount;
  }
  return relations;
}

function uniqueSorted(values: Iterable<number>) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function sanitizeRole(role: string) {
  return role.replace(/[^a-zA-Z0-9:+._-]+/g, '-');
}

export class FaceLineageTracker {
  private readonly lineageHashes = new Map<string, Set<number>>();
  private readonly metadata = new Map<string, { bornAtFeatureId: string; role: string }>();
  private readonly steps: TopologyEvolutionStep[] = [];

  constructor(
    readonly hashUpperBound: number,
    readonly baseFeatureId: string,
    baseFaces: BaseFaceSeed[],
  ) {
    const roleCounts = new Map<string, number>();
    for (const face of baseFaces) {
      const role = sanitizeRole(face.role);
      const count = roleCounts.get(role) ?? 0;
      roleCounts.set(role, count + 1);
      const suffix = count === 0 ? role : `${role}:${count + 1}`;
      const id = `${baseFeatureId}:${suffix}`;
      this.lineageHashes.set(id, new Set([face.hash]));
      this.metadata.set(id, { bornAtFeatureId: baseFeatureId, role: suffix });
    }
  }

  record(
    featureId: string,
    featureKind: TopologyEvolutionStep['featureKind'],
    beforeFaceHashes: number[],
    afterFaceHashes: number[],
    evolution: EvolutionData,
  ) {
    const modified = decodeEvolutionRelations(evolution.modified, `${featureKind}.modified`);
    const generated = decodeEvolutionRelations(evolution.generated, `${featureKind}.generated`);
    const deleted = uniqueSorted(evolution.deleted);
    const after = new Set(afterFaceHashes);
    const deletedSet = new Set(deleted);
    const modifiedMap = new Map(modified.map((relation) => [relation.sourceHash, relation.resultHashes]));

    const sourceLineages = new Map<number, string[]>();
    for (const [lineageId, hashes] of this.lineageHashes) {
      for (const hash of hashes) {
        const ids = sourceLineages.get(hash) ?? [];
        ids.push(lineageId);
        sourceLineages.set(hash, ids);
      }
    }

    for (const hashes of this.lineageHashes.values()) {
      const next = new Set<number>();
      for (const hash of hashes) {
        const mapped = modifiedMap.get(hash);
        if (mapped) {
          for (const resultHash of mapped) if (after.has(resultHash)) next.add(resultHash);
          continue;
        }
        if (!deletedSet.has(hash) && after.has(hash)) next.add(hash);
      }
      hashes.clear();
      for (const hash of next) hashes.add(hash);
    }

    const claimed = new Set<number>();
    for (const hashes of this.lineageHashes.values()) for (const hash of hashes) claimed.add(hash);

    let generatedOrdinal = 0;
    for (const relation of generated) {
      const parents = sourceLineages.get(relation.sourceHash) ?? [`hash:${relation.sourceHash}`];
      for (const resultHash of relation.resultHashes) {
        if (!after.has(resultHash) || claimed.has(resultHash)) continue;
        generatedOrdinal += 1;
        const parentToken = parents.map(sanitizeRole).join('+');
        const id = `${featureId}:generated:${parentToken}:${generatedOrdinal}`;
        this.lineageHashes.set(id, new Set([resultHash]));
        this.metadata.set(id, {
          bornAtFeatureId: featureId,
          role: `generated:${featureKind}:${generatedOrdinal}`,
        });
        claimed.add(resultHash);
      }
    }

    let unmappedOrdinal = 0;
    for (const hash of uniqueSorted(after)) {
      if (claimed.has(hash)) continue;
      unmappedOrdinal += 1;
      const id = `${featureId}:introduced:${unmappedOrdinal}`;
      this.lineageHashes.set(id, new Set([hash]));
      this.metadata.set(id, {
        bornAtFeatureId: featureId,
        role: `introduced:${featureKind}:${unmappedOrdinal}`,
      });
      claimed.add(hash);
    }

    this.steps.push({
      featureId,
      featureKind,
      beforeFaceHashes: uniqueSorted(beforeFaceHashes),
      afterFaceHashes: uniqueSorted(afterFaceHashes),
      modified,
      generated,
      deleted,
    });
  }

  lineageIdsForHash(hash: number) {
    const ids: string[] = [];
    for (const [lineageId, hashes] of this.lineageHashes) if (hashes.has(hash)) ids.push(lineageId);
    return ids.sort();
  }

  snapshot(): TopologyEvolutionTrace {
    const lineages: FaceLineage[] = [];
    const faceLineageByHash: Record<string, string[]> = {};

    for (const [id, hashes] of this.lineageHashes) {
      const meta = this.metadata.get(id)!;
      const currentHashes = uniqueSorted(hashes);
      lineages.push({ id, ...meta, currentHashes });
      for (const hash of currentHashes) {
        const key = String(hash);
        (faceLineageByHash[key] ??= []).push(id);
      }
    }

    lineages.sort((a, b) => a.id.localeCompare(b.id));
    for (const ids of Object.values(faceLineageByHash)) ids.sort();

    return {
      hashUpperBound: this.hashUpperBound,
      baseFeatureId: this.baseFeatureId,
      lineages,
      steps: this.steps.map((step) => ({
        ...step,
        beforeFaceHashes: [...step.beforeFaceHashes],
        afterFaceHashes: [...step.afterFaceHashes],
        modified: step.modified.map((relation) => ({ ...relation, resultHashes: [...relation.resultHashes] })),
        generated: step.generated.map((relation) => ({ ...relation, resultHashes: [...relation.resultHashes] })),
        deleted: [...step.deleted],
      })),
      faceLineageByHash,
    };
  }
}
