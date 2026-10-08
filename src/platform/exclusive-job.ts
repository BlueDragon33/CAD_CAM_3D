/**
 * UI operation ownership only; not a geometry cancellation mechanism.
 * A stale job retains the exclusive slot until it actually settles.
 */
export type JobTicket = Readonly<{ revision: number }>;

export function createExclusiveJobGate() {
  let active: JobTicket | null = null;
  let revision = 0;

  return {
    tryBegin(): JobTicket | null {
      if (active) return null;
      active = Object.freeze({ revision });
      return active;
    },
    invalidate(): void {
      revision += 1;
    },
    isCurrent(ticket: JobTicket): boolean {
      return ticket === active && ticket.revision === revision;
    },
    finish(ticket: JobTicket): boolean {
      if (ticket !== active) return false;
      active = null;
      return true;
    },
    isBusy(): boolean {
      return active !== null;
    },
  };
}
