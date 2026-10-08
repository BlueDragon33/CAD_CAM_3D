import { describe, expect, it } from 'vitest';
import { createExclusiveJobGate } from './exclusive-job';

describe('exclusive async operation ownership', () => {
  it('rejects rapid repeat clicks synchronously and releases only after completion', () => {
    const gate = createExclusiveJobGate();
    const first = gate.tryBegin();
    expect(first).not.toBeNull();
    expect(gate.isBusy()).toBe(true);
    expect(gate.tryBegin()).toBeNull();
    expect(gate.isCurrent(first!)).toBe(true);
    expect(gate.finish(first!)).toBe(true);
    expect(gate.isBusy()).toBe(false);
    expect(gate.tryBegin()).not.toBeNull();
  });

  it('invalidates an in-flight result after a project edit without permitting concurrent rebuilds', () => {
    const gate = createExclusiveJobGate();
    const first = gate.tryBegin()!;
    gate.invalidate();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isBusy()).toBe(true);
    expect(gate.tryBegin()).toBeNull();
    expect(gate.finish(first)).toBe(true);
    const second = gate.tryBegin()!;
    expect(gate.isCurrent(second)).toBe(true);
  });

  it('rejects stale failures and stale tickets cannot clear a newer operation', () => {
    const gate = createExclusiveJobGate();
    const first = gate.tryBegin()!;
    gate.invalidate();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.finish(first)).toBe(true);
    const second = gate.tryBegin()!;
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.finish(first)).toBe(false);
    expect(gate.isBusy()).toBe(true);
    expect(gate.isCurrent(second)).toBe(true);
    expect(gate.finish(second)).toBe(true);
  });

  it('does not treat a forged same-revision ticket as the active owner', () => {
    const gate = createExclusiveJobGate();
    const first = gate.tryBegin()!;
    expect(gate.isCurrent({ revision: first.revision })).toBe(false);
    expect(gate.finish({ revision: first.revision })).toBe(false);
    expect(gate.isCurrent(first)).toBe(true);
  });
});
