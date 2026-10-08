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
