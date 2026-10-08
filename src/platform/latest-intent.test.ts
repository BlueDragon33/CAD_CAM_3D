import { describe, expect, it } from 'vitest';
import { createLatestIntentGate } from './latest-intent';

describe('latest async user intent', () => {
  it('accepts only the latest of two out-of-order file reads', () => {
    const gate = createLatestIntentGate();
    const older = gate.begin();
    const newer = gate.begin();
    expect(gate.isCurrent(older)).toBe(false);
    expect(gate.isCurrent(newer)).toBe(true);
  });
  it('rejects a pending file when the user edits, undoes or resets the project', () => {
    const gate = createLatestIntentGate();
    const opening = gate.begin();
    gate.invalidate();
    expect(gate.isCurrent(opening)).toBe(false);
    expect(gate.isCurrent(gate.begin())).toBe(true);
  });
  it('a failed older file read may not overwrite the newest status', () => {
    const gate = createLatestIntentGate();
    const failed = gate.begin();
    gate.begin();
    expect(gate.isCurrent(failed)).toBe(false);
  });
});
