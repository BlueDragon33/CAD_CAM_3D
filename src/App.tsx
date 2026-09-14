import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  createDefaultProject,
  createFeature,
  type CadFeature,
  type CadProject,
  type FeatureKind,
  type FilletFeature,
} from './cad/model';
import { interpretCommand } from './cad/command';
import { activeCadKernel } from './cad/kernel';
import { exactKernelDescriptor } from './cad/exact-kernel';
import { downloadProjectFile, loadProjectFile } from './cad/project-io';
import { rebuildProject } from './cad/rebuild';
import {
  createEdgeTopologyRef,
  createFaceLocalFrame,
  createFaceTopologyRef,
  isSupportedHorizontalFace,
  localCoordinatesOnFace,
  pointFromFaceLocal,
} from './cad/topology-ref';
import type { TopologySelection } from './cad/topology-selection';
import { validateForPrint } from './manufacturing/validate';
import { downloadProjectStl, type StlExportReport } from './manufacturing/export';
import { downloadProjectStep, type StepExportReport } from './manufacturing/step-export';
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

function lastEnabledFeatureId(features: CadFeature[]) {
  return [...features].reverse().find((feature) => feature.enabled)?.id ?? null;
}

export default function App() {
  const [project, setProject] = useState<CadProject>(() => createDefaultProject());
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(() => project.features[1]?.id ?? project.features[0]?.id ?? null);
  const [topologySelection, setTopologySelection] = useState<TopologySelection | null>(null);
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState('General CAD foundation ready.');
  const [lastExport, setLastExport] = useState<StlExportReport | null>(null);
  const [lastStepExport, setLastStepExport] = useState<StepExportReport | null>(null);
  const [exactBusy, setExactBusy] = useState(false);
  const projectInputRef = useRef<HTMLInputElement>(null);
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

  const bindFilletToCurrentEdge = (feature: FilletFeature, featuresBefore: CadFeature[]) => {
    if (topologySelection?.kind !== 'edge') return feature;
    return {
      ...feature,
      params: {
        ...feature.params,
        selection: {
          mode: 'topology' as const,
          ref: createEdgeTopologyRef(topologySelection, lastEnabledFeatureId(featuresBefore)),
        },
      },
    };
  };

  const bindFeatureToCurrentFace = (feature: CadFeature, featuresBefore: CadFeature[]): CadFeature | null => {
    if (topologySelection?.kind !== 'face' || (feature.kind !== 'hole' && feature.kind !== 'cut')) return null;
    const ref = createFaceTopologyRef(topologySelection, lastEnabledFeatureId(featuresBefore));
    if (!isSupportedHorizontalFace(ref)) return null;
    const frame = createFaceLocalFrame(ref.signature);
    const local = localCoordinatesOnFace(frame, topologySelection.pickedPoint);
    const point = pointFromFaceLocal(frame, local.uMm, local.vMm);
    return {
      ...feature,
      params: {
        ...feature.params,
        x: point[0],
        z: point[2],
        placement: { mode: 'face', ref, uMm: local.uMm, vMm: local.vMm },
      },
    };
  };

  const addFeature = (kind: FeatureKind) => {
    let feature = createFeature(kind, project);
    if (feature.kind === 'fillet') {
      const bound = bindFilletToCurrentEdge(feature, project.features);
      const boundToEdge = bound.params.selection.mode === 'topology';
      feature = bound;
      appendFeature(
        feature,
        boundToEdge
          ? 'Fillet added with a durable exact-edge topology reference.'
          : 'Fillet added using the outer vertical-edge preset. Select an exact edge first to bind one edge.',
      );
      return;
    }

    if (feature.kind === 'hole' || feature.kind === 'cut') {
      const faceBound = bindFeatureToCurrentFace(feature, project.features);
      if (faceBound) {
        appendFeature(faceBound, `${featureLabels[feature.kind]} added on the selected exact face with a durable local placement.`);
        return;
      }
      if (topologySelection?.kind === 'face') {
        appendFeature(feature, `${featureLabels[feature.kind]} added in global X/Z mode. Current face-bound MVP accepts only horizontal top/bottom faces.`);
        return;
      }
    }

    appendFeature(feature);
  };

  const updateFeature = (id: string, updater: (feature: CadFeature) => CadFeature) => {
    setProject((current) => ({
      ...current,
      features: current.features.map((feature) => feature.id === id ? updater(feature) : feature),
    }));
  };

  const updateFaceLocalCoordinate = (id: string, key: 'uMm' | 'vMm', raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    updateFeature(id, (feature) => {
      if (feature.kind !== 'hole' && feature.kind !== 'cut') return feature;
      if (feature.params.placement.mode !== 'face') return feature;
      const placement = { ...feature.params.placement, [key]: value };
      const point = pointFromFaceLocal(createFaceLocalFrame(placement.ref.signature), placement.uMm, placement.vMm);
      return {
        ...feature,
        params: { ...feature.params, placement, x: point[0], z: point[2] },
      };
    });
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

  const rebindSelectedFillet = () => {
    if (!selectedFeature || selectedFeature.kind !== 'fillet' || topologySelection?.kind !== 'edge') return;
    const featureIndex = project.features.findIndex((feature) => feature.id === selectedFeature.id);
    const before = featureIndex > 0 ? project.features.slice(0, featureIndex) : [];
    const ref = createEdgeTopologyRef(topologySelection, lastEnabledFeatureId(before));
    updateFeature(selectedFeature.id, (feature) => feature.kind === 'fillet'
      ? { ...feature, params: { ...feature.params, selection: { mode: 'topology', ref } } }
      : feature);
    setStatus(`${selectedFeature.name} rebound to the selected exact edge. The reference will be resolved after upstream rebuilds.`);
  };

  const useFilletPreset = () => {
    if (!selectedFeature || selectedFeature.kind !== 'fillet') return;
    updateFeature(selectedFeature.id, (feature) => feature.kind === 'fillet'
      ? { ...feature, params: { ...feature.params, selection: { mode: 'preset', preset: 'outer-vertical-edges' } } }
      : feature);
    setStatus(`${selectedFeature.name} now targets the outer vertical-edge preset.`);
  };

  const bindSelectedFeatureToFace = () => {
    if (!selectedFeature || (selectedFeature.kind !== 'hole' && selectedFeature.kind !== 'cut') || topologySelection?.kind !== 'face') return;
    const featureIndex = project.features.findIndex((feature) => feature.id === selectedFeature.id);
    const before = featureIndex > 0 ? project.features.slice(0, featureIndex) : [];
    const bound = bindFeatureToCurrentFace(selectedFeature, before);
    if (!bound) {
      setStatus(`${selectedFeature.name} was not rebound. Face-bound Hole/Cut currently requires a horizontal top/bottom face.`);
      return;
    }
    updateFeature(selectedFeature.id, () => bound);
    setStatus(`${selectedFeature.name} rebound to the selected exact face using local U/V coordinates.`);
  };

  const useGlobalPlacement = () => {
    if (!selectedFeature || (selectedFeature.kind !== 'hole' && selectedFeature.kind !== 'cut')) return;
    updateFeature(selectedFeature.id, (feature) => {
      if (feature.kind !== 'hole' && feature.kind !== 'cut') return feature;
      return { ...feature, params: { ...feature.params, placement: { mode: 'global-xz' } } };
    });
    setStatus(`${selectedFeature.name} now uses global X/Z placement.`);
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
        feature = bindFeatureToCurrentFace(feature, project.features) ?? feature;
      } else if (feature.kind === 'cut' && result.feature.kind === 'cut') {
        feature = {
          ...feature,
          params: {
            ...feature.params,
            width: clampDimension(result.feature.width),
            depth: clampDimension(result.feature.depth),
          },
        };
        feature = bindFeatureToCurrentFace(feature, project.features) ?? feature;
      } else if (feature.kind === 'fillet' && result.feature.kind === 'fillet') {
        feature = bindFilletToCurrentEdge(
          { ...feature, params: { ...feature.params, radius: clampDimension(result.feature.radius, 0) } },
          project.features,
        );
      }
      appendFeature(
        feature,
        feature.kind === 'fillet' && feature.params.selection.mode === 'topology'
          ? `${result.message} Bound to the currently selected exact edge.`
          : (feature.kind === 'hole' || feature.kind === 'cut') && feature.params.placement.mode === 'face'
            ? `${result.message} Bound to the currently selected exact face.`
            : result.message,
      );
    } else {
      setStatus(result.message);
    }

    setCommand('');
  };

  const saveProject = () => {
    try {
      const report = downloadProjectFile(project);
      setStatus(`Project saved · schema v${report.schemaVersion} · ${report.fileName} · ${(report.byteLength / 1024).toFixed(1)} KB.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Project save failed: ${error.message}` : 'Project save failed.');
    }
  };

  const openProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      const loaded = await loadProjectFile(file);
      setProject(loaded.project);
      setSelectedFeatureId(loaded.project.features[1]?.id ?? loaded.project.features[0]?.id ?? null);
      setTopologySelection(null);
      setLastExport(null);
      setLastStepExport(null);
      const migration = loaded.report.migrated
        ? ` · migrated schema v${loaded.report.sourceSchemaVersion} → v${loaded.report.schemaVersion}`
        : ` · schema v${loaded.report.schemaVersion}`;
      setStatus(`Project opened${migration} · ${loaded.report.fileName}.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Project open blocked: ${error.message}` : 'Project open failed.');
    }
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

  const exportStep = async () => {
    setExactBusy(true);
    setStatus('Loading OpenCascade WASM and rebuilding exact B-Rep…');
    try {
      const report = await downloadProjectStep(project);
      setLastStepExport(report);
      const warningText = report.warnings.length > 0 ? ` · ${report.warnings.join(' ')}` : '';
      setStatus(`STEP export PASS · ${report.fileName} · ${report.faceCount} faces · ${report.edgeCount} edges · ${(report.byteLength / 1024).toFixed(1)} KB${warningText}`);
    } catch (error) {
      setStatus(error instanceof Error ? `STEP export blocked: ${error.message}` : 'STEP export failed.');
    } finally {
      setExactBusy(false);
    }
  };

  const reset = () => {
    const next = createDefaultProject();
    setProject(next);
    setSelectedFeatureId(next.features[1]?.id ?? next.features[0]?.id ?? null);
    setTopologySelection(null);
    setLastExport(null);
    setLastStepExport(null);
    setStatus('Workspace reset.');
  };

  const handleTopologySelection = (selection: TopologySelection | null) => {
    setTopologySelection(selection);
    if (!selection) return;
    if (selection.kind === 'edge') {
      setStatus(`Exact edge selected · ${selection.signature.curveKind} · ${selection.signature.lengthMm.toFixed(2)} mm · ${selection.adjacentFaceLineageIds.length} lineage anchor(s).`);
    } else {
      const ref = createFaceTopologyRef(selection, lastEnabledFeatureId(project.features));
      setStatus(`Exact face selected · ${selection.signature.areaMm2.toFixed(2)} mm² · ${selection.lineageIds.length} lineage anchor(s) · ${isSupportedHorizontalFace(ref) ? 'Hole/Cut binding ready' : 'inspection only in current face-placement MVP'}.`);
    }
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
      const faceBound = selectedFeature.params.placement.mode === 'face';
      return <div className="inspector-grid">
        <label><span>Diameter</span><div><input type="number" step="0.1" value={selectedFeature.params.diameter} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'hole' ? { ...feature, params: { ...feature.params, diameter: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label>
        {faceBound ? <>
          <label><span>Face U</span><div><input type="number" step="0.1" value={selectedFeature.params.placement.mode === 'face' ? selectedFeature.params.placement.uMm : 0} onChange={(e) => updateFaceLocalCoordinate(selectedFeature.id, 'uMm', e.target.value)} /><b>mm</b></div></label>
          <label><span>Face V</span><div><input type="number" step="0.1" value={selectedFeature.params.placement.mode === 'face' ? selectedFeature.params.placement.vMm : 0} onChange={(e) => updateFaceLocalCoordinate(selectedFeature.id, 'vMm', e.target.value)} /><b>mm</b></div></label>
          <div className="constraint-state" data-ready><strong>Persisted exact-face target</strong><small>{selectedFeature.params.placement.mode === 'face' ? `${selectedFeature.params.placement.ref.lineageIds.length} lineage anchor(s) · local U/V placement` : ''}</small></div>
        </> : <>
          <label><span>X</span><div><input type="number" step="0.1" value={selectedFeature.params.x} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'hole' ? { ...feature, params: { ...feature.params, x: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
          <label><span>Z</span><div><input type="number" step="0.1" value={selectedFeature.params.z} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'hole' ? { ...feature, params: { ...feature.params, z: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
        </>}
        <div className="topology-bind-actions">
          <button type="button" onClick={bindSelectedFeatureToFace} disabled={topologySelection?.kind !== 'face'}>Bind selected face</button>
          <button type="button" onClick={useGlobalPlacement} disabled={!faceBound}>Use global X/Z</button>
        </div>
      </div>;
    }

    if (selectedFeature.kind === 'cut') {
      const faceBound = selectedFeature.params.placement.mode === 'face';
      return <div className="inspector-grid">
        <label><span>Width</span><div><input type="number" step="0.1" value={selectedFeature.params.width} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'cut' ? { ...feature, params: { ...feature.params, width: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label>
        <label><span>Depth</span><div><input type="number" step="0.1" value={selectedFeature.params.depth} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'cut' ? { ...feature, params: { ...feature.params, depth: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label>
        {faceBound ? <>
          <label><span>Face U</span><div><input type="number" step="0.1" value={selectedFeature.params.placement.mode === 'face' ? selectedFeature.params.placement.uMm : 0} onChange={(e) => updateFaceLocalCoordinate(selectedFeature.id, 'uMm', e.target.value)} /><b>mm</b></div></label>
          <label><span>Face V</span><div><input type="number" step="0.1" value={selectedFeature.params.placement.mode === 'face' ? selectedFeature.params.placement.vMm : 0} onChange={(e) => updateFaceLocalCoordinate(selectedFeature.id, 'vMm', e.target.value)} /><b>mm</b></div></label>
          <div className="constraint-state" data-ready><strong>Persisted exact-face target</strong><small>{selectedFeature.params.placement.mode === 'face' ? `${selectedFeature.params.placement.ref.lineageIds.length} lineage anchor(s) · local U/V placement` : ''}</small></div>
        </> : <>
          <label><span>X</span><div><input type="number" step="0.1" value={selectedFeature.params.x} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'cut' ? { ...feature, params: { ...feature.params, x: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
          <label><span>Z</span><div><input type="number" step="0.1" value={selectedFeature.params.z} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'cut' ? { ...feature, params: { ...feature.params, z: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
        </>}
        <div className="topology-bind-actions">
          <button type="button" onClick={bindSelectedFeatureToFace} disabled={topologySelection?.kind !== 'face'}>Bind selected face</button>
          <button type="button" onClick={useGlobalPlacement} disabled={!faceBound}>Use global X/Z</button>
        </div>
      </div>;
    }

    const filletSelection = selectedFeature.params.selection;
    const topologyBound = filletSelection.mode === 'topology';
    return <div className="inspector-grid">
      <label><span>Radius</span><div><input type="number" step="0.1" value={selectedFeature.params.radius} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'fillet' ? { ...feature, params: { ...feature.params, radius: numberValue(e.target.value, 0) } } : feature)} /><b>mm</b></div></label>
      <div className="constraint-state" data-ready={exactKernelDescriptor.capabilities.exactFillet}>
        <strong>{topologyBound ? 'Persisted exact-edge target' : 'Outer-edge preset'}</strong>
        <small>{filletSelection.mode === 'topology'
          ? `${filletSelection.ref.adjacentFaceLineageIds.length} semantic lineage anchor(s) · ${filletSelection.ref.signature.curveKind} · ${filletSelection.ref.signature.lengthMm.toFixed(2)} mm`
          : 'Current preset fillets all four outer vertical edges in the exact B-Rep path.'}</small>
      </div>
      <div className="topology-bind-actions">
        <button type="button" onClick={rebindSelectedFillet} disabled={topologySelection?.kind !== 'edge'}>Bind selected edge</button>
        <button type="button" onClick={useFilletPreset} disabled={!topologyBound}>Use 4-edge preset</button>
      </div>
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
          <span className="kernel-badge" title={`Kernel id: ${activeCadKernel.id}`}>{activeCadKernel.label}</span>
          <button type="button" onClick={saveProject}>Save Project</button>
          <button type="button" onClick={() => projectInputRef.current?.click()}>Open Project</button>
          <button type="button" onClick={exportStl} disabled={!rebuilt.hasSolid || !activeCadKernel.capabilities.stlExport}>Export STL</button>
          <button type="button" onClick={() => void exportStep()} disabled={!rebuilt.hasSolid || exactBusy}>{exactBusy ? 'Building B-Rep…' : 'Export STEP'}</button>
          <button type="button" onClick={reset}>Reset</button>
          <input
            ref={projectInputRef}
            className="file-input"
            type="file"
            accept=".json,.cad3d.json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              void openProject(file);
              event.target.value = '';
            }}
          />
        </div>
      </header>

      <section className="workspace">
        <aside className="panel tools-panel">
          <h2>Build</h2>
          {(['sketch', 'extrude', 'hole', 'cut', 'fillet'] as FeatureKind[]).map((kind) => (
            <button key={kind} type="button" className="tool-button" onClick={() => addFeature(kind)}>
              <span>{featureLabels[kind]}</span>
              <small>{kind === 'fillet' && topologySelection?.kind === 'edge'
                ? 'Use selected edge'
                : (kind === 'hole' || kind === 'cut') && topologySelection?.kind === 'face'
                  ? 'Use selected face'
                  : 'Add feature'}</small>
            </button>
          ))}

          <h2>Exact topology</h2>
          <div className="profile-card">
            <strong>{topologySelection ? `${topologySelection.kind} selected` : 'No topology selected'}</strong>
            <span>{topologySelection?.kind === 'edge'
              ? `${topologySelection.signature.curveKind} · ${topologySelection.signature.lengthMm.toFixed(2)} mm`
              : topologySelection?.kind === 'face'
                ? `${topologySelection.signature.areaMm2.toFixed(2)} mm²`
                : 'Use Face / Edge controls in the viewport.'}</span>
            <small>{topologySelection?.kind === 'edge'
              ? 'Adding Fillet now stores semantic ancestry + geometry signature in the project.'
              : topologySelection?.kind === 'face'
                ? 'Adding Hole/Cut binds horizontal top/bottom faces to schema-v3 local U/V placement.'
                : 'Exact selection is lazy-loaded only when requested.'}</small>
          </div>

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
          <Viewport project={project} onSelectionChange={handleTopologySelection} />
          <div className="canvas-caption">Rebuilt solid · {rebuilt.width} × {rebuilt.depth} × {rebuilt.height} mm · {rebuilt.holes.length} hole(s) · {rebuilt.cuts.length} cut(s){topologySelection ? ` · ${topologySelection.kind} selected` : ''}</div>
        </section>

        <aside className="panel history-panel">
          <h2>Feature history</h2>
          <ol className="feature-tree">
            {project.features.map((feature) => (
              <li key={feature.id} data-selected={feature.id === selectedFeatureId} data-disabled={!feature.enabled}>
                <button type="button" onClick={() => setSelectedFeatureId(feature.id)}>
                  <span className="feature-dot" />
                  <div><strong>{feature.name}</strong><small>{feature.kind}{feature.kind === 'fillet' && feature.params.selection.mode === 'topology' ? ' · topology-bound' : ''}{(feature.kind === 'hole' || feature.kind === 'cut') && feature.params.placement.mode === 'face' ? ' · face-bound' : ''}{feature.enabled ? '' : ' · suppressed'}</small></div>
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
            <small>Kernel: {lastExport.kernelId}</small>
          </div> : null}
          {lastStepExport ? <div className="profile-card">
            <strong>Last STEP · {lastStepExport.valid ? 'PASS' : 'WARN'}</strong>
            <span>{lastStepExport.faceCount} faces · {lastStepExport.edgeCount} edges · {(lastStepExport.byteLength / 1024).toFixed(1)} KB</span>
            <small>Volume {lastStepExport.volumeMm3.toFixed(1)} mm³ · Surface {lastStepExport.surfaceAreaMm2.toFixed(1)} mm²</small>
            <small>Kernel: {lastStepExport.kernelId}{lastStepExport.filletApplied ? ' · exact fillet applied' : ''}</small>
            {lastStepExport.warnings.length > 0 ? <small>{lastStepExport.warnings.join(' ')}</small> : null}
          </div> : null}

          <h2>Kernel</h2>
          <div className="profile-card">
            <strong>{activeCadKernel.label}</strong>
            <span>{activeCadKernel.capabilities.exactBrep ? 'Exact B-Rep' : 'Fast deterministic mesh'} · STL {activeCadKernel.capabilities.stlExport ? 'ready' : 'off'}</span>
            <small>Interactive preview stays lightweight. Exact manufacturing interchange is lazy-loaded only when needed.</small>
          </div>
          <div className="profile-card">
            <strong>{exactKernelDescriptor.label}</strong>
            <span>Exact B-Rep · STEP ready · edge + face topology references</span>
            <small>Selected edges drive exact Fillet; horizontal top/bottom face references now drive Hole/Cut local placement with conservative rebuild resolution.</small>
          </div>

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
