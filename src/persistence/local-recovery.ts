import type { CadProject } from '../cad/model';
import { parseProjectDocument, serializeProject } from '../cad/project-io';

export type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type RecoverySnapshot = {
  id: string;
  projectId: string;
  projectName: string;
  savedAt: string;
  document: string;
};

const RECOVERY_KEY = 'cad-cam-3d:recovery:v1';
const MAX_SNAPSHOTS = 5;

function parseEnvelope(raw: string | null): RecoverySnapshot[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is RecoverySnapshot => {
      if (typeof entry !== 'object' || entry === null) return false;
      const record = entry as Record<string, unknown>;
      return typeof record.id === 'string'
        && typeof record.projectId === 'string'
        && typeof record.projectName === 'string'
        && typeof record.savedAt === 'string'
        && typeof record.document === 'string';
    });
  } catch {
    return [];
  }
}

function writeEnvelope(storage: RecoveryStorage, snapshots: RecoverySnapshot[]) {
  storage.setItem(RECOVERY_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
}

export function listRecoverySnapshots(storage: RecoveryStorage): RecoverySnapshot[] {
  return parseEnvelope(storage.getItem(RECOVERY_KEY))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_SNAPSHOTS);
}

export function saveRecoverySnapshot(
  project: CadProject,
  storage: RecoveryStorage,
  now = new Date(),
): RecoverySnapshot {
  const document = serializeProject(project);
  const savedAt = now.toISOString();
  const snapshot: RecoverySnapshot = {
    id: project.id + ':' + savedAt,
    projectId: project.id,
    projectName: project.name,
    savedAt,
    document,
  };

  const current = listRecoverySnapshots(storage);
  const deduped = current.filter((entry) => entry.projectId !== project.id || entry.document !== document);
  writeEnvelope(storage, [snapshot, ...deduped]);
  return snapshot;
}

export function restoreRecoverySnapshot(snapshot: RecoverySnapshot) {
  return parseProjectDocument(snapshot.document);
}

export function newestRecoverySnapshot(storage: RecoveryStorage) {
  return listRecoverySnapshots(storage)[0] ?? null;
}
