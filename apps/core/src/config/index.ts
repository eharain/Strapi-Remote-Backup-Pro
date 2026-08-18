/**
 * Profiles: a named connection plus a selection plus targets, so a routine backup
 * is `strapi-backup backup --profile production`.
 *
 * Profiles are safe to commit and safe to sync. Secrets never appear in them —
 * only a `secretRef` naming an entry in the credential store, which is DPAPI or
 * Keychain when the desktop app is present and an encrypted local file otherwise.
 * Admin passwords are never persisted by either path.
 *
 * Resolution order: CLI flags > environment > profile file > defaults.
 */
export {};
