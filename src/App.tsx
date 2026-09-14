import { FormEvent, useMemo, useState } from 'react';
import { createDefaultProject, type CadProject, type FeatureKind } from './cad/model';
import { interpretCommand } from './cad/command';
import { validateForPrint } from './manufacturing/validate';
import { Viewport } from './components/Viewport';

const featureLabels: Record<FeatureKind, string> = {
  sketch: 'Sketch',
  extrude: 'Extrude',
  hole: 'Hole',
  fillet: 'Fillet',
};

function clampDimension(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1000, Math.max(0.1, value));
}

export default function App() {
  const [project, setProject] = useState<CadProject>(() => createDefaultProject());
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState('General CAD foundation ready.');
  const checks = useMemo(() => validateForPrint(project), [project]);

  const setDimension = (key: keyof CadProject['dimensions'], raw: string) => {
    const value = clampDimension(Number(raw));
    setProject((current) => ({
      ...current,
      dimensions: { ...current.dimensions, [key]: value },
    }));
  };

  const addFeature = (kind: FeatureKind) => {
    setProject((current) => ({
      ...current,
      features: [
        ...current.features,
        {
          id: crypto.randomUUID(),
          kind,
          name: `${featureLabels[kind]} ${current.features.filter((f) => f.kind === kind).length + 1}`,
          enabled: true,
        },
      ],
    }));
    setStatus(`${featureLabels[kind]} added to the parametric history. Geometry implementation will move behind the CAD-kernel adapter.`);
  };

  const runCommand = (event: FormEvent) => {
    event.preventDefault();
    const result = interpretCommand(command);
    if (result.dimensions) {
      setProject((current) => ({ ...current, dimensions: result.dimensions! }));
    }
    setStatus(result.message);
    setCommand('');
  };

  const reset = () => {
    setProject(createDefaultProject());
    setStatus('Workspace reset.');
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <strong>CAD_CAM_3D</strong>
          <span>AI-first parametric design for printable parts</span>
        </div>
        <div className="topbar-actions">
          <span className="kernel-badge">Preview kernel</span>
          <button type="button" onClick={reset}>Reset</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel tools-panel">
          <h2>Build</h2>
          {(['sketch', 'extrude', 'hole', 'fillet'] as FeatureKind[]).map((kind) => (
            <button key={kind} type="button" className="tool-button" onClick={() => addFeature(kind)}>
              <span>{featureLabels[kind]}</span>
              <small>Add feature</small>
            </button>
          ))}

          <h2>Envelope</h2>
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
          <Viewport dimensions={project.dimensions} />
          <div className="canvas-caption">Parametric preview · {project.dimensions.width} × {project.dimensions.depth} × {project.dimensions.height} mm</div>
        </section>

        <aside className="panel history-panel">
          <h2>Feature history</h2>
          <ol className="feature-tree">
            {project.features.map((feature) => (
              <li key={feature.id}>
                <span className="feature-dot" />
                <div><strong>{feature.name}</strong><small>{feature.kind}</small></div>
              </li>
            ))}
          </ol>

          <h2>Print readiness</h2>
          <div className="profile-card">
            <strong>{project.printProfile.name}</strong>
            <span>{project.printProfile.material} · {project.printProfile.nozzleMm} mm nozzle</span>
          </div>
          <ul className="checks">
            {checks.map((check, index) => <li key={index} data-level={check.level}>{check.message}</li>)}
          </ul>
        </aside>
      </section>

      <form className="commandbar" onSubmit={runCommand}>
        <div className="command-copy"><strong>AI command bridge</strong><span>{status}</span></div>
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Try: create a 80x50x25 mm enclosure" aria-label="Design instruction" />
        <button type="submit">Apply</button>
      </form>
    </main>
  );
}
