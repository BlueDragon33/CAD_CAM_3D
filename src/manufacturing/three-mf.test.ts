import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createThreeMfModelXml, createThreeMfModelXmlFromObjects, createThreeMfPackageFromGeometries, createThreeMfPackageFromGeometry } from './three-mf';

function storedZipEntryNames(bytes: Uint8Array) {
  const names: string[] = [];
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
    const signature = view.getUint32(0, true);
    if (signature !== 0x04034b50) break;
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    names.push(decoder.decode(bytes.slice(nameStart, nameStart + nameLength)));
    offset = nameStart + nameLength + extraLength + size;
  }
  return names;
}

describe('portable 3MF export', () => {
  it('writes millimeter model XML and converts workspace Y-up to slicer Z-up', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      1, 2, 3,
      4, 5, 6,
      7, 8, 9,
    ], 3));

    const xml = createThreeMfModelXml('Part & fixture', geometry);
    expect(xml).toContain('unit="millimeter"');
    expect(xml).toContain('Part &amp; fixture');
    expect(xml).toContain('<vertex x="1" y="-3" z="2"/>');
    expect(xml).toContain('<triangle v1="0" v2="1" v3="2"/>');
    geometry.dispose();
  });

  it('writes multiple Core 3MF objects and build items without merging piece geometry', () => {
    const left = new THREE.BoxGeometry(10, 8, 6);
    const right = new THREE.BoxGeometry(12, 8, 6);
    right.translate(20, 0, 0);

    const xml = createThreeMfModelXmlFromObjects('split-part', [
      { name: 'piece-x1-y1-z1', geometry: left },
      { name: 'piece-x2-y1-z1', geometry: right },
    ]);

    expect(xml).toContain('<object id="1" type="model" name="piece-x1-y1-z1">');
    expect(xml).toContain('<object id="2" type="model" name="piece-x2-y1-z1">');
    expect(xml).toContain('<item objectid="1"/>');
    expect(xml).toContain('<item objectid="2"/>');

    const { report } = createThreeMfPackageFromGeometries(
      'split-part',
      [
        { name: 'piece-x1-y1-z1', geometry: left },
        { name: 'piece-x2-y1-z1', geometry: right },
      ],
      'occt-wasm-v5',
    );
    expect(report.objectCount).toBe(2);
    expect(report.valid).toBe(true);
    expect(report.triangleCount).toBeGreaterThan(0);

    left.dispose();
    right.dispose();
  });

  it('packages the required OPC/3MF entries without an external ZIP dependency', async () => {
    const geometry = new THREE.BoxGeometry(20, 8, 12);
    const { blob, report } = createThreeMfPackageFromGeometry('test-part', geometry, 'mesh-mvp-v1');
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(storedZipEntryNames(bytes)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      '3D/3dmodel.model',
    ]);
    expect(report.unit).toBe('millimeter');
    expect(report.objectCount).toBe(1);
    expect(report.triangleCount).toBeGreaterThan(0);
    expect(report.fileName).toBe('test-part.3mf');
    geometry.dispose();
  });
});
