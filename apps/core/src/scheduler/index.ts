/**
 * Cron scheduling, retention sweeps, and retry.
 *
 * Deliberately lives in the engine rather than in the desktop app, so a CLI user
 * on a headless server gets scheduling too and there is only one scheduler to
 * maintain. The desktop app installs and supervises the OS service; it does not
 * own the timing.
 *
 * Missed runs — laptop asleep, server rebooted — are detected on start and run
 * once on catch-up rather than replayed for every window that elapsed.
 */
export interface Schedule {
  id: string;
  name: string;
  cron: string;
  timezone?: string;
  enabled: boolean;
  request: unknown;
  lastRunAt?: Date;
  nextRunAt?: Date;
}

export {};
