/**
 * Prune old archives per a target's retention policy.
 *
 * Runs only after a new archive has been confirmed written. Deleting yesterday's
 * backup before today's has landed is the single most damaging bug a backup tool
 * can have, so ordering here is not an optimisation detail.
 */
export {};
