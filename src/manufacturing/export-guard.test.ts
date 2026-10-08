import { describe, expect, it } from 'vitest';
import { assertExportDownloadAllowed } from './export-guard';
import { createExclusiveJobGate } from '../platform/exclusive-job';

describe('guarded manufacturing downloads', () => {
  it('preserves backwards-compatible standalone exports', () => {
    expect(() => assertExportDownloadAllowed()).not.toThrow();
  });
  it('refuses obsolete output before browser download', () => {
    expect(() => assertExportDownloadAllowed(() => false)).toThrow(/changed before download/);
  });
  it('permits only the owning ticket with unchanged project intent', () => {
    const gate = createExclusiveJobGate();
    const current = gate.tryBegin()!;
    expect(() => assertExportDownloadAllowed(() => gate.isCurrent(current))).not.toThrow();
    gate.invalidate();
    expect(() => assertExportDownloadAllowed(() => gate.isCurrent(current))).toThrow(/changed before download/);
    expect(gate.tryBegin()).toBeNull();
    expect(gate.finish(current)).toBe(true);
  });
});
