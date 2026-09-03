/**
 * How a run looks on a terminal.
 *
 * The engine emits one vocabulary of events; the CLI prints them and the desktop
 * app draws them. Nothing here decides anything — it only chooses words.
 */
import type { JobEvent, RunReport } from '../contracts/index.js';

export function renderEvent(event: JobEvent): void {
  switch (event.type) {
    case 'phase':
      process.stderr.write(`\n${event.phase}${event.detail ? ` — ${event.detail}` : ''}\n`);
      break;
    case 'progress': {
      const total = event.total === undefined ? '' : `/${event.total}`;
      const what = event.contentType ?? event.unit;
      process.stderr.write(`  ${what}: ${event.current}${total} ${event.unit}\n`);
      break;
    }
    case 'warning':
      process.stderr.write(`  ! ${event.message}\n`);
      break;
    case 'log':
      if (event.level === 'error') process.stderr.write(`  ERROR ${event.message}\n`);
      else if (event.level !== 'debug') process.stderr.write(`  ${event.message}\n`);
      break;
    case 'done':
      break;
  }
}

export function renderReport(report: RunReport, destination?: string): void {
  const records = Object.entries(report.recordsByType).filter(([, count]) => count > 0);
  const total = records.reduce((sum, [, count]) => sum + count, 0);

  process.stdout.write('\n');
  process.stdout.write(`${report.state === 'succeeded' ? 'Done' : `Finished with problems (${report.state})`}\n`);
  process.stdout.write(`  ${total} records across ${records.length} content types\n`);
  for (const [uid, count] of records) process.stdout.write(`     ${uid.padEnd(32)} ${count}\n`);
  if (report.mediaFiles > 0) process.stdout.write(`  ${report.mediaFiles} media files\n`);
  if (report.bytesWritten > 0) process.stdout.write(`  ${formatBytes(report.bytesWritten)} written\n`);
  process.stdout.write(`  ${(report.durationMs / 1000).toFixed(1)}s\n`);
  if (destination) process.stdout.write(`  in ${destination}\n`);

  // Warnings are printed in full rather than counted. A backup that skipped
  // something is exactly the thing a summary must not bury.
  if (report.warnings.length > 0) {
    process.stdout.write(`\n${report.warnings.length} warning(s):\n`);
    for (const warning of report.warnings) process.stdout.write(`  ! ${warning}\n`);
  }
  if (report.errors.length > 0) {
    process.stdout.write(`\n${report.errors.length} error(s):\n`);
    for (const error of report.errors) process.stdout.write(`  ERROR ${error}\n`);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
