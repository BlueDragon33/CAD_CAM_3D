export async function registerOfflineRuntime() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch {
    // Offline caching is resilience infrastructure, not a startup authority.
    // A registration failure must never prevent the CAD workspace from opening.
    return null;
  }
}
