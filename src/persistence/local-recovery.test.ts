import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../cad/model';
import {
  listRecoverySnapshots,
  restoreRecoverySnapshot,
  saveRecoverySnapshot,
  type RecoveryStorage,
} from './local-recovery';

function memoryStorage(): RecoveryStorage {
  const data = new Map<string, string>();
  return {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, value); },
  };
}

describe('local recovery snapshots', () => {
  it('keeps a bounded newest-first recovery history', () => {
    const storage = memoryStorage();
    const project = createDefaultProject();

    for (let index = 0; index < 7; index += 1) {
      project.dimensions.width = 60 + index;
      saveRecoverySnapshot(project, storage, new Date('2026-10-07T00:00:0' + index + 'Z'));
    }

    const snapshots = listRecoverySnapshots(storage);
    expect(snapshots).toHaveLength(5);
    expect(snapshots[0].savedAt).toBe('2026-10-07T00:00:06.000Z');
    expect(snapshots[4].savedAt).toBe('2026-10-07T00:00:02.000Z');
  });

  it('restores through the normal schema parser rather than bypassing validation', () => {
    const storage = memoryStorage();
    const project = createDefaultProject();
    project.name = 'Recovered bracket';
    project.dimensions.width = 91;

    const snapshot = saveRecoverySnapshot(project, storage, new Date('2026-10-07T01:00:00Z'));
    const restored = restoreRecoverySnapshot(snapshot);

    expect(restored.project.name).toBe('Recovered bracket');
    expect(restored.project.dimensions.width).toBe(91);
    expect(restored.schemaVersion).toBeGreaterThanOrEqual(12);
  });
});
