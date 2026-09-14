import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Dimensions } from '../cad/model';

type Props = { dimensions: Dimensions };

export function Viewport({ dimensions }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8fafc');

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(110, 90, 110);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(80, 120, 60);
    scene.add(key);

    const grid = new THREE.GridHelper(260, 26, 0x94a3b8, 0xcbd5e1);
    grid.position.y = -0.01;
    scene.add(grid);

    const material = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55, metalness: 0.05 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.position.y = 0.5;
    meshRef.current = mesh;
    scene.add(mesh);

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
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      meshRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.scale.set(dimensions.width, dimensions.height, dimensions.depth);
    mesh.position.y = dimensions.height / 2;
  }, [dimensions]);

  return <div ref={mountRef} className="viewport" aria-label="3D preview viewport" />;
}
