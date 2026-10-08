import type { Dimensions, FeatureKind } from './model';

export type FeatureCommand =
  | { kind: 'hole'; diameter: number }
  | { kind: 'cut'; width: number; depth: number }
  | { kind: 'fillet'; radius: number }
  | { kind: 'chamfer'; distance: number };

export type CommandResult = {
  dimensions?: Dimensions;
  feature?: FeatureCommand;
  message: string;
};

const DIMENSION_PATTERN = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i;
const HOLE_PATTERN = /(?:hole|lỗ)\s*(?:d|ø|phi|đường\s*kính)?\s*(\d+(?:\.\d+)?)\s*(?:mm)?/i;
const CUT_PATTERN = /(?:cut|pocket|khoét|cắt)\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:mm)?/i;
const FILLET_PATTERN = /(?:fillet|bo\s*góc|bo)\s*(\d+(?:\.\d+)?)\s*(?:mm)?/i;
const CHAMFER_PATTERN = /(?:chamfer|vát\s*mép|vát)\s*(\d+(?:\.\d+)?)\s*(?:mm)?/i;

export function featureKindFromCommand(feature: FeatureCommand): FeatureKind {
  return feature.kind;
}

export function interpretCommand(input: string): CommandResult {
  const text = input.trim();
  if (!text) return { message: 'Enter a design instruction.' };

  const dimensionMatch = text.match(DIMENSION_PATTERN);
  if (dimensionMatch) {
    const [width, depth, height] = dimensionMatch.slice(1).map(Number);
    return {
      dimensions: { width, depth, height },
      message: `Updated master dimensions to ${width} × ${depth} × ${height} mm.`,
    };
  }

  const holeMatch = text.match(HOLE_PATTERN);
  if (holeMatch) {
    const diameter = Number(holeMatch[1]);
    return { feature: { kind: 'hole', diameter }, message: `Added a centered through-hole Ø${diameter} mm.` };
  }

  const cutMatch = text.match(CUT_PATTERN);
  if (cutMatch) {
    const width = Number(cutMatch[1]);
    const depth = Number(cutMatch[2]);
    return { feature: { kind: 'cut', width, depth }, message: `Added a centered through-cut ${width} × ${depth} mm.` };
  }

  const filletMatch = text.match(FILLET_PATTERN);
  if (filletMatch) {
    const radius = Number(filletMatch[1]);
    return { feature: { kind: 'fillet', radius }, message: `Recorded a fillet radius of ${radius} mm.` };
  }

  const chamferMatch = text.match(CHAMFER_PATTERN);
  if (chamferMatch) {
    const distance = Number(chamferMatch[1]);
    return { feature: { kind: 'chamfer', distance }, message: `Recorded a chamfer distance of ${distance} mm.` };
  }

  return {
    message: 'Command captured. This instruction is not in the deterministic MVP grammar yet.',
  };
}
