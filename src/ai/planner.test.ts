import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../cad/model';
import { planDesignInstruction } from './planner';

describe('bounded design command planner', () => {
  it('previews dimension changes without mutating the project', () => {
    const project = createDefaultProject();
    const before = structuredClone(project.dimensions);
    const proposal = planDesignInstruction('80x50x25', { project, selectedTopology: null });

    expect(proposal.status).toBe('ready');
    expect(proposal.operations).toEqual([
      { kind: 'set-dimensions', dimensions: { width: 80, depth: 50, height: 25 } },
    ]);
    expect(project.dimensions).toEqual(before);
  });

  it('binds Hole intent to a selected face in the proposal without storing runtime topology', () => {
    const project = createDefaultProject();
    const proposal = planDesignInstruction('hole 4mm', { project, selectedTopology: 'face' });

    expect(proposal.status).toBe('ready');
    expect(proposal.operations[0]).toMatchObject({
      kind: 'add-feature',
      feature: { kind: 'hole', diameter: 4 },
      target: 'selected-face',
    });
  });

  it('uses the edge preset when no exact edge is selected', () => {
    const project = createDefaultProject();
    const proposal = planDesignInstruction('fillet 2mm', { project, selectedTopology: null });
    expect(proposal.operations[0]).toMatchObject({
      kind: 'add-feature',
      feature: { kind: 'fillet', radius: 2 },
      target: 'preset-edges',
    });
  });

  it('keeps unsupported natural language non-mutating', () => {
    const project = createDefaultProject();
    const featureCount = project.features.length;
    const proposal = planDesignInstruction('make this lighter but stronger', { project, selectedTopology: null });

    expect(proposal.status).toBe('unsupported');
    expect(proposal.operations).toHaveLength(0);
    expect(project.features).toHaveLength(featureCount);
  });
});
