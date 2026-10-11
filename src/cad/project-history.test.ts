import { describe, expect, it } from 'vitest';
import { createDefaultProject } from './model';
import {
  applyProjectUpdate,
  createProjectHistory,
  redoProjectHistory,
  replaceProjectHistory,
  undoProjectHistory,
} from './project-history';

describe('project undo/redo history', () => {
  it('records a project mutation and restores it through undo/redo', () => {
    const project = createDefaultProject();
    const initialWidth = project.dimensions.width;
    let history = createProjectHistory(project);

    history = applyProjectUpdate(history, (current) => ({
      ...current,
      dimensions: { ...current.dimensions, width: initialWidth + 10 },
    }));
    expect(history.present.dimensions.width).toBe(initialWidth + 10);
    expect(history.past).toHaveLength(1);
    expect(history.future).toHaveLength(0);

    history = undoProjectHistory(history);
    expect(history.present.dimensions.width).toBe(initialWidth);
    expect(history.future).toHaveLength(1);

    history = redoProjectHistory(history);
    expect(history.present.dimensions.width).toBe(initialWidth + 10);
  });

  it('clears redo after a new mutation following undo', () => {
    const project = createDefaultProject();
    let history = createProjectHistory(project);
    history = applyProjectUpdate(history, (current) => ({
      ...current,
      dimensions: { ...current.dimensions, width: 90 },
    }));
    history = undoProjectHistory(history);
    history = applyProjectUpdate(history, (current) => ({
      ...current,
      dimensions: { ...current.dimensions, width: 70 },
    }));

    expect(history.present.dimensions.width).toBe(70);
    expect(history.future).toHaveLength(0);
  });

  it('does not create history entries for equivalent state', () => {
    const project = createDefaultProject();
    const history = createProjectHistory(project);
    const next = applyProjectUpdate(history, (current) => ({
      ...current,
      dimensions: { ...current.dimensions },
    }));
    expect(next).toBe(history);
  });

  it('bounds stored undo snapshots', () => {
    let history = createProjectHistory(createDefaultProject());
    for (let index = 0; index < 60; index += 1) {
      history = applyProjectUpdate(history, (current) => ({
        ...current,
        dimensions: { ...current.dimensions, width: 100 + index },
      }));
    }
    expect(history.past).toHaveLength(50);
  });

  it('fails closed on invalid history budgets without invoking the mutation', () => {
    const initial = createProjectHistory(createDefaultProject());
    for (const badLimit of [0, -1, 1.5, 51, NaN, Infinity]) {
      let invoked = false;
      expect(() => applyProjectUpdate(initial, (current) => {
        invoked = true;
        return current;
      }, badLimit)).toThrow(RangeError);
      expect(invoked).toBe(false);
      expect(initial.past).toHaveLength(0);
    }
  });

  it('stays bounded and deterministically undoable after 2,000 sequential edits', () => {
    const first = createDefaultProject();
    const startingWidth = first.dimensions.width;
    let history = createProjectHistory(first);
    for (let i = 1; i <= 2000; i += 1) {
      history = applyProjectUpdate(history, (current) => ({
        ...current,
        dimensions: { ...current.dimensions, width: startingWidth + i },
      }));
      expect(history.past.length).toBeLessThanOrEqual(50);
      expect(history.future).toHaveLength(0);
    }
    expect(history.present.dimensions.width).toBe(startingWidth + 2000);
    for (let i = 0; i < 50; i += 1) {
      history = undoProjectHistory(history);
    }
    expect(history.present.dimensions.width).toBe(startingWidth + 1950);
    expect(history.past).toHaveLength(0);
    expect(history.future).toHaveLength(50);
    const atOldest = undoProjectHistory(history);
    expect(atOldest).toBe(history);
    for (let i = 0; i < 50; i += 1) {
      history = redoProjectHistory(history);
    }
    expect(history.present.dimensions.width).toBe(startingWidth + 2000);
    expect(history.past).toHaveLength(50);
    expect(history.future).toHaveLength(0);
  });

  it('clears prior history when a different project is opened/reset', () => {
    let history = createProjectHistory(createDefaultProject());
    history = applyProjectUpdate(history, (current) => ({
      ...current,
      dimensions: { ...current.dimensions, width: 99 },
    }));
    const replacement = createDefaultProject();
    replacement.name = 'Opened Project';
    history = replaceProjectHistory(replacement);

    expect(history.present.name).toBe('Opened Project');
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
  });
});
