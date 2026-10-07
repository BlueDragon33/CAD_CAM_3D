import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDefaultProject,
  createFeature,
  type CadFeature,
  type CadProject,
  type ChamferFeature,
  type FeatureKind,
  type FilletFeature,
} from './cad/model';
import { activeCadKernel } from './cad/kernel';
import { exactKernelDescriptor } from './cad/exact-kernel';
import { downloadProjectFile, loadProjectFile } from './cad/project-io';
import { rebuildProject } from './cad/rebuild';
import { solveSketch } from './cad/constraints';
import { resolveManufacturingProfileWithRegions } from './cad/profile-region';
import {
  createEdgeTopologyRef,
  createFaceLocalFrame,
  createFaceTopologyRef,
  createSketchPlaneRef,
  isSupportedPlanarFace,
  localCoordinatesOnFace,
  pointFromFaceLocal,
} from './cad/topology-ref';
import type { TopologySelection } from './cad/topology-selection';
import { validateForPrint } from './manufacturing/validate';
import { analyzeManufacturingReadiness, type ManufacturingReadinessReport } from './manufacturing/readiness';
import { downloadProjectStlAdaptive, type StlExportReport } from './manufacturing/export';
import { downloadProjectStep, type StepExportReport } from './manufacturing/step-export';
import { downloadProjectThreeMf, type ThreeMfExportReport } from './manufacturing/three-mf';
import { downloadProjectSplitThreeMf, type SplitThreeMfExportReport } from './manufacturing/split-export';
import { Sketcher } from './components/Sketcher';
import { Viewport } from './components/Viewport';
import { defaultManagementPolicy, managementIdentity } from './management/policy';
import { newestRecoverySnapshot, restoreRecoverySnapshot, saveRecoverySnapshot, type RecoverySnapshot } from './persistence/local-recovery';
import { planDesignInstruction, projectProposalFingerprint, type DesignProposal } from './ai/planner';

const featureLabels: Record<FeatureKind, string> = {
  sketch: 'Sketch', 'datum-axis': 'Datum Axis', extrude: 'Extrude', pad: 'Pad', pocket: 'Pocket', revolve: 'Revolve', cut: 'Cut', hole: 'Hole', fillet: 'Fillet', chamfer: 'Chamfer', shell: 'Shell', 'linear-pattern': 'Linear Pattern', mirror: 'Mirror',
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

function initialRecoveryCandidate(): RecoverySnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    return newestRecoverySnapshot(window.localStorage);
  } catch {
    return null;
  }
}

