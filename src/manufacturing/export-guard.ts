/**
 * Run this only after generating an export artifact and immediately before
 * offering it to the browser. It does not cancel OpenCascade/WASM computation.
 */
export function assertExportDownloadAllowed(mayDownload?: () => boolean): void {
  if (mayDownload && !mayDownload()) {
    throw new Error('Export cancelled: the CAD project or operation changed before download.');
  }
}
