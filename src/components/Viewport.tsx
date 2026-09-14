import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CadProject } from '../cad/model';
import { activeCadKernel } from '../cad/kernel';
import { buildExactKernelSnapshot, type ExactKernelSnapshot } from '../cad/exact-kernel';
import {
  remapTopologySelection,
  resolveFaceFromTriangle,
  selectionFromEdge,
  selectionFromFace,
  type ExactEdgeTopology,
  type TopologySelection,
  type TopologySelectionMode,
} from '../cad/topology-selection';

type ExactStatus = 'idle' | 'loading' | 'ready' | 'error';

type Props = {
  project: CadProject;
  selectionMode?: TopologySelectionMode;
  selection?: TopologySelection | null;
  onSelectionChange?: (selection: TopologySelection | null) => void;
  onExactStatus?: (status: ExactStatus, message: string) => void;
};

function disposeObject(object: THREE.Object3D) {
  if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
    object.geometry.dispose();
    const material = object.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
  }
}

function disposeGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}

function sameSelection(a: TopologySelection | null | undefined, b: TopologySelection | null | undefined) {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.runtimeId === b.runtimeId;
}

function edgeLine(edge: ExactEdgeTopology) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edge.points), 3));
  const material = new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.62 });
  const line = new THREE.Line(geometry, material);
  line.userData.edgeTopology = edge;
  return line;
}

