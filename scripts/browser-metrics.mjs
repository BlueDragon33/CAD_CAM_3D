/** A descriptive measurement summary; not an SLA or performance promise. */
export function nearestRankPercentile(samples, fraction) {
  if (!(fraction > 0 && fraction <= 1)) throw new RangeError('Percentile fraction must be (0,1].');
  const values = samples.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (values.length === 0) return null;
  return values[Math.ceil(values.length * fraction) - 1];
}

export function summarizeLatencyMs(samples) {
  const valid = samples.filter((value) => Number.isFinite(value) && value >= 0);
  return {
    count: valid.length,
    p50Ms: nearestRankPercentile(valid, 0.5),
    p95Ms: nearestRankPercentile(valid, 0.95),
    minMs: valid.length ? Math.min(...valid) : null,
    maxMs: valid.length ? Math.max(...valid) : null,
  };
}

export function browserPerformanceEvidence({ navigationMs, stepMs, alignedSplitMs, budgets, revision }) {
  const navigation = summarizeLatencyMs(navigationMs);
  if (navigation.count < 3) throw new Error('At least three valid real-browser navigation samples are required.');
  if (![stepMs, alignedSplitMs].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error('Exact export timing samples must be finite and non-negative.');
  }
  if (!Object.values(budgets).every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('CI performance regression budgets must be finite and positive.');
  }
  return {
    schema: 'cad-cam-3d.browser-performance/v1',
    evidenceClass: 'CI_BROWSER_ONLY_NOT_SLA',
    revision: revision || 'unknown',
    navigation,
    rawNavigationMs: navigationMs.filter((value) => Number.isFinite(value) && value >= 0),
    stepExport: { count: 1, durationMs: stepMs, p50Ms: null, p95Ms: null },
    alignedSplitExport: { count: 1, durationMs: alignedSplitMs, p50Ms: null, p95Ms: null },
    budgets,
    conclusion: navigation.p95Ms <= budgets.navigationP95Ms
      && stepMs <= budgets.stepMs
      && alignedSplitMs <= budgets.alignedSplitMs ? 'PASS' : 'FAIL',
    limitations: [
      'GitHub-hosted Chrome runner, not representative end-user device hardware.',
      'Navigation P50/P95 from at least three samples; STEP and aligned split each have ONE sample and no percentile claim.',
      'Budgets are CI regression guards with variance headroom, not latency SLAs.',
      'Exact-kernel warm/cold state and runtime scheduling can affect comparisons.',
    ],
  };
}
