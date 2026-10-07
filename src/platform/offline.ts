export async function registerOfflineRuntime() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return null;
  try {
    const base = import.meta.env.BASE_URL || '/';
    return await navigator.serviceWorker.register(base + 'sw.js', { scope: base });
  } catch {
    // Offline caching is resilience infrastructure, not a startup authority.
    // A registration failure must never prevent the CAD workspace from opening.
    return null;
  }
}