export function Viewport({
  project,
  selectionMode,
  selection,
  onSelectionChange,
  onExactStatus,
}: Props) {
  const [localMode, setLocalMode] = useState<TopologySelectionMode>('off');
  const [localSelection, setLocalSelection] = useState<TopologySelection | null>(null);
  const [localStatus, setLocalStatus] = useState<{ status: ExactStatus; message: string }>({
    status: 'idle',
    message: 'Fast mesh preview active.',
  });
  const [exactRevision, setExactRevision] = useState(0);

  const effectiveMode = selectionMode ?? localMode;
  const effectiveSelection = selection === undefined ? localSelection : selection;

  const mountRef = useRef<HTMLDivElement>(null);
  const partGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const exactMeshRef = useRef<THREE.Mesh | null>(null);
  const exactEdgeLinesRef = useRef<THREE.Line[]>([]);
  const exactSnapshotRef = useRef<ExactKernelSnapshot | null>(null);
  const highlightRef = useRef<THREE.Object3D | null>(null);
  const selectionModeRef = useRef<TopologySelectionMode>(effectiveMode);
  const selectionRef = useRef<TopologySelection | null>(effectiveSelection);
  const onSelectionChangeRef = useRef<(next: TopologySelection | null) => void>(() => undefined);
  const onExactStatusRef = useRef<(status: ExactStatus, message: string) => void>(() => undefined);
  const edgePickThresholdRef = useRef(1.2);

  useEffect(() => {
    selectionModeRef.current = effectiveMode;
  }, [effectiveMode]);

  useEffect(() => {
    selectionRef.current = effectiveSelection;
  }, [effectiveSelection]);

  useEffect(() => {
    onSelectionChangeRef.current = (next) => {
      if (selection === undefined) setLocalSelection(next);
      onSelectionChange?.(next);
    };
  }, [selection, onSelectionChange]);

  useEffect(() => {
    onExactStatusRef.current = (status, message) => {
      setLocalStatus({ status, message });
      onExactStatus?.(status, message);
    };
  }, [onExactStatus]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8fafc');

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(110, 90, 110);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 8, 0);
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(80, 120, 60);
    scene.add(key);

    const grid = new THREE.GridHelper(260, 26, 0x94a3b8, 0xcbd5e1);
    grid.position.y = -0.01;
    scene.add(grid);

    const axes = new THREE.AxesHelper(28);
    scene.add(axes);

    const partGroup = new THREE.Group();
    partGroupRef.current = partGroup;
    scene.add(partGroup);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDown) return;
      const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
      pointerDown = null;
      if (moved > 5 || selectionModeRef.current === 'off') return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const snapshot = exactSnapshotRef.current;
      if (!snapshot) return;

      if (selectionModeRef.current === 'face') {
        const mesh = exactMeshRef.current;
        if (!mesh) return;
        const hit = raycaster.intersectObject(mesh, false)[0];
        if (!hit || hit.faceIndex == null) {
          onSelectionChangeRef.current(null);
          return;
        }
        const face = resolveFaceFromTriangle(snapshot.topology.faces, hit.faceIndex);
        onSelectionChangeRef.current(face ? selectionFromFace(face) : null);
        return;
      }

      raycaster.params.Line = { threshold: edgePickThresholdRef.current };
      const hit = raycaster.intersectObjects(exactEdgeLinesRef.current, false)[0];
      const edge = hit?.object.userData.edgeTopology as ExactEdgeTopology | undefined;
      onSelectionChangeRef.current(edge ? selectionFromEdge(edge) : null);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      disposeGroup(partGroup);
      renderer.dispose();
      renderer.domElement.remove();
      partGroupRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      rendererRef.current = null;
      exactMeshRef.current = null;
      exactEdgeLinesRef.current = [];
      exactSnapshotRef.current = null;
      highlightRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = partGroupRef.current;
    if (!group) return;

    let cancelled = false;
    disposeGroup(group);
    exactMeshRef.current = null;
    exactEdgeLinesRef.current = [];
    exactSnapshotRef.current = null;
    highlightRef.current = null;

    const frameCamera = (width: number, depth: number, height: number) => {
      const span = Math.max(width, depth, height, 25);
      edgePickThresholdRef.current = Math.max(0.7, span / 80);
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (camera && controls) {
        controls.target.set(0, height / 2, 0);
        camera.position.set(span * 1.45, span * 1.15, span * 1.45);
        camera.near = Math.max(0.05, span / 500);
        camera.far = Math.max(5000, span * 30);
        camera.updateProjectionMatrix();
        controls.update();
      }
    };

    if (effectiveMode === 'off') {
      onExactStatusRef.current('idle', 'Fast mesh preview active.');
      const { rebuilt, geometry } = activeCadKernel.buildMesh(project);
      if (!geometry) return;

      const material = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55, metalness: 0.05 });
      group.add(new THREE.Mesh(geometry, material));

      const edgeGeometry = new THREE.EdgesGeometry(geometry, 25);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.52 });
      group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
      frameCamera(rebuilt.width, rebuilt.depth, rebuilt.height);
      return;
    }

    onExactStatusRef.current('loading', `Loading exact ${effectiveMode} topology…`);
    void (async () => {
      try {
        const snapshot = await buildExactKernelSnapshot(project, { includeStep: false });
        if (cancelled) {
          snapshot.geometry.dispose();
          return;
        }

        exactSnapshotRef.current = snapshot;
        const material = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5, metalness: 0.04 });
        const mesh = new THREE.Mesh(snapshot.geometry, material);
        exactMeshRef.current = mesh;
        group.add(mesh);

        const edgeLines = snapshot.topology.edges.map(edgeLine);
        exactEdgeLinesRef.current = edgeLines;
        for (const line of edgeLines) group.add(line);

        frameCamera(snapshot.rebuilt.width, snapshot.rebuilt.depth, snapshot.rebuilt.height);

        const currentSelection = selectionRef.current;
        if (currentSelection) {
          if (currentSelection.kind !== effectiveMode) {
            onSelectionChangeRef.current(null);
          } else {
            const span = Math.max(snapshot.rebuilt.width, snapshot.rebuilt.depth, snapshot.rebuilt.height, 1);
            const remapped = remapTopologySelection(
              currentSelection,
              snapshot.topology.faces,
              snapshot.topology.edges,
              span,
            );
            if (!sameSelection(currentSelection, remapped)) onSelectionChangeRef.current(remapped);
          }
        }

        setExactRevision((revision) => revision + 1);
        const warningSuffix = snapshot.report.warnings.length > 0
          ? ` · ${snapshot.report.warnings.length} warning(s)`
          : '';
        onExactStatusRef.current(
          'ready',
          `Exact topology ready · ${snapshot.topology.faces.length} faces · ${snapshot.topology.edges.length} edges${warningSuffix}`,
        );
      } catch (error) {
        if (cancelled) return;
        onExactStatusRef.current(
          'error',
          error instanceof Error ? `Exact topology failed: ${error.message}` : 'Exact topology failed.',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project, effectiveMode]);

  useEffect(() => {
    const group = partGroupRef.current;
    if (!group) return;

    const previous = highlightRef.current;
    if (previous) {
      group.remove(previous);
      disposeObject(previous);
      highlightRef.current = null;
    }

    if (!effectiveSelection || effectiveMode === 'off') return;
    const snapshot = exactSnapshotRef.current;
    if (!snapshot) return;

    if (effectiveSelection.kind === 'face') {
      const face = snapshot.topology.faces.find((entry) => entry.runtimeId === effectiveSelection.runtimeId || entry.hash === effectiveSelection.hash);
      if (!face) return;
      const geometry = snapshot.geometry.clone();
      geometry.setDrawRange(face.triangleStart * 3, face.triangleCount * 3);
      const material = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.46,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const highlight = new THREE.Mesh(geometry, material);
      highlightRef.current = highlight;
      group.add(highlight);
      return;
    }

    const edge = snapshot.topology.edges.find((entry) => entry.runtimeId === effectiveSelection.runtimeId || entry.hash === effectiveSelection.hash);
    if (!edge) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edge.points), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false });
    const highlight = new THREE.Line(geometry, material);
    highlight.renderOrder = 10;
    highlightRef.current = highlight;
    group.add(highlight);
  }, [effectiveSelection, effectiveMode, exactRevision]);

  const setMode = (mode: TopologySelectionMode) => {
    if (selectionMode !== undefined) return;
    const nextMode = effectiveMode === mode ? 'off' : mode;
    setLocalMode(nextMode);
    if (nextMode === 'off' || localSelection?.kind !== nextMode) setLocalSelection(null);
  };

  return (
    <div className="viewport-shell">
      <div
        ref={mountRef}
        className="viewport"
        data-selection-mode={effectiveMode}
        aria-label="3D parametric preview viewport"
      />
      <div className="topology-toolbar" aria-label="Exact topology selection tools">
        <button type="button" data-active={effectiveMode === 'face'} onClick={() => setMode('face')} disabled={selectionMode !== undefined}>
          Face
        </button>
        <button type="button" data-active={effectiveMode === 'edge'} onClick={() => setMode('edge')} disabled={selectionMode !== undefined}>
          Edge
        </button>
        <button type="button" onClick={() => onSelectionChangeRef.current(null)} disabled={!effectiveSelection}>
          Clear
        </button>
      </div>
      <div className="topology-status" data-status={localStatus.status}>
        <strong>{effectiveMode === 'off' ? 'Fast preview' : `Exact ${effectiveMode} selection`}</strong>
        <span>{localStatus.message}</span>
        {effectiveSelection ? <small>Selected {effectiveSelection.runtimeId}</small> : null}
      </div>
    </div>
  );
}
