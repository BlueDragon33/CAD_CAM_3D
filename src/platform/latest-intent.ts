/**
 * Latest-intent wins for asynchronous reads (for example Open Project).
 * A previous read may finish, but may not replace a newer user decision.
 */
export function createLatestIntentGate() {
  let generation = 0;
  return {
    begin(): number {
      generation += 1;
      return generation;
    },
    invalidate(): void {
      generation += 1;
    },
    isCurrent(ticket: number): boolean {
      return ticket === generation;
    },
  };
}
