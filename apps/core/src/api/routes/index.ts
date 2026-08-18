/**
 * Route surface:
 *
 *   POST   /connections/probe      reachability, version, credential check
 *   GET    /connections/model      content types, components, locales
 *
 *   POST   /backups/plan           dry estimate — counts and sizes
 *   POST   /backups                start a run  -> { jobId }
 *   POST   /restores/plan          the diff a restore would apply
 *   POST   /restores               start a run  -> { jobId }
 *
 *   GET    /jobs/:id               state
 *   GET    /jobs/:id/events        SSE progress stream
 *   DELETE /jobs/:id               cancel
 *
 *   GET    /archives               list archives on a target
 *   POST   /archives/inspect       read a manifest without restoring
 *   POST   /archives/verify        checksum validation
 *
 *   GET    /targets                configured destinations
 *   POST   /targets/test           credential + reachability check
 *
 *   GET    /schedules              cron-scheduled jobs
 *   POST   /schedules
 *   DELETE /schedules/:id
 *
 *   GET    /health                 used by the supervisor's readiness check
 */
export {};
