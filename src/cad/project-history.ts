import type { CadProject } from './model';

export type ProjectHistory = {
  past: CadProject[];
  present: CadProject;
  future: CadProject[];
};

export type ProjectUpdate = CadProject | ((current: CadProject) => CadProject);

const MAX_PROJECT_HISTORY = 50;

function projectEqual(a: CadProject, b: CadProject) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function createProjectHistory(project: CadProject): ProjectHistory {
  return { past: [], present: project, future: [] };
}

export function applyProjectUpdate(
  history: ProjectHistory,
  update: ProjectUpdate,
  limit = MAX_PROJECT_HISTORY,
): ProjectHistory {
  const next = typeof update === 'function' ? update(history.present) : update;
  if (projectEqual(history.present, next)) return history;
  const past = [...history.past, history.present];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
  };
}

export function replaceProjectHistory(project: CadProject): ProjectHistory {
  return createProjectHistory(project);
}

export function undoProjectHistory(history: ProjectHistory): ProjectHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoProjectHistory(history: ProjectHistory): ProjectHistory {
  const next = history.future[0];
  if (!next) return history;
  const past = [...history.past, history.present];
  return {
    past: past.length > MAX_PROJECT_HISTORY ? past.slice(past.length - MAX_PROJECT_HISTORY) : past,
    present: next,
    future: history.future.slice(1),
  };
}
