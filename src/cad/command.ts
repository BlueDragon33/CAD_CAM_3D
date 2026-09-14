import type { Dimensions } from './model';

export type CommandResult = {
  dimensions?: Dimensions;
  message: string;
};

const DIMENSION_PATTERN = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i;

export function interpretCommand(input: string): CommandResult {
  const text = input.trim();
  if (!text) return { message: 'Enter a design instruction.' };

  const match = text.match(DIMENSION_PATTERN);
  if (match) {
    const [width, depth, height] = match.slice(1).map(Number);
    return {
      dimensions: { width, depth, height },
      message: `Updated envelope to ${width} × ${depth} × ${height} mm.`,
    };
  }

  return {
    message: 'Command captured. Natural-language feature planning will plug into this interface next.',
  };
}
