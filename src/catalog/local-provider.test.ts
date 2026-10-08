import { describe, expect, it } from 'vitest';
import { validateComponentDefinition } from './model';
import { importLocalComponentCatalog, LocalComponentCatalogProvider } from './local-provider';

const fixture = {
  schemaVersion: 1,
  id: 'synthetic:board-a',
  revision: '1',
  name: 'Synthetic Controller Board',
  manufacturer: 'Fixture Labs',
  partNumber: 'TEST-001',
  category: 'electronics-board',
  envelope: { widthMm: 50, depthMm: 30, heightMm: 8 },
  mountingHoles: [
    { id: 'm1', center: { xMm: -20, yMm: 0, zMm: -10 }, diameterMm: 3.2, axis: 'y', through: true, fastener: 'M3' },
    { id: 'm2', center: { xMm: 20, yMm: 0, zMm: 10 }, diameterMm: 3.2, axis: 'y', through: true, fastener: 'M3' },
  ],
  clearances: [
    {
      id: 'usb',
      kind: 'connector',
      center: { xMm: 25, yMm: 2, zMm: 0 },
      size: { widthMm: 10, depthMm: 12, heightMm: 6 },
      note: 'Synthetic connector clearance only.',
    },
  ],
  massG: 18,
  compatibleFasteners: ['M3'],
  tags: ['robotics', 'fixture'],
  provenance: {
    sourceType: 'synthetic-test',
    sourceName: 'CAD_CAM_3D unit fixture',
  },
} as const;

describe('component knowledge catalog', () => {
  it('validates semantic envelope, mounting and provenance data', () => {
    const component = validateComponentDefinition(fixture);
    expect(component.id).toBe('synthetic:board-a');
    expect(component.mountingHoles).toHaveLength(2);
    expect(component.provenance.sourceType).toBe('synthetic-test');
  });

  it('rejects duplicate mounting identities', () => {
    const invalid = structuredClone(fixture) as any;
    invalid.mountingHoles[1].id = 'm1';
    expect(() => validateComponentDefinition(invalid)).toThrow(/duplicate ids/i);
  });

  it('provides offline search and stable revision lookup', async () => {
    const second = structuredClone(fixture) as any;
    second.revision = '2';
    second.envelope.widthMm = 52;
    const provider = new LocalComponentCatalogProvider('fixture', 'Fixture', [fixture, second]);

    expect(provider.offlineAvailable).toBe(true);
    expect(await provider.search({ category: 'electronics-board', tags: ['robotics'] })).toHaveLength(2);
    expect((await provider.get('synthetic:board-a', '1'))?.envelope.widthMm).toBe(50);
    expect((await provider.get('synthetic:board-a'))?.revision).toBe('2');
  });

  it('imports only validated JSON arrays', async () => {
    const provider = importLocalComponentCatalog(JSON.stringify([fixture]));
    expect(await provider.search({ text: 'Controller' })).toHaveLength(1);
    expect(() => importLocalComponentCatalog('{}')).toThrow(/JSON array/);
  });
});