export default function App() {
  const [project, setProject] = useState<CadProject>(() => createDefaultProject());
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(() => project.features[1]?.id ?? project.features[0]?.id ?? null);
  const [topologySelection, setTopologySelection] = useState<TopologySelection | null>(null);
  const [command, setCommand] = useState('');
  const [designProposal, setDesignProposal] = useState<DesignProposal | null>(null);
  const [status, setStatus] = useState('General CAD foundation ready.');
  const [recoveryCandidate, setRecoveryCandidate] = useState<RecoverySnapshot | null>(() => initialRecoveryCandidate());
  const [lastExport, setLastExport] = useState<StlExportReport | null>(null);
  const [lastStepExport, setLastStepExport] = useState<StepExportReport | null>(null);
  const [lastThreeMfExport, setLastThreeMfExport] = useState<ThreeMfExportReport | null>(null);
  const [lastSplitThreeMfExport, setLastSplitThreeMfExport] = useState<SplitThreeMfExportReport | null>(null);
  const [manufacturingReport, setManufacturingReport] = useState<ManufacturingReadinessReport | null>(null);
  const [manufacturingBusy, setManufacturingBusy] = useState(false);
  const [stlBusy, setStlBusy] = useState(false);
  const [threeMfBusy, setThreeMfBusy] = useState(false);
  const [splitThreeMfBusy, setSplitThreeMfBusy] = useState(false);
  const [exactBusy, setExactBusy] = useState(false);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const policy = defaultManagementPolicy;
  const rebuilt = useMemo(() => rebuildProject(project), [project]);
  const checks = useMemo(() => validateForPrint(project), [project]);
  const selectedFeature = project.features.find((feature) => feature.id === selectedFeatureId) ?? null;
  const selectedSketchSolution = useMemo(
    () => selectedFeature?.kind === 'sketch' ? solveSketch(project, selectedFeature) : null,
    [project, selectedFeature],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const timer = window.setTimeout(() => {
      try {
        saveRecoverySnapshot(project, window.localStorage);
      } catch {
        // Recovery storage is best-effort. A quota/privacy-mode failure must not
        // make the local CAD core unusable or overwrite the user's status.
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    // Manufacturing reports are derived evidence, not project truth. Any model
    // edit invalidates the prior analysis and any split-export result.
    setManufacturingReport(null);
    setLastSplitThreeMfExport(null);
  }, [project]);

  const setDimension = (key: keyof CadProject['dimensions'], raw: string) => {
    const value = clampDimension(Number(raw));
    setProject((current) => ({ ...current, dimensions: { ...current.dimensions, [key]: value } }));
  };

  const appendFeature = (feature: CadFeature, message?: string) => {
    setProject((current) => ({ ...current, features: [...current.features, feature] }));
    setSelectedFeatureId(feature.id);
    setStatus(message ?? `${featureLabels[feature.kind]} added to the parametric history.`);
  };

  const bindEdgeTreatmentToCurrentEdge = <T extends FilletFeature | ChamferFeature>(feature: T, featuresBefore: CadFeature[]): T => {
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
    } as T;
  };

  const bindFeatureToCurrentFace = (feature: CadFeature, featuresBefore: CadFeature[]): CadFeature | null => {
    if (topologySelection?.kind !== 'face' || (feature.kind !== 'hole' && feature.kind !== 'cut')) return null;
    const ref = createFaceTopologyRef(topologySelection, lastEnabledFeatureId(featuresBefore));
    if (!isSupportedPlanarFace(ref)) return null;
    const frame = createFaceLocalFrame(ref.signature);
    const local = localCoordinatesOnFace(frame, topologySelection.pickedPoint);
    const point = pointFromFaceLocal(frame, local.uMm, local.vMm);
    return {
      ...feature,
      params: { ...feature.params, x: point[0], z: point[2], placement: { mode: 'face', ref, uMm: local.uMm, vMm: local.vMm } },
    } as CadFeature;
  };

  const addFeature = (kind: FeatureKind) => {
    let feature = createFeature(kind, project);
    if (feature.kind === 'sketch' && topologySelection?.kind !== 'face' && rebuilt.hasSolid) {
      setStatus('Sketch creation needs a selected supported planar face once a solid exists. This prevents a second base sketch from silently replacing the manufacturing profile.');
      return;
    }
    if (feature.kind === 'sketch' && topologySelection?.kind === 'face') {
      const plane = createSketchPlaneRef(topologySelection, lastEnabledFeatureId(project.features));
      if (!isSupportedPlanarFace(plane.ref)) {
        setStatus('Sketch attachment blocked: select a supported planar exact face. Curved Arc/Circle side faces remain inspection-only.');
        return;
      }
      feature = {
        ...feature,
        params: {
          ...feature.params,
          plane,
          entities: [],
          constraints: [],
        },
      };
      appendFeature(feature, 'Attached Sketch added on the selected planar face with a durable FaceTopologyRef and local U/V origin.');
      return;
    }
    if (feature.kind === 'datum-axis') {
      if (!selectedFeature || selectedFeature.kind !== 'sketch') {
        setStatus('Datum Axis creation blocked: select an earlier Sketch first.');
        return;
      }
      feature = {
        ...feature,
        params: {
          source: selectedFeature.params.plane.kind === 'face'
            ? { kind: 'sketch-local', sketchId: selectedFeature.id, axis: 'u', offsetMm: 0 }
            : { kind: 'base-xz', sketchId: selectedFeature.id, axis: 'x', offsetMm: 0 },
        },
      };
      appendFeature(
        feature,
        selectedFeature.params.plane.kind === 'face'
          ? 'Datum Axis added from the selected attached Sketch using durable local U/V semantics.'
          : 'Datum Axis added from the selected base-XZ Sketch using durable X/Z semantics.',
      );
      return;
    }
    if (feature.kind === 'pad' || feature.kind === 'pocket') {
      if (!selectedFeature || selectedFeature.kind !== 'sketch' || selectedFeature.params.plane.kind !== 'face') {
        setStatus(`${featureLabels[feature.kind]} creation blocked: select a face-attached Sketch first.`);
        return;
      }
      if (!selectedFeature.params.entities.some((entity) => !entity.construction)) {
        setStatus(`${featureLabels[feature.kind]} creation blocked: promote one valid attached feature profile first.`);
        return;
      }
      const solvedSource = solveSketch(project, selectedFeature);
      if (solvedSource.constraintState === 'inconsistent') {
        setStatus(`${featureLabels[feature.kind]} creation blocked: repair the attached Sketch constraint conflict first.`);
        return;
      }
      const profile = resolveManufacturingProfileWithRegions(
        solvedSource.entities,
        solvedSource.width,
        solvedSource.depth,
      );
      if (!profile.promoted || !profile.profile) {
        setStatus(`${featureLabels[feature.kind]} creation blocked: the attached Sketch profile is invalid or ambiguous.`);
        return;
      }
      if (feature.kind === 'pad') {
        feature = { ...feature, params: { ...feature.params, sketchId: selectedFeature.id } };
      } else {
        feature = { ...feature, params: { ...feature.params, sketchId: selectedFeature.id } };
      }
      appendFeature(
        feature,
        feature.kind === 'pad'
          ? 'Pad added from the selected attached Sketch. Exact preview/STL/STEP will fuse the promoted profile along the resolved face normal.'
          : 'Pocket added from the selected attached Sketch. Exact preview/STL/STEP will remove the promoted profile inward from the resolved face.',
      );
      return;
    }
    if (feature.kind === 'revolve') {
      if (!selectedFeature || selectedFeature.kind !== 'datum-axis' || selectedFeature.params.source.kind !== 'sketch-local') {
        setStatus('Revolve creation blocked: select a local Datum Axis from an attached Sketch first.');
        return;
      }
      const sourceSketch = project.features.find((candidate) => candidate.id === selectedFeature.params.source.sketchId);
      if (!sourceSketch || sourceSketch.kind !== 'sketch' || sourceSketch.params.plane.kind !== 'face') {
        setStatus('Revolve creation blocked: Datum Axis source Sketch is missing or no longer face-attached.');
        return;
      }
      if (!sourceSketch.params.entities.some((entity) => !entity.construction)) {
        setStatus('Revolve creation blocked: promote one valid attached profile first.');
        return;
      }
      feature = {
        ...feature,
        params: {
          ...feature.params,
          sketchId: sourceSketch.id,
          axisId: selectedFeature.id,
          angleDeg: 360,
          operation: 'add',
        },
      };
      appendFeature(feature, 'Revolve Add created from the Datum Axis and its attached Sketch. Exact OpenCascade rebuild will execute the sweep.');
      return;
    }

    if (feature.kind === 'mirror') {
      if (!selectedFeature || (selectedFeature.kind !== 'hole' && selectedFeature.kind !== 'cut')) {
        setStatus('Mirror creation blocked: select an earlier Hole or Cut feature first.');
        return;
      }
      const faceBound = selectedFeature.params.placement.mode === 'face';
      feature = {
        ...feature,
        params: {
          ...feature.params,
          sourceFeatureId: selectedFeature.id,
          plane: faceBound
            ? { kind: 'face-local', axis: 'u', offsetMm: 0 }
            : { kind: 'global', axis: 'x', offsetMm: 0 },
        },
      };
      appendFeature(feature, `Mirror added from ${selectedFeature.name}. The source stays canonical; one exact reflected instance is derived.`);
      return;
    }

    if (feature.kind === 'linear-pattern') {
      if (!selectedFeature || (selectedFeature.kind !== 'hole' && selectedFeature.kind !== 'cut')) {
        setStatus('Linear Pattern creation blocked: select an earlier Hole or Cut feature first.');
        return;
      }
      const faceBound = selectedFeature.params.placement.mode === 'face';
      feature = {
        ...feature,
        params: {
          ...feature.params,
          sourceFeatureId: selectedFeature.id,
          axis: faceBound ? 'u' : 'x',
        },
      };
      appendFeature(
        feature,
        `Linear Pattern added from ${selectedFeature.name}. Count includes the original source; exact rebuild creates the remaining instances.`,
      );
      return;
    }
    if (feature.kind === 'shell') {
      if (!rebuilt.hasSolid || topologySelection?.kind !== 'face') {
        setStatus('Shell creation blocked: select the exact face that should become the first opening on an existing solid.');
        return;
      }
      const ref = createFaceTopologyRef(topologySelection, lastEnabledFeatureId(project.features));
      feature = { ...feature, params: { ...feature.params, openings: [ref] } };
      appendFeature(feature, 'Shell added with the selected face as a durable opening reference. Exact OpenCascade rebuild will hollow inward.');
      return;
    }
    if (feature.kind === 'fillet' || feature.kind === 'chamfer') {
      feature = bindEdgeTreatmentToCurrentEdge(feature, project.features);
      const boundToEdge = feature.params.selection.mode === 'topology';
      appendFeature(
        feature,
        boundToEdge
          ? `${featureLabels[feature.kind]} added with a durable exact-edge topology reference.`
          : `${featureLabels[feature.kind]} added using the four outer vertical-edge preset. Select an exact edge first to bind one edge.`,
      );
      return;
    }
    if (feature.kind === 'hole' || feature.kind === 'cut') {
      const faceBound = bindFeatureToCurrentFace(feature, project.features);
      if (faceBound) {
        appendFeature(faceBound, `${featureLabels[feature.kind]} added on the selected exact planar face with durable local U/V placement.`);
        return;
      }
      if (topologySelection?.kind === 'face') {
        appendFeature(feature, `${featureLabels[feature.kind]} added in global X/Z mode. The selected face is not a supported planar base-face descendant.`);
        return;
      }
    }
    appendFeature(feature);
  };

  const updateFeature = (id: string, updater: (feature: CadFeature) => CadFeature) => {
    setProject((current) => ({ ...current, features: current.features.map((feature) => feature.id === id ? updater(feature) : feature) }));
  };

  const updateFaceLocalCoordinate = (id: string, key: 'uMm' | 'vMm', raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    updateFeature(id, (feature) => {
      if (feature.kind !== 'hole' && feature.kind !== 'cut') return feature;
      if (feature.params.placement.mode !== 'face') return feature;
      const placement = { ...feature.params.placement, [key]: value };
      const point = pointFromFaceLocal(createFaceLocalFrame(placement.ref.signature), placement.uMm, placement.vMm);
      return { ...feature, params: { ...feature.params, placement, x: point[0], z: point[2] } } as CadFeature;
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

  const rebindSelectedEdgeTreatment = () => {
    if (!selectedFeature || (selectedFeature.kind !== 'fillet' && selectedFeature.kind !== 'chamfer') || topologySelection?.kind !== 'edge') return;
    const featureIndex = project.features.findIndex((feature) => feature.id === selectedFeature.id);
    const before = featureIndex > 0 ? project.features.slice(0, featureIndex) : [];
    const ref = createEdgeTopologyRef(topologySelection, lastEnabledFeatureId(before));
    updateFeature(selectedFeature.id, (feature) => {
      if (feature.kind !== 'fillet' && feature.kind !== 'chamfer') return feature;
      return { ...feature, params: { ...feature.params, selection: { mode: 'topology', ref } } } as CadFeature;
    });
    setStatus(`${selectedFeature.name} rebound to the selected exact edge. The reference will be resolved after upstream rebuilds.`);
  };

  const useEdgeTreatmentPreset = () => {
    if (!selectedFeature || (selectedFeature.kind !== 'fillet' && selectedFeature.kind !== 'chamfer')) return;
    updateFeature(selectedFeature.id, (feature) => {
      if (feature.kind !== 'fillet' && feature.kind !== 'chamfer') return feature;
      return { ...feature, params: { ...feature.params, selection: { mode: 'preset', preset: 'outer-vertical-edges' } } } as CadFeature;
    });
    setStatus(`${selectedFeature.name} now targets the four outer vertical-edge preset.`);
  };

  const bindSelectedFeatureToFace = () => {
    if (!selectedFeature || (selectedFeature.kind !== 'hole' && selectedFeature.kind !== 'cut') || topologySelection?.kind !== 'face') return;
    const featureIndex = project.features.findIndex((feature) => feature.id === selectedFeature.id);
    const before = featureIndex > 0 ? project.features.slice(0, featureIndex) : [];
    const bound = bindFeatureToCurrentFace(selectedFeature, before);
    if (!bound) {
      setStatus(`${selectedFeature.name} was not rebound. Hole/Cut face binding currently requires a planar descendant of a base extrusion face.`);
      return;
    }
    updateFeature(selectedFeature.id, () => bound);
    setStatus(`${selectedFeature.name} rebound to the selected exact face using local U/V coordinates and the resolved face normal as tool axis.`);
  };

  const useGlobalPlacement = () => {
    if (!selectedFeature || (selectedFeature.kind !== 'hole' && selectedFeature.kind !== 'cut')) return;
    updateFeature(selectedFeature.id, (feature) => {
      if (feature.kind !== 'hole' && feature.kind !== 'cut') return feature;
      return { ...feature, params: { ...feature.params, placement: { mode: 'global-xz' } } } as CadFeature;
    });
    setStatus(`${selectedFeature.name} now uses global X/Z placement.`);
  };

  const addSelectedShellOpening = () => {
    if (!selectedFeature || selectedFeature.kind !== 'shell' || topologySelection?.kind !== 'face') return;
    const featureIndex = project.features.findIndex((feature) => feature.id === selectedFeature.id);
    const before = featureIndex > 0 ? project.features.slice(0, featureIndex) : [];
    const ref = createFaceTopologyRef(topologySelection, lastEnabledFeatureId(before));
    updateFeature(selectedFeature.id, (feature) => {
      if (feature.kind !== 'shell') return feature;
      const duplicate = feature.params.openings.some((opening) => (
        opening.lineageIds.join('|') === ref.lineageIds.join('|')
        && Math.abs(opening.signature.areaMm2 - ref.signature.areaMm2) < 1e-6
      ));
      if (duplicate) return feature;
      return { ...feature, params: { ...feature.params, openings: [...feature.params.openings, ref] } };
    });
    setStatus(`${selectedFeature.name}: selected exact face added as another Shell opening.`);
  };

  const replaceShellOpeningWithSelectedFace = () => {
    if (!selectedFeature || selectedFeature.kind !== 'shell' || topologySelection?.kind !== 'face') return;
    const featureIndex = project.features.findIndex((feature) => feature.id === selectedFeature.id);
    const before = featureIndex > 0 ? project.features.slice(0, featureIndex) : [];
    const ref = createFaceTopologyRef(topologySelection, lastEnabledFeatureId(before));
    updateFeature(selectedFeature.id, (feature) => feature.kind === 'shell'
      ? { ...feature, params: { ...feature.params, openings: [ref] } }
      : feature);
    setStatus(`${selectedFeature.name}: Shell openings replaced with the selected exact face.`);
  };

  const removeLastShellOpening = () => {
    if (!selectedFeature || selectedFeature.kind !== 'shell' || selectedFeature.params.openings.length <= 1) return;
    updateFeature(selectedFeature.id, (feature) => feature.kind === 'shell'
      ? { ...feature, params: { ...feature.params, openings: feature.params.openings.slice(0, -1) } }
      : feature);
    setStatus(`${selectedFeature.name}: last Shell opening removed.`);
  };

  const topologySelectionFingerprint = () => topologySelection ? JSON.stringify(topologySelection) : null;

  const runCommand = (event: FormEvent) => {
    event.preventDefault();
    const proposal = planDesignInstruction(command, {
      project,
      selectedTopology: topologySelection?.kind ?? null,
      selectionFingerprint: topologySelectionFingerprint(),
    });
    setDesignProposal(proposal);
    const prefix = proposal.status === 'ready'
      ? 'Proposal ready'
      : proposal.status === 'blocked'
        ? 'Proposal blocked'
        : 'Instruction unsupported';
    setStatus(prefix + ' · ' + proposal.summary);
  };

  const cancelDesignProposal = () => {
    setDesignProposal(null);
    setStatus('Design proposal cancelled. No project change was made.');
  };

  const commitDesignProposal = () => {
    const proposal = designProposal;
    if (!proposal || proposal.status !== 'ready') return;
    if (proposal.sourceFingerprint !== projectProposalFingerprint(project)) {
      setStatus('Proposal is stale because the project changed after preview. Preview the instruction again.');
      setDesignProposal(null);
      return;
    }
    if (proposal.selectionFingerprint !== topologySelectionFingerprint()) {
      setStatus('Proposal is stale because the exact topology selection changed after preview. Preview the instruction again.');
      setDesignProposal(null);
      return;
    }
    if (proposal.operations.length !== 1) {
      setStatus('Proposal commit blocked: this foundation only commits one validated operation at a time.');
      return;
    }

    const operation = proposal.operations[0];
    if (operation.kind === 'set-dimensions') {
      setProject((current) => ({ ...current, dimensions: operation.dimensions }));
      setStatus(proposal.summary + ' Committed from validated preview.');
      setDesignProposal(null);
      setCommand('');
      return;
    }

    const requested = operation.feature;
    let feature = createFeature(requested.kind, project);
    if (operation.target === 'selected-face' && topologySelection?.kind !== 'face') {
      setStatus('Proposal commit blocked: the selected face is no longer available.');
      return;
    }
    if (operation.target === 'selected-edge' && topologySelection?.kind !== 'edge') {
      setStatus('Proposal commit blocked: the selected edge is no longer available.');
      return;
    }

    if (feature.kind === 'hole' && requested.kind === 'hole') {
      feature = { ...feature, params: { ...feature.params, diameter: clampDimension(requested.diameter) } };
      if (operation.target === 'selected-face') feature = bindFeatureToCurrentFace(feature, project.features) ?? feature;
    } else if (feature.kind === 'cut' && requested.kind === 'cut') {
      feature = { ...feature, params: { ...feature.params, width: clampDimension(requested.width), depth: clampDimension(requested.depth) } };
      if (operation.target === 'selected-face') feature = bindFeatureToCurrentFace(feature, project.features) ?? feature;
    } else if (feature.kind === 'fillet' && requested.kind === 'fillet') {
      const base = { ...feature, params: { ...feature.params, radius: clampDimension(requested.radius, 0) } };
      feature = operation.target === 'selected-edge' ? bindEdgeTreatmentToCurrentEdge(base, project.features) : base;
    } else if (feature.kind === 'chamfer' && requested.kind === 'chamfer') {
      const base = { ...feature, params: { ...feature.params, distance: clampDimension(requested.distance, 0) } };
      feature = operation.target === 'selected-edge' ? bindEdgeTreatmentToCurrentEdge(base, project.features) : base;
    }

    appendFeature(feature, proposal.summary + ' Committed from validated preview.');
    setDesignProposal(null);
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

  const restoreRecovery = () => {
    if (!recoveryCandidate) return;
    try {
      const restored = restoreRecoverySnapshot(recoveryCandidate);
      setProject(restored.project);
      setSelectedFeatureId(restored.project.features[1]?.id ?? restored.project.features[0]?.id ?? null);
      setTopologySelection(null);
      setLastExport(null);
      setLastStepExport(null);
      setLastThreeMfExport(null);
      setManufacturingReport(null);
      setRecoveryCandidate(null);
      setStatus(`Recovered local autosave · ${recoveryCandidate.projectName} · ${new Date(recoveryCandidate.savedAt).toLocaleString()}.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Recovery blocked: ${error.message}` : 'Recovery failed.');
    }
  };

  const openProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      const loaded = await loadProjectFile(file);
      setProject(loaded.project);
      setSelectedFeatureId(loaded.project.features[1]?.id ?? loaded.project.features[0]?.id ?? null);
      setTopologySelection(null); setLastExport(null); setLastStepExport(null); setLastThreeMfExport(null); setLastSplitThreeMfExport(null); setManufacturingReport(null); setRecoveryCandidate(null);
      const migration = loaded.report.migrated ? ` · migrated schema v${loaded.report.sourceSchemaVersion} → v${loaded.report.schemaVersion}` : ` · schema v${loaded.report.schemaVersion}`;
      setStatus(`Project opened${migration} · ${loaded.report.fileName}.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Project open blocked: ${error.message}` : 'Project open failed.');
    }
  };

  const exportStl = async () => {
    setStlBusy(true); setStatus('Rebuilding manufacturing geometry for STL…');
    try {
      const report = await downloadProjectStlAdaptive(project);
      setLastExport(report);
      setStatus(`${report.valid ? 'STL preflight PASS' : 'STL exported with mesh warnings'} · ${report.fileName} · ${report.triangleCount} triangles · ${(report.byteLength / 1024).toFixed(1)} KB · ${report.kernelId}.`);
    } catch (error) {
      setStatus(error instanceof Error ? `STL export blocked: ${error.message}` : 'STL export failed.');
    } finally { setStlBusy(false); }
  };

  const exportThreeMf = async () => {
    setThreeMfBusy(true); setStatus('Building portable 3MF from final manufacturing geometry…');
    try {
      const report = await downloadProjectThreeMf(project);
      setLastThreeMfExport(report);
      const warningText = report.warnings.length > 0 ? ` · ${report.warnings.join(' ')}` : '';
      setStatus(`3MF export PASS · ${report.fileName} · ${report.triangleCount} triangles · ${(report.byteLength / 1024).toFixed(1)} KB · millimeter · ${report.kernelId}${warningText}`);
    } catch (error) {
      setStatus(error instanceof Error ? `3MF export blocked: ${error.message}` : '3MF export failed.');
    } finally { setThreeMfBusy(false); }
  };

  const exportSplitThreeMf = async () => {
    const plan = manufacturingReport?.splitPlan;
    if (!plan) {
      setStatus('Split 3MF export requires a current Analyze Print result with a split plan.');
      return;
    }
    if (manufacturingReport.exportBlocked) {
      setStatus('Split 3MF export blocked: resolve invalid geometry/project findings first.');
      return;
    }

    setSplitThreeMfBusy(true);
    setStatus(`Generating ${plan.pieceCount} exact B-Rep split envelope(s) for multi-object 3MF…`);
    try {
      const report = await downloadProjectSplitThreeMf(project, plan);
      setLastSplitThreeMfExport(report);
      const warningText = report.warnings.length > 0 ? ` · ${report.warnings.join(' ')}` : '';
      setStatus(
        `Split 3MF PASS · ${report.fileName} · ${report.generatedPieceCount} exact object(s) · `
        + `${(report.byteLength / 1024).toFixed(1)} KB · volume conserved ${report.volumeConserved ? 'yes' : 'no'}${warningText}`,
      );
    } catch (error) {
      setLastSplitThreeMfExport(null);
      setStatus(error instanceof Error ? `Split 3MF export blocked: ${error.message}` : 'Split 3MF export failed.');
    } finally {
      setSplitThreeMfBusy(false);
    }
  };

  const exportStep = async () => {
    setExactBusy(true); setStatus('Loading OpenCascade WASM and rebuilding exact B-Rep…');
    try {
      const report = await downloadProjectStep(project);
      setLastStepExport(report);
      const warningText = report.warnings.length > 0 ? ` · ${report.warnings.join(' ')}` : '';
      setStatus(`STEP export PASS · ${report.fileName} · ${report.faceCount} faces · ${report.edgeCount} edges · ${(report.byteLength / 1024).toFixed(1)} KB${warningText}`);
    } catch (error) {
      setStatus(error instanceof Error ? `STEP export blocked: ${error.message}` : 'STEP export failed.');
    } finally { setExactBusy(false); }
  };

  const analyzePrint = async () => {
    setManufacturingBusy(true);
    setStatus('Analyzing final manufacturing geometry…');
    try {
      const report = await analyzeManufacturingReadiness(project);
      setManufacturingReport(report);
      const blockers = report.findings.filter((entry) => entry.level === 'blocker').length;
      const warnings = report.findings.filter((entry) => entry.level === 'warning').length;
      setStatus(
        (report.selectedPrinterReady ? 'Manufacturing readiness PASS' : 'Manufacturing review needed')
        + ` · ${report.exact ? 'exact' : 'lightweight'} ${report.kernelId} · ${blockers} blocker(s) · ${warnings} warning(s).`,
      );
    } catch (error) {
      setManufacturingReport(null);
      setStatus(error instanceof Error ? `Manufacturing analysis blocked: ${error.message}` : 'Manufacturing analysis failed.');
    } finally {
      setManufacturingBusy(false);
    }
  };

  const reset = () => {
    const next = createDefaultProject();
    setProject(next); setSelectedFeatureId(next.features[1]?.id ?? next.features[0]?.id ?? null); setTopologySelection(null); setLastExport(null); setLastStepExport(null); setLastThreeMfExport(null); setManufacturingReport(null); setRecoveryCandidate(null); setStatus('Workspace reset.');
  };

  const handleTopologySelection = (selection: TopologySelection | null) => {
    setTopologySelection(selection);
    if (!selection) return;
    if (selection.kind === 'edge') setStatus(`Exact edge selected · ${selection.signature.curveKind} · ${selection.signature.lengthMm.toFixed(2)} mm · ready for Fillet/Chamfer binding.`);
    else {
      const ref = createFaceTopologyRef(selection, lastEnabledFeatureId(project.features));
      setStatus(`Exact face selected · ${selection.signature.areaMm2.toFixed(2)} mm² · ${selection.lineageIds.length} lineage anchor(s) · ${isSupportedPlanarFace(ref) ? 'Sketch/Hole/Cut attachment ready' : 'inspection only'}.`);
    }
  };

  const renderEdgeTreatmentInspector = (feature: FilletFeature | ChamferFeature) => {
    const topologyBound = feature.params.selection.mode === 'topology';
    const value = feature.kind === 'fillet' ? feature.params.radius : feature.params.distance;
    const label = feature.kind === 'fillet' ? 'Radius' : 'Distance';
    return <div className="inspector-grid">
      <label><span>{label}</span><div><input type="number" step="0.1" value={value} onChange={(e) => updateFeature(feature.id, (current) => {
        if (current.kind === 'fillet') return { ...current, params: { ...current.params, radius: numberValue(e.target.value, 0) } };
        if (current.kind === 'chamfer') return { ...current, params: { ...current.params, distance: numberValue(e.target.value, 0) } };
        return current;
      })} /><b>mm</b></div></label>
      <div className="constraint-state" data-ready={feature.kind === 'fillet' ? exactKernelDescriptor.capabilities.exactFillet : exactKernelDescriptor.capabilities.exactChamfer}>
        <strong>{topologyBound ? 'Persisted exact-edge target' : 'Outer-edge preset'}</strong>
        <small>{feature.params.selection.mode === 'topology'
          ? `${feature.params.selection.ref.adjacentFaceLineageIds.length} lineage anchor(s) · ${feature.params.selection.ref.signature.curveKind} · ${feature.params.selection.ref.signature.lengthMm.toFixed(2)} mm`
          : `Current preset applies ${featureLabels[feature.kind]} to all four outer vertical edges.`}</small>
      </div>
      <div className="topology-bind-actions">
        <button type="button" onClick={rebindSelectedEdgeTreatment} disabled={topologySelection?.kind !== 'edge'}>Bind selected edge</button>
        <button type="button" onClick={useEdgeTreatmentPreset} disabled={!topologyBound}>Use 4-edge preset</button>
      </div>
    </div>;
  };

  const renderInspector = () => {
    if (!selectedFeature) return <p className="empty-inspector">Select a feature from the history to edit its parameters.</p>;
    if (selectedFeature.kind === 'sketch') {
      const sketchPlane = selectedFeature.params.plane;
      const attached = sketchPlane.kind === 'face';
      return <div className="inspector-grid">
        {sketchPlane.kind === 'face' ? <>
          <div className="constraint-state" data-ready>
            <strong>Attached planar sketch</strong>
            <small>Durable face lineage · local origin U {sketchPlane.originUMm.toFixed(2)} mm · V {sketchPlane.originVMm.toFixed(2)} mm</small>
          </div>
        </> : <>
          <label><span>Width</span><div><input type="number" step="0.1" value={project.dimensions.width} onChange={(e) => setDimension('width', e.target.value)} /><b>mm</b></div></label>
          <label><span>Depth</span><div><input type="number" step="0.1" value={project.dimensions.depth} onChange={(e) => setDimension('depth', e.target.value)} /><b>mm</b></div></label>
        </>}
        <div
          className="constraint-state"
          data-ready={selectedSketchSolution?.constraintState === 'fully-constrained'}
          data-constraint-state={selectedSketchSolution?.constraintState ?? 'unknown'}
        >
          <strong>{selectedSketchSolution?.constraintState ?? 'unknown'}</strong>
          <small>
            {attached ? 'Local U/V attached sketch intent.' : 'Centered base manufacturing rectangle'}
            {' · '}{selectedFeature.params.entities.length} persisted primitive(s)
            {selectedSketchSolution ? ` · ~${selectedSketchSolution.estimatedDegreesOfFreedom} remaining DOF` : ''}
          </small>
          {selectedSketchSolution?.conflicts[0] ? <small>{selectedSketchSolution.conflicts[0].message}</small> : null}
          {selectedSketchSolution && selectedSketchSolution.redundantConstraintIds.length > 0
            ? <small>{selectedSketchSolution.redundantConstraintIds.length} redundant constraint(s) preserved.</small>
            : null}
        </div>
      </div>;
    }
    if (selectedFeature.kind === 'datum-axis') {
      const source = project.features.find((feature) => feature.id === selectedFeature.params.source.sketchId);
      const local = selectedFeature.params.source.kind === 'sketch-local';
      return <div className="inspector-grid">
        <div className="constraint-state" data-ready={source?.kind === 'sketch'}>
          <strong>{source?.kind === 'sketch' ? `Source · ${source.name}` : 'Source missing'}</strong>
          <small>{local ? 'Attached Sketch local datum' : 'Base-XZ datum'} · persisted engineering intent.</small>
        </div>
        <label><span>Axis</span><select value={selectedFeature.params.source.axis} onChange={(e) => updateFeature(selectedFeature.id, (feature) => {
          if (feature.kind !== 'datum-axis') return feature;
          return feature.params.source.kind === 'sketch-local'
            ? { ...feature, params: { source: { ...feature.params.source, axis: e.target.value as 'u' | 'v' } } }
            : { ...feature, params: { source: { ...feature.params.source, axis: e.target.value as 'x' | 'z' } } };
        })}>
          {local ? <><option value="u">Local U</option><option value="v">Local V</option></> : <><option value="x">Global X</option><option value="z">Global Z</option></>}
        </select></label>
        <label><span>Offset</span><div><input type="number" step="0.1" value={selectedFeature.params.source.offsetMm} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'datum-axis'
          ? { ...feature, params: { source: { ...feature.params.source, offsetMm: Number(e.target.value) || 0 } } }
          : feature)} /><b>mm</b></div></label>
        <div className="constraint-state" data-ready>
          <strong>Durable datum foundation</strong>
          <small>Designed for Revolve and future axis-driven features; no runtime kernel handle is persisted.</small>
        </div>
      </div>;
    }
    if (selectedFeature.kind === 'extrude') return <div className="inspector-grid">
      <label><span>Distance</span><div><input type="number" step="0.1" value={project.dimensions.height} onChange={(e) => setDimension('height', e.target.value)} /><b>mm</b></div></label>
      <div className="constraint-state" data-ready><strong>Parametric</strong><small>Extrude distance is linked to the named height parameter.</small></div>
    </div>;
    if (selectedFeature.kind === 'pad') return <div className="inspector-grid">
      <label><span>Distance</span><div><input type="number" min="0.1" step="0.1" value={selectedFeature.params.distanceMm} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'pad' ? { ...feature, params: { ...feature.params, distanceMm: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label>
      <div className="constraint-state" data-ready={exactKernelDescriptor.capabilities.attachedPlanarMaterialFeatures}>
        <strong>Exact attached Pad</strong>
        <small>Source Sketch {selectedFeature.params.sketchId.slice(0, 8)} · outward along the resolved durable plane normal.</small>
      </div>
    </div>;
    if (selectedFeature.kind === 'pocket') return <div className="inspector-grid">
      <label><span>Extent</span><select value={selectedFeature.params.extent} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'pocket' ? { ...feature, params: { ...feature.params, extent: e.target.value === 'through-all' ? 'through-all' : 'distance' } } : feature)}><option value="distance">Distance</option><option value="through-all">Through all</option></select></label>
      {selectedFeature.params.extent === 'distance' ? <label><span>Depth</span><div><input type="number" min="0.1" step="0.1" value={selectedFeature.params.distanceMm} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'pocket' ? { ...feature, params: { ...feature.params, distanceMm: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label> : null}
      <div className="constraint-state" data-ready={exactKernelDescriptor.capabilities.attachedPlanarMaterialFeatures}>
        <strong>Exact attached Pocket</strong>
        <small>Source Sketch {selectedFeature.params.sketchId.slice(0, 8)} · removes material opposite the resolved durable plane normal.</small>
      </div>
    </div>;
    if (selectedFeature.kind === 'revolve') {
      const sketch = project.features.find((feature) => feature.id === selectedFeature.params.sketchId);
      const axis = project.features.find((feature) => feature.id === selectedFeature.params.axisId);
      return <div className="inspector-grid">
        <div className="constraint-state" data-ready={sketch?.kind === 'sketch' && axis?.kind === 'datum-axis'}>
          <strong>{sketch?.kind === 'sketch' ? `Profile · ${sketch.name}` : 'Profile missing'}</strong>
          <small>{axis?.kind === 'datum-axis' ? `Axis · ${axis.name}` : 'Datum Axis missing'} · additive exact feature.</small>
        </div>
        <label><span>Angle</span><div><input type="number" min="0.1" max="360" step="1" value={selectedFeature.params.angleDeg} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'revolve'
          ? { ...feature, params: { ...feature.params, angleDeg: Math.min(360, numberValue(e.target.value, 0.1)) } }
          : feature)} /><b>°</b></div></label>
        <div className="constraint-state" data-ready={exactKernelDescriptor.capabilities.revolve}>
          <strong>Exact additive Revolve</strong>
          <small>Uses one promoted attached profile and one durable local Datum Axis; inner-hole regions are intentionally blocked in this foundation.</small>
        </div>
      </div>;
    }
    if (selectedFeature.kind === 'hole') {
      const faceBound = selectedFeature.params.placement.mode === 'face';
      return <div className="inspector-grid">
        <label><span>Diameter</span><div><input type="number" step="0.1" value={selectedFeature.params.diameter} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'hole' ? { ...feature, params: { ...feature.params, diameter: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label>
        {faceBound ? <>
          <label><span>Face U</span><div><input type="number" step="0.1" value={selectedFeature.params.placement.mode === 'face' ? selectedFeature.params.placement.uMm : 0} onChange={(e) => updateFaceLocalCoordinate(selectedFeature.id, 'uMm', e.target.value)} /><b>mm</b></div></label>
          <label><span>Face V</span><div><input type="number" step="0.1" value={selectedFeature.params.placement.mode === 'face' ? selectedFeature.params.placement.vMm : 0} onChange={(e) => updateFaceLocalCoordinate(selectedFeature.id, 'vMm', e.target.value)} /><b>mm</b></div></label>
          <div className="constraint-state" data-ready><strong>Persisted exact-face target</strong><small>Local U/V · tool axis follows resolved face normal</small></div>
        </> : <>
          <label><span>X</span><div><input type="number" step="0.1" value={selectedFeature.params.x} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'hole' ? { ...feature, params: { ...feature.params, x: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
          <label><span>Z</span><div><input type="number" step="0.1" value={selectedFeature.params.z} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'hole' ? { ...feature, params: { ...feature.params, z: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
        </>}
        <div className="topology-bind-actions"><button type="button" onClick={bindSelectedFeatureToFace} disabled={topologySelection?.kind !== 'face'}>Bind selected face</button><button type="button" onClick={useGlobalPlacement} disabled={!faceBound}>Use global X/Z</button></div>
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
          <div className="constraint-state" data-ready><strong>Persisted exact-face target</strong><small>Local U/V · tool axis follows resolved face normal</small></div>
        </> : <>
          <label><span>X</span><div><input type="number" step="0.1" value={selectedFeature.params.x} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'cut' ? { ...feature, params: { ...feature.params, x: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
          <label><span>Z</span><div><input type="number" step="0.1" value={selectedFeature.params.z} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'cut' ? { ...feature, params: { ...feature.params, z: Number(e.target.value) || 0 } } : feature)} /><b>mm</b></div></label>
        </>}
        <div className="topology-bind-actions"><button type="button" onClick={bindSelectedFeatureToFace} disabled={topologySelection?.kind !== 'face'}>Bind selected face</button><button type="button" onClick={useGlobalPlacement} disabled={!faceBound}>Use global X/Z</button></div>
      </div>;
    }
    if (selectedFeature.kind === 'mirror') {
      const source = project.features.find((feature) => feature.id === selectedFeature.params.sourceFeatureId);
      const faceBound = source && (source.kind === 'hole' || source.kind === 'cut') && source.params.placement.mode === 'face';
      return <div className="inspector-grid">
        <div className="constraint-state" data-ready={Boolean(source)}>
          <strong>{source ? `Source · ${source.name}` : 'Source missing'}</strong>
          <small>Mirror derives one reflected instance; the source feature is not copied.</small>
        </div>
        <label><span>Plane</span><select value={selectedFeature.params.plane.axis} onChange={(e) => updateFeature(selectedFeature.id, (feature) => {
          if (feature.kind !== 'mirror') return feature;
          return { ...feature, params: { ...feature.params, plane: faceBound
            ? { kind: 'face-local', axis: e.target.value as 'u' | 'v', offsetMm: feature.params.plane.offsetMm }
            : { kind: 'global', axis: e.target.value as 'x' | 'z', offsetMm: feature.params.plane.offsetMm } } };
        })}>
          {faceBound ? <><option value="u">Local U</option><option value="v">Local V</option></> : <><option value="x">Global X</option><option value="z">Global Z</option></>}
        </select></label>
        <label><span>Offset</span><div><input type="number" step="0.1" value={selectedFeature.params.plane.offsetMm} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'mirror'
          ? { ...feature, params: { ...feature.params, plane: { ...feature.params.plane, offsetMm: Number(e.target.value) || 0 } } }
          : feature)} /><b>mm</b></div></label>
        <div className="constraint-state" data-ready={exactKernelDescriptor.capabilities.mirror}>
          <strong>Exact deterministic Mirror</strong>
          <small>{faceBound ? 'Source-face-local plane' : 'Global symmetry plane'} · exact-kernel-only foundation.</small>
        </div>
      </div>;
    }

    if (selectedFeature.kind === 'linear-pattern') {
      const source = project.features.find((feature) => feature.id === selectedFeature.params.sourceFeatureId);
      const faceBound = source && (source.kind === 'hole' || source.kind === 'cut') && source.params.placement.mode === 'face';
      return <div className="inspector-grid">
        <div className="constraint-state" data-ready={Boolean(source)}>
          <strong>{source ? `Source · ${source.name}` : 'Source missing'}</strong>
          <small>Derived instances are not copied into CadProject.</small>
        </div>
        <label><span>Count</span><div><input type="number" min="2" max="64" step="1" value={selectedFeature.params.count} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'linear-pattern' ? { ...feature, params: { ...feature.params, count: Math.min(64, Math.max(2, Math.round(Number(e.target.value) || 2))) } } : feature)} /><b>×</b></div></label>
        <label><span>Spacing</span><div><input type="number" min="0.1" step="0.1" value={selectedFeature.params.spacingMm} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'linear-pattern' ? { ...feature, params: { ...feature.params, spacingMm: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label>
        <label><span>Axis</span><select value={selectedFeature.params.axis} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'linear-pattern' ? { ...feature, params: { ...feature.params, axis: e.target.value as 'x' | 'z' | 'u' | 'v' } } : feature)}>
          {faceBound ? <><option value="u">Local U</option><option value="v">Local V</option></> : <><option value="x">Global X</option><option value="z">Global Z</option></>}
        </select></label>
        <div className="constraint-state" data-ready={exactKernelDescriptor.capabilities.linearPattern}>
          <strong>Exact deterministic pattern</strong>
          <small>{selectedFeature.params.count - 1} derived instance(s) · exact-kernel-only foundation.</small>
        </div>
      </div>;
    }
    if (selectedFeature.kind === 'shell') return <div className="inspector-grid">
      <label><span>Thickness</span><div><input type="number" min="0.1" step="0.1" value={selectedFeature.params.thicknessMm} onChange={(e) => updateFeature(selectedFeature.id, (feature) => feature.kind === 'shell' ? { ...feature, params: { ...feature.params, thicknessMm: numberValue(e.target.value, 0.1) } } : feature)} /><b>mm</b></div></label>
      <div className="constraint-state" data-ready={exactKernelDescriptor.capabilities.shell}>
        <strong>Exact inward Shell</strong>
        <small>{selectedFeature.params.openings.length} durable opening face(s) · OpenCascade topology history enabled.</small>
      </div>
      <div className="topology-bind-actions">
        <button type="button" onClick={addSelectedShellOpening} disabled={topologySelection?.kind !== 'face'}>Add selected opening</button>
        <button type="button" onClick={replaceShellOpeningWithSelectedFace} disabled={topologySelection?.kind !== 'face'}>Use selected only</button>
        <button type="button" onClick={removeLastShellOpening} disabled={selectedFeature.params.openings.length <= 1}>Remove last</button>
      </div>
    </div>;
    return renderEdgeTreatmentInspector(selectedFeature);
  };

  const sketchSelected = selectedFeature?.kind === 'sketch';

  return (
    <main className="app-shell" data-density={policy.workspaceDensity}>
      <header className="topbar">
        <div><strong>CAD_CAM_3D</strong><span>AI-first parametric design for printable parts</span></div>
        <div className="topbar-actions">
          <span className="managed-badge" title={`${managementIdentity.appName} được quản lý dưới ${managementIdentity.controlPlane}`}>Managed · Quản trị Ứng dụng</span>
          <span className="kernel-badge" title={`Kernel id: ${activeCadKernel.id}`}>{activeCadKernel.label}</span>
          <button type="button" onClick={saveProject}>Save Project</button>
          {recoveryCandidate ? <button type="button" onClick={restoreRecovery} title={`Local autosave from ${new Date(recoveryCandidate.savedAt).toLocaleString()}`}>Recover</button> : null}
          <button type="button" onClick={() => projectInputRef.current?.click()}>Open Project</button>
          <button type="button" onClick={() => void analyzePrint()} disabled={!rebuilt.hasSolid || manufacturingBusy}>{manufacturingBusy ? 'Analyzing…' : 'Analyze Print'}</button>
          <button type="button" onClick={() => void exportStl()} disabled={!rebuilt.hasSolid || stlBusy}>{stlBusy ? 'Building STL…' : 'Export STL'}</button>
          <button type="button" onClick={() => void exportThreeMf()} disabled={!rebuilt.hasSolid || threeMfBusy}>{threeMfBusy ? 'Building 3MF…' : 'Export 3MF'}</button>
          <button type="button" onClick={() => void exportStep()} disabled={!rebuilt.hasSolid || exactBusy}>{exactBusy ? 'Building B-Rep…' : 'Export STEP'}</button>
          <button type="button" onClick={reset}>Reset</button>
          <input ref={projectInputRef} className="file-input" type="file" accept=".json,.cad3d.json,application/json" onChange={(event) => { const file = event.target.files?.[0]; void openProject(file); event.target.value = ''; }} />
        </div>
      </header>

      <section className="workspace">
        <aside className="panel tools-panel">
          <h2>Build</h2>
          {(['sketch', 'datum-axis', 'extrude', 'pad', 'pocket', 'revolve', 'hole', 'cut', 'linear-pattern', 'mirror', 'fillet', 'chamfer', 'shell'] as FeatureKind[]).map((kind) => (
            <button key={kind} type="button" className="tool-button" onClick={() => addFeature(kind)}>
              <span>{featureLabels[kind]}</span>
              <small>{kind === 'sketch' && topologySelection?.kind === 'face'
  ? 'Attach selected face'
  : kind === 'datum-axis' && selectedFeature?.kind === 'sketch'
    ? 'Use selected Sketch'
  : (kind === 'pad' || kind === 'pocket') && selectedFeature?.kind === 'sketch' && selectedFeature.params.plane.kind === 'face'
    ? 'Use selected Sketch'
  : kind === 'revolve' && selectedFeature?.kind === 'datum-axis'
    ? 'Use selected Datum Axis'
    : (kind === 'fillet' || kind === 'chamfer') && topologySelection?.kind === 'edge'
      ? 'Use selected edge'
      : kind === 'mirror' && (selectedFeature?.kind === 'hole' || selectedFeature?.kind === 'cut')
        ? 'Mirror selected feature'
        : kind === 'linear-pattern' && (selectedFeature?.kind === 'hole' || selectedFeature?.kind === 'cut')
        ? 'Repeat selected feature'
        : kind === 'shell' && topologySelection?.kind === 'face'
        ? 'Open selected face'
        : (kind === 'hole' || kind === 'cut') && topologySelection?.kind === 'face'
          ? 'Use selected face'
          : 'Add feature'}</small>
            </button>
          ))}
          <h2>Exact topology</h2>
          <div className="profile-card">
            <strong>{topologySelection ? `${topologySelection.kind} selected` : 'No topology selected'}</strong>
            <span>{topologySelection?.kind === 'edge' ? `${topologySelection.signature.curveKind} · ${topologySelection.signature.lengthMm.toFixed(2)} mm` : topologySelection?.kind === 'face' ? `${topologySelection.signature.areaMm2.toFixed(2)} mm²` : 'Use Face / Edge controls in the viewport.'}</span>
            <small>{topologySelection?.kind === 'edge' ? 'Adding Fillet/Chamfer stores a durable edge reference.' : topologySelection?.kind === 'face' ? 'Adding Sketch/Hole/Cut stores durable face-local intent; Shell can persist the selected exact face as an opening.' : 'Exact selection is lazy-loaded only when requested or required.'}</small>
          </div>
          <h2>Master parameters</h2>
          <div className="dimension-grid">{(['width', 'depth', 'height'] as const).map((key) => <label key={key}><span>{key}</span><div><input type="number" min="0.1" max="1000" step="0.1" value={project.dimensions[key]} onChange={(e) => setDimension(key, e.target.value)} /><b>mm</b></div></label>)}</div>
        </aside>

        <section className="canvas-panel">
          {sketchSelected ? (
            <Sketcher
              project={project}
              feature={selectedFeature}
              onChange={(next) => updateFeature(next.id, () => next)}
              onMessage={setStatus}
            />
          ) : <Viewport project={project} onSelectionChange={handleTopologySelection} />}
          <div className="canvas-caption">{sketchSelected
            ? `Sketch workspace · schema-v6 · ${selectedFeature.params.plane.kind === 'face' ? 'attached local U/V plane' : `base XZ profile ${project.dimensions.width} × ${project.dimensions.depth} mm`}`
            : `Rebuilt solid · ${rebuilt.width} × ${rebuilt.depth} × ${rebuilt.height} mm · ${rebuilt.holes.length} hole(s) · ${rebuilt.cuts.length} cut(s)${topologySelection ? ` · ${topologySelection.kind} selected` : ''}`}</div>
        </section>

        <aside className="panel history-panel">
          <h2>Feature history</h2>
          <ol className="feature-tree">{project.features.map((feature) => <li key={feature.id} data-selected={feature.id === selectedFeatureId} data-disabled={!feature.enabled}><button type="button" onClick={() => setSelectedFeatureId(feature.id)}><span className="feature-dot" /><div><strong>{feature.name}</strong><small>{feature.kind}{feature.kind === 'sketch' ? ` · ${feature.params.plane.kind === 'face' ? 'attached' : 'base XZ'}${feature.params.entities.length > 0 ? ` · ${feature.params.entities.length} primitive(s)` : ''}` : ''}{(feature.kind === 'fillet' || feature.kind === 'chamfer') && feature.params.selection.mode === 'topology' ? ' · topology-bound' : ''}{(feature.kind === 'hole' || feature.kind === 'cut') && feature.params.placement.mode === 'face' ? ' · face-bound' : ''}{(feature.kind === 'pad' || feature.kind === 'pocket' || feature.kind === 'revolve') ? ` · sketch ${feature.params.sketchId.slice(0, 8)}` : ''}{feature.kind === 'datum-axis' ? ` · ${feature.params.source.axis}` : ''}{feature.enabled ? '' : ' · suppressed'}</small></div></button></li>)}</ol>
          <h2>Feature inspector</h2>
          <div className="feature-inspector">{renderInspector()}{selectedFeature ? <div className="inspector-actions"><button type="button" onClick={toggleSelectedFeature}>{selectedFeature.enabled ? 'Suppress' : 'Enable'}</button><button type="button" className="danger" onClick={removeSelectedFeature}>Remove</button></div> : null}</div>
          <h2>Rebuild diagnostics</h2>
          <ul className="checks diagnostics">{rebuilt.diagnostics.length === 0 ? <li data-level="ok">Feature history rebuilt without semantic errors.</li> : rebuilt.diagnostics.map((diagnostic, index) => <li key={index} data-level={diagnostic.level}>{diagnostic.message}</li>)}</ul>
          <h2>Print readiness</h2>
          <div className="profile-card"><strong>{project.printProfile.name}</strong><span>{project.printProfile.material} · {project.printProfile.nozzleMm} mm nozzle</span></div>
          <ul className="checks">{checks.map((check, index) => <li key={index} data-level={check.level}>{check.message}</li>)}</ul>
          {manufacturingReport ? <>
            <div className="profile-card">
              <strong>Adaptive manufacturing analysis · {manufacturingReport.selectedPrinterReady ? 'READY' : 'REVIEW'}</strong>
              <span>{manufacturingReport.exact ? 'Exact' : 'Lightweight'} · {manufacturingReport.kernelId} · {manufacturingReport.dimensionsMm.width.toFixed(2)} × {manufacturingReport.dimensionsMm.depth.toFixed(2)} × {manufacturingReport.dimensionsMm.height.toFixed(2)} mm</span>
              <small>{manufacturingReport.exportBlocked ? 'Manufacturing export is blocked by invalid geometry/project state.' : 'No geometry-state export blocker detected. Printer/profile warnings may still require action.'}</small>
            </div>
            <ul className="checks diagnostics">{manufacturingReport.findings.map((finding) => <li key={finding.id} data-level={finding.level === 'blocker' ? 'error' : finding.level}>
              {finding.message}{finding.remedy ? ` Remedy: ${finding.remedy}` : ''}
            </li>)}</ul>
            {manufacturingReport.splitPlan ? <div className="profile-card">
              <strong>Exact split handoff · {manufacturingReport.splitPlan.pieceCount} planned piece(s)</strong>
              <span>{manufacturingReport.splitPlan.strategy === 'single-axis' ? 'Single-axis' : 'Grid'} · flat seams · multi-object Core 3MF</span>
              <small>OpenCascade intersects the final B-Rep with each planned envelope. Empty, invalid or disconnected cells fail closed; alignment joints are not generated yet.</small>
              <div className="topology-bind-actions">
                <button
                  type="button"
                  onClick={() => void exportSplitThreeMf()}
                  disabled={manufacturingReport.exportBlocked || splitThreeMfBusy}
                >
                  {splitThreeMfBusy ? 'Building split 3MF…' : 'Export Split 3MF'}
                </button>
              </div>
            </div> : null}
          </> : null}
          {lastExport ? <div className="profile-card"><strong>Last STL · {lastExport.valid ? 'PASS' : 'WARN'}</strong><span>{lastExport.triangleCount} triangles · {(lastExport.byteLength / 1024).toFixed(1)} KB</span><small>{lastExport.messages.join(' ')}</small><small>Kernel: {lastExport.kernelId}</small></div> : null}
          {lastThreeMfExport ? <div className="profile-card"><strong>Last 3MF · {lastThreeMfExport.valid ? 'PASS' : 'WARN'}</strong><span>{lastThreeMfExport.triangleCount} triangles · {(lastThreeMfExport.byteLength / 1024).toFixed(1)} KB · {lastThreeMfExport.unit}</span><small>Kernel: {lastThreeMfExport.kernelId} · Core 3MF single-object package</small>{lastThreeMfExport.warnings.length > 0 ? <small>{lastThreeMfExport.warnings.join(' ')}</small> : null}</div> : null}
          {lastSplitThreeMfExport ? <div className="profile-card"><strong>Last Split 3MF · {lastSplitThreeMfExport.valid && lastSplitThreeMfExport.volumeConserved ? 'PASS' : 'WARN'}</strong><span>{lastSplitThreeMfExport.objectCount} object(s) · {lastSplitThreeMfExport.triangleCount} triangles · {(lastSplitThreeMfExport.byteLength / 1024).toFixed(1)} KB</span><small>Exact B-Rep · volume delta {lastSplitThreeMfExport.volumeDeltaMm3.toFixed(6)} mm³ · flat seams only</small>{lastSplitThreeMfExport.warnings.length > 0 ? <small>{lastSplitThreeMfExport.warnings.join(' ')}</small> : null}</div> : null}
          {lastStepExport ? <div className="profile-card"><strong>Last STEP · {lastStepExport.valid ? 'PASS' : 'WARN'}</strong><span>{lastStepExport.faceCount} faces · {lastStepExport.edgeCount} edges · {(lastStepExport.byteLength / 1024).toFixed(1)} KB</span><small>Volume {lastStepExport.volumeMm3.toFixed(1)} mm³ · Surface {lastStepExport.surfaceAreaMm2.toFixed(1)} mm²</small><small>Kernel: {lastStepExport.kernelId}{lastStepExport.filletApplied ? ' · fillet' : ''}{lastStepExport.chamferApplied ? ' · chamfer' : ''}</small>{lastStepExport.warnings.length > 0 ? <small>{lastStepExport.warnings.join(' ')}</small> : null}</div> : null}
          <h2>Kernel</h2>
          <div className="profile-card"><strong>{activeCadKernel.label}</strong><span>{activeCadKernel.capabilities.exactBrep ? 'Exact B-Rep' : 'Fast deterministic mesh'} · STL {activeCadKernel.capabilities.stlExport ? 'ready' : 'off'}</span><small>Simple vertical features stay lightweight. Exact edge/face features promote preview/STL automatically.</small></div>
          <div className="profile-card"><strong>{exactKernelDescriptor.label}</strong><span>Exact B-Rep · STEP/STL · Pad/Pocket/Revolve · Fillet/Chamfer/Shell · Linear Pattern / Mirror · face tools</span><small>Attached Sketches drive exact Pad/Pocket/Revolve; durable Datum Axis drives Revolve; durable edge refs drive Fillet/Chamfer; durable face refs drive Shell openings and oriented Hole/Cut; Linear Pattern and Mirror derive repeated/symmetric Hole/Cut instances without copying canonical source features.</small></div>
          <h2>Management</h2>
          <div className="management-card"><strong>{managementIdentity.controlPlane}</strong><span>UI policy · feature flags · print policy</span><small>Project geometry and export files remain inside CAD_CAM_3D.</small></div>
        </aside>
      </section>

      {policy.aiCommandBridge ? <div className="command-stack">
        <form className="commandbar" onSubmit={runCommand}>
          <div className="command-copy"><strong>Design command planner</strong><span>{status}</span></div>
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Try: 80x50x25 · hole 4mm · cut 12x8 · fillet 2mm · chamfer 1mm" aria-label="Design instruction" />
          <button type="submit">Preview</button>
        </form>
        {designProposal ? <div className="command-proposal" data-status={designProposal.status}>
          <div><strong>{designProposal.status === 'ready' ? 'Validated proposal' : designProposal.status === 'blocked' ? 'Blocked proposal' : 'Unsupported instruction'}</strong><span>{designProposal.summary}</span></div>
          <ul>{designProposal.diagnostics.map((diagnostic, index) => <li key={index}>{diagnostic}</li>)}</ul>
          <div className="command-proposal-actions">
            <button type="button" onClick={cancelDesignProposal}>Cancel</button>
            <button type="button" onClick={commitDesignProposal} disabled={designProposal.status !== 'ready'}>Commit</button>
          </div>
        </div> : null}
      </div> : null}
    </main>
  );
}
