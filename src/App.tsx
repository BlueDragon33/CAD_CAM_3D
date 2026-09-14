import { FormEvent, useMemo, useState } from 'react';
import {
  createDefaultProject,
  createFeature,
  type CadFeature,
  type CadProject,
  type FeatureKind,
} from './cad/model';
import { interpretCommand } from './cad/command';
import { rebuildProject } from './cad/rebuild';
import { validateForPrint } from './manufacturing/validate';
import { downloadProjectStl, type StlExportReport } from './manufacturing/export';
import { Viewport } from './components/Viewport';
import { defaultManagementPolicy, managementIdentity } from './management/policy';

const featureLabels: Record<FeatureKind, string> = {
  sketch: 'Sketch',
  extrude: 'Extrude',
  cut: 'Cut',
  hole: 'Hole',
  fillet: 'Fillet',
};

function clampDimension(value: number, minimum = 0.1) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(1000, Math.max(minimum, value));
}

function numberValue(raw: string, minimum = 0) {
  return clampDimension(Number(raw), minimum);
}

export default function App() {
  const [project, setProject] = useState<CadProject>(() => createDefaultProject());
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(() => project.features[1]?.id ?? project.features[0]?.id ?? null);
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState('General CAD foundation ready.');
  const [lastExport, setLastExport] = useState<StlExportReport | null>(null);
  const policy = defaultManagementPolicy;
  const rebuilt = useMemo(() => rebuildProject(project), [project]);
  const checks = useMemo(() => validateForPrint(project), [project]);
  const selectedFeature = project.features.find((feature) => feature.id === selectedFeatureId) ?? null;

  const setDimension = (key: keyof CadProject['dimensions'], raw: string) => {
    const value = clampDimension(Number(raw));
    setProject((current) => ({
      ...current,
      dimensions: { ...current.dimensions, [key]: value },
    }));
  };

  const appendFeature = (feature: CadFeature, message?: string) => {
    setProject((current) => ({ ...current, features: [...current.features, feature] }));
    setSelectedFeatureId(feature.id);
    setStatus(message ?? `${featureLabels[feature.kind]} added to the parametric history.`);
  };

  const addFeature = (kind: FeatureKind) => {
    appendFeature(createFeature(kind, project));
  };

  const updateFeature = (id: string, updater: (feature: CadFeature) => CadFeature) => {
    setProject((current) => ({
      ...current,
      features: current.features.map((feature) => feature.id === id ? updater(feature) : feature),
    }));
  };

  const toggleSelectedFeature = () => {
    if (!selectedFeature) return;
    updateFeature(selectedFeature.id, (feature) => ({ ...feature, enabled: !feature.enabled }));
  };

  const removeSelectedFeature = () => {
    if (!selectedFeature) return;
    setProject((current) => ({ ...current, features: current.features.filter((feature) => feature.id !== selectedFeature.id) }));
    setSelectedFeatureId(null);
    setStatus(`${selectedFeature.name} removed. Rebuild diagnostics will report any broken dependency.`);
  };

  const runCommand = (event: FormEvent) => {
    event.preventDefault();
    const result = interpretCommand(command);

    if (result.dimensions) {
      setProject((current) => ({ ...current, dimensions: result.dimensions! }));
    }

    if (result.feature) {
      let feature = createFeature(result.feature.kind, project);
      if (feature.kind === 'hole' && result.feature.kind === 'hole') {
        feature = { ...feature, params: { ...feature.params, diameter: clampDimension(result.feature.diameter) } };
      } else if (feature.kind === 'cut' && result.feature.kind === 'cut') {
        feature = {
          ...feature,
          params: {
            ...feature.params,
            width: clampDimension(result.feature.width),
            depth: clampDimension(result.feature.depth),
          },
        };
      } else if (feature.kind === 'fillet' && result.feature.kind === 'fillet') {
        feature = { ...feature, params: { ...feature.params, radius: clampDimension(result.feature.radius, 0) } };
      }
      appendFeature(feature, result.message);
    } else {
      setStatus(result.message);
    }

    setCommand('');
  };

  const exportStl = () => {
    try {
      const report = downloadProjectStl(project);
      setLastExport(report);
      setStatus(`${report.valid ? 'STL preflight PASS' : 'STL exported with mesh warnings'} · ${report.fileName} · ${report.triangleCount} triangles · ${(report.byteLength / 1024).toFixed(1)} KB.`);
    } catch (error) {
      setStatus(error instanceof Error ? `STL export blocked: ${error.message}` : 'STL export failed.');
    }
  };

  const reset = () => {
    const next = createDefaultProject();
    setProject(next);
    setSelectedFeatureId(next.features[1]?.id ?? next.features[0]?.id ?? null);
    setLastExport(null);
    setStatus('Workspace reset.');
  };

  const renderInspector = () => {
    if (!selectedFeature) return <p className="empty-inspector">Select a feature from the history to edit its parameters.</p>;

    if (selectedFeature.kind === 'sketch') {
      return <div className="inspector-grid">
        <label><span>Width</span><div><input type="number" step="0.1" value={project.dimensions.width} onChange={(e) => setDimension('width', e.target.value)} /><b>mm</b></div></label>
        <label><span>Depth</span><div><input type="number" step="0.1" value={project.dimensions.depth} onChange={(e) => setDimension('depth', e.target.value)} /><b>mm</b></div></label>
        <div className="constraint-state" data-ready={rebuilt.fullyConstrainedSketch}><strong>{rebuilt.fullyConstrainedSketch ? 'Fully constrained' : 'Under constrained'}</strong><small>Centered rectangle · width/depth linked to named parameters</small></div>
      </div>;
    }

    if (selectedFeature.kind === 'extrude') {
      return <div className="inspector-grid">
        <label><span>Distance</span><div><input type="number" step="0.1" value={project.dimensions.height} onChange={(e) => setDimension('height', e.target.value)} /><b>mm</b></div></label>
        <div className="constraint-state" data-ready><strong>Parametric</strong><small>Extrude distance is linked to the named height parameter.</small></div>
      </div>;
    }

    if (selectedFeature.kind === 'hole') {
      return <div className="inspector-grid">
        <label><span>Diameter</span><div><input type="number" step="0.1" value={selectedFeature.params.diameter} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'hole' ? { ...feature, params: { ...feature.params, diameter: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label>
        <label><span>X</span><div><input type="number" step="0.1" value={selectedFeature.params.x} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'hole' ? { ...feature, params: { ...feature.params, x: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
        <label><span>Z</span><div><input type="number" step="0.1" value={selectedFeature.params.z} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'hole' ? { ...feature, params: { ...feature.params, z: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
      </div>;
    }

    if (selectedFeature.kind === 'cut') {
      return <div className="inspector-grid">
        <label><span>Width</span><div><input type="number" step="0.1" value={selectedFeature.params.width} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'cut' ? { ...feature, params: { ...feature.params, width: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label>
        <label><span>Depth</span><div><input type="number" step="0.1" value={selectedFeature.params.depth} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'cut' ? { ...feature, params: { ...feature.params, depth: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label>
        <label><span>X</span><div><input type="number" step="0.1" value={selectedFeature.params.x} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'cut' ? { ...feature, params: { ...feature.params, x: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
        <label><span>Z</span><div><input type="number" step="0.1" value={selectedFeature.params.z} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'cut' ? { ...feature, params: { ...feature.params, z: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
      </div>;
    }

    return <div className="inspector-grid">
      <label><span>Radius</span><div><input type="number" step="0.1" value={selectedFeature.params.radius} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'fillet' ? { ...feature, params: { ...feature.params, radius: numberValue(e.target.value, 0) } } : feature)} /><b>mm</b></div></label>
      <div className="constraint-state"><strong>Kernel pending</strong><small>Fillet remains in the parametric history, but exact B-Rep geometry waits for the CAD kernel adapter.</small></div>
    </div>;
  };

  return (
    <main className="app-shell" data-density={policy.workspaceDensity}>
      <header className="topbar">
        <div>
          <strong>CAD_CAM_3D</strong>
          <span>AI-first parametric design for printable parts</span>
        </div>
        <div className="topbar-actions">
          <span className="managed-badge" title={`${managementIdentity.appName} được quản lý dưới ${managementIdentity.controlPlane}`}>
            Managed · Quản trị Ứng dụng
          </span>
          <span className="kernel-badge">Deterministic MVP kernel</span>
          <button type="button" onClick={exportStl} disabled={!rebuilt.hasSolid}>Export STL</button>
          <button type="button" onClick={reset}>Reset</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel tools-panel">
          <h2>Build</h2>
          {(['sketch', 'extrude', 'hole', 'cut', 'fillet'] as FeatureKind[]).map((kind) => (
            <button key={kind} type="button" className="tool-button" onClick={() => addFeature(kind)}>
              <span>{featureLabels[kind]}</span>
              <small>Add feature</small>
            </button>
          ))}

          <h2>Master parameters</h2>
          <div className="dimension-grid">
            {(['width', 'depth', 'height'] as const).map((key) => (
              <label key={key}>
                <span>{key}</span>
                <div><input type="number" min="0.1" max="1000" step="0.1" value={project.dimensions[key]} onChange={(e) => setDimension(key, e.target.value)} /><b>mm</b></div>
              </label>
            ))}
          </div>
        </aside>

        <section className="canvas-panel">
          <Viewport project={project} />
          <div className="canvas-caption">Rebuilt solid · {rebuilt.width} × {rebuilt.depth} × {rebuilt.height} mm · {rebuilt.holes.length} hole(s) · {rebuilt.cuts.length} cut(s)</div>
        </section>

        <aside className="panel history-panel">
          <h2>Feature history</h2>
          <ol className="feature-tree">
            {project.features.map((feature) => (
              <li key={feature.id} data-selected={feature.id === selectedFeatureId} data-disabled={!feature.enabled}>
                <button type="button" onClick={() => setSelectedFeatureId(feature.id)}>
                  <span className="feature-dot" />
                  <div><strong>{feature.name}</strong><small>{feature.kind}{feature.enabled ? '' : ' · suppressed'}</small></div>
                </button>
              </li>
            ))}
          </ol>

          <h2>Feature inspector</h2>
          <div className="feature-inspector">
            {renderInspector()}
            {selectedFeature ? <div className="inspector-actions"><button type="button" onClick={toggleSelectedFeature}>{selectedFeature.enabled ? 'Suppress' : 'Enable'}</button><button type="button" className="danger" onClick={removeSelectedFeature}>Remove</button></div> : null}
          </div>

          <h2>Rebuild diagnostics</h2>
          <ul className="checks diagnostics">
            {rebuilt.diagnostics.length === 0 ? <li data-level="ok">Feature history rebuilt without semantic errors.</li> : rebuilt.diagnostics.map((diagnostic, index) => <li key={index} data-level={diagnostic.level}>{diagnostic.message}</li>)}
          </ul>

          <h2>Print readiness</h2>
          <div className="profile-card">
            <strong>{project.printProfile.name}</strong>
            <span>{project.printProfile.material} · {project.printProfile.nozzleMm} mm nozzle</span>
          </div>
          <ul className="checks">
            {checks.map((check, index) => <li key={index} data-level={check.level}>{check.message}</li>)}
          </ul>
          {lastExport ? <div className="profile-card">
            <strong>Last STL · {lastExport.valid ? 'PASS' : 'WARN'}</strong>
            <span>{lastExport.triangleCount} triangles · {(lastExport.byteLength / 1024).toFixed(1)} KB</span>
            <small>{lastExport.messages.join(' ')}</small>
          </div> : null}

          <h2>Management</h2>
          <div className="management-card">
            <strong>{managementIdentity.controlPlane}</strong>
            <span>UI policy · feature flags · print policy</span>
            <small>Project geometry and export files remain inside CAD_CAM_3D.</small>
          </div>
        </aside>
      </section>

      {policy.aiCommandBridge ? (
        <form className="commandbar" onSubmit={runCommand}>
          <div className="command-copy"><strong>AI command bridge</strong><span>{status}</span></div>
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Try: 80x50x25 · hole 4mm · cut 12x8 · fillet 2mm" aria-label="Design instruction" />
          <button type="submit">Apply</button>
        </form>
      ) : null}
    </main>
  );
}
