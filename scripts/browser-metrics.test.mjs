import assert from 'node:assert/strict';
import { test } from 'vitest';
import { browserPerformanceEvidence, nearestRankPercentile, summarizeLatencyMs } from './browser-metrics.mjs';

test('nearest-rank calculation keeps observed values and sorts without mutating input', () => {
  const samples = [99, 4, 18, 1, 7];
  assert.equal(nearestRankPercentile(samples, 0.5), 7);
  assert.equal(nearestRankPercentile(samples, 0.95), 99);
  assert.deepEqual(samples, [99, 4, 18, 1, 7]);
});

test('empty or invalid samples are explicit, never fabricated as pass', () => {
  assert.deepEqual(summarizeLatencyMs([NaN, Infinity, -10]), {
    count: 0, p50Ms: null, p95Ms: null, minMs: null, maxMs: null,
  });
  assert.throws(() => nearestRankPercentile([1], 0), RangeError);
  assert.throws(() => browserPerformanceEvidence({
    navigationMs: [NaN, 1], stepMs: 20, alignedSplitMs: 20,
    budgets: { navigationP95Ms: 100, stepMs: 100, alignedSplitMs: 100 },
  }), /at least three/i);
});

test('a single exact-export observation must not be misreported as P50/P95', () => {
  const evidence = browserPerformanceEvidence({
    navigationMs: [1, 7, 4, 5, 9],
    stepMs: 30, alignedSplitMs: 40,
    budgets: { navigationP95Ms: 100, stepMs: 100, alignedSplitMs: 100 },
    revision: 'example-sha',
  });
  assert.equal(evidence.conclusion, 'PASS');
  assert.deepEqual(evidence.navigation, { count: 5, p50Ms: 5, p95Ms: 9, minMs: 1, maxMs: 9 });
  assert.equal(evidence.stepExport.p50Ms, null);
  assert.equal(evidence.alignedSplitExport.p95Ms, null);
  assert.equal(evidence.revision, 'example-sha');
});

test('regressions fail without lowering a budget or hiding slow samples', () => {
  const evidence = browserPerformanceEvidence({
    navigationMs: [10, 15, 400],
    stepMs: 30, alignedSplitMs: 40,
    budgets: { navigationP95Ms: 100, stepMs: 100, alignedSplitMs: 100 },
  });
  assert.equal(evidence.conclusion, 'FAIL');
  assert.equal(evidence.navigation.p95Ms, 400);
});
