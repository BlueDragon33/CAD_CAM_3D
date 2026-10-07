import type { CadProject } from '../cad/model';
import { rebuildProject } from '../cad/rebuild';
import { interpretCommand, type CommandResult, type FeatureCommand } from '../cad/command';

export type DesignCommandTarget = 'global' | 'selected-face' | 'selected-edge' | 'preset-edges';

export type DesignOperation =
  | { kind: 'set-dimensions'; dimensions: NonNullable<CommandResult['dimensions']> }
  | { kind: 'add-feature'; feature: FeatureCommand; target: DesignCommandTarget };

export type DesignProposalStatus = 'ready' | 'blocked' | 'unsupported';

export type DesignProposal = {
  input: string;
  sourceFingerprint: string;
  status: DesignProposalStatus;
  summary: string;
  operations: DesignOperation[];
  diagnostics: string[];
};

export type DesignPlannerContext = {
  project: CadProject;
  selectedTopology: 'face' | 'edge' | null;
};

export function projectProposalFingerprint(project: CadProject) {
  return JSON.stringify({
    id: project.id,
    dimensions: project.dimensions,
    features: project.features,
    printProfile: project.printProfile,
  });
}

function featureTarget(feature: FeatureCommand, selectedTopology: DesignPlannerContext['selectedTopology']): DesignCommandTarget {
  if ((feature.kind === 'hole' || feature.kind === 'cut') && selectedTopology === 'face') return 'selected-face';
  if ((feature.kind === 'fillet' || feature.kind === 'chamfer') && selectedTopology === 'edge') return 'selected-edge';
  if (feature.kind === 'fillet' || feature.kind === 'chamfer') return 'preset-edges';
  return 'global';
}

export function planDesignInstruction(input: string, context: DesignPlannerContext): DesignProposal {
  const result = interpretCommand(input);
  const trimmed = input.trim();
  const sourceFingerprint = projectProposalFingerprint(context.project);

  if (!trimmed) {
    return {
      input,
      sourceFingerprint,
      status: 'unsupported',
      summary: result.message,
      operations: [],
      diagnostics: ['No design instruction was provided.'],
    };
  }

  if (result.dimensions) {
    const values = Object.values(result.dimensions);
    if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
      return {
        input,
        status: 'blocked',
        summary: 'Dimension update is invalid.',
        operations: [],
        diagnostics: ['Width, depth and height must all be finite positive values.'],
      };
    }
    return {
      input,
      sourceFingerprint,
      status: 'ready',
      summary: result.message,
      operations: [{ kind: 'set-dimensions', dimensions: result.dimensions }],
      diagnostics: ['Preview only: project dimensions are not changed until Commit.'],
    };
  }

  if (result.feature) {
    const rebuilt = rebuildProject(context.project);
    if (!rebuilt.hasSolid) {
      return {
        input,
        status: 'blocked',
        summary: result.message,
        operations: [],
        diagnostics: ['Feature creation requires an existing rebuilt solid. Repair the feature history first.'],
      };
    }
    const target = featureTarget(result.feature, context.selectedTopology);
    const targetDiagnostic = target === 'selected-face'
      ? 'Feature will bind to the currently selected supported exact face at commit time.'
      : target === 'selected-edge'
        ? 'Feature will bind to the currently selected exact edge at commit time.'
        : target === 'preset-edges'
          ? 'No exact edge is selected; edge treatment will use the current outer-edge preset.'
          : 'Feature will use global placement.';
    return {
      input,
      sourceFingerprint,
      status: 'ready',
      summary: result.message,
      operations: [{ kind: 'add-feature', feature: result.feature, target }],
      diagnostics: [
        targetDiagnostic,
        'Preview only: canonical CadProject is not mutated until Commit.',
      ],
    };
  }

  return {
    input,
    sourceFingerprint,
    status: 'unsupported',
    summary: result.message,
    operations: [],
    diagnostics: ['The local deterministic planner has no supported typed operation for this instruction yet.'],
  };
}
