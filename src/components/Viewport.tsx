import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CadProject } from '../cad/model';
import { activeCadKernel } from '../cad/kernel';

type Props = { project: CadProject };

function disposeGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
  }
}

export function Viewport({ project }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const partGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

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
      controls.dispose();
      disposeGroup(partGroup);
      renderer.dispose();
      renderer.domElement.remove();
      partGroupRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = partGroupRef.current;
    if (!group) return;
    disposeGroup(group);

    const { rebuilt, geometry } = activeCadKernel.buildMesh(project);
    if (!geometry) return;

    const material = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55, metalness: 0.05 });
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    const edgeGeometry = new THREE.EdgesGeometry(geometry, 25);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.52 });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    group.add(edges);

    const span = Math.max(rebuilt.width, rebuilt.depth, rebuilt.height, 25);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      controls.target.set(0, rebuilt.height / 2, 0);
      camera.position.set(span * 1.45, span * 1.15, span * 1.45);
      camera.near = Math.max(0.05, span / 500);
      camera.far = Math.max(5000, span * 30);
      camera.updateProjectionMatrix();
      controls.update();
    }
  }, [project]);

  return <div ref={mountRef} className="viewport" aria-label="3D parametric preview viewport" />;
}
